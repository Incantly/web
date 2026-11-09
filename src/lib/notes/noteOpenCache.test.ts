import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const checkpointReads = vi.fn()
vi.mock('../api/notes', () => ({
  notesApi: {
    get: async (noteId: string) => ({ id: noteId, canEdit: true }),
    checkpoint: (noteId: string) => checkpointReads(noteId),
  },
}))
vi.mock('../api/live', () => ({ liveApi: { liveStatus: async () => ({ mode: 'live', offlineEnabled: true }) } }))

const cache = await import('./noteOpenCache')

const checkpoint = (revisionNumber: number) => ({ revision: { revisionNumber }, document: { content: [] }, etag: null }) as unknown as import('./noteOpenCache').CachedCheckpoint

describe('note open cache', () => {
  let client: QueryClient
  let unregister: () => void
  beforeEach(() => {
    client = new QueryClient()
    unregister = cache.registerNoteQueryClient(client)
    checkpointReads.mockReset()
  })
  afterEach(() => { cache.clearNoteQueryCaches(); unregister() })

  it('reads each of metadata and checkpoint once per open, shared by both mounts of the same open', async () => {
    checkpointReads.mockResolvedValue(checkpoint(3))
    await Promise.all([cache.loadNoteForOpen(client, 'u', 'n'), cache.loadNoteForOpen(client, 'u', 'n')])
    expect(checkpointReads).toHaveBeenCalledTimes(1)
  })

  it('never shows a cached checkpoint older than a revision this tab saw acknowledged', () => {
    cache.rememberCheckpoint(client, 'u', 'n', checkpoint(3))
    expect(cache.cachedCheckpoint(client, 'u', 'n')?.revision.revisionNumber).toBe(3)
    cache.acknowledgeNoteRevision(client, 'u', 'n', 4)
    expect(cache.cachedCheckpoint(client, 'u', 'n')).toBeNull()
    // An older read arriving later is not cached either.
    cache.rememberCheckpoint(client, 'u', 'n', checkpoint(3))
    expect(cache.cachedCheckpoint(client, 'u', 'n')).toBeNull()
    cache.rememberCheckpoint(client, 'u', 'n', checkpoint(4))
    expect(cache.cachedCheckpoint(client, 'u', 'n')?.revision.revisionNumber).toBe(4)
  })

  it('an open after an acknowledged save reads the checkpoint again instead of reusing the older one', async () => {
    checkpointReads.mockResolvedValueOnce(checkpoint(3)).mockResolvedValueOnce(checkpoint(5))
    await cache.loadNoteForOpen(client, 'u', 'n')
    cache.acknowledgeNoteRevision(client, 'u', 'n', 5)
    const [, latest] = await cache.loadNoteForOpen(client, 'u', 'n')
    expect(checkpointReads).toHaveBeenCalledTimes(2)
    expect(latest.revision.revisionNumber).toBe(5)
  })

  it('forgetNoteOpen drops every cached read of the note (after writes, or a document that failed the gate)', async () => {
    checkpointReads.mockResolvedValue(checkpoint(3))
    await cache.loadNoteForOpen(client, 'u', 'n')
    cache.forgetNoteOpen(client, 'u', 'n')
    expect(cache.cachedCheckpoint(client, 'u', 'n')).toBeNull()
    expect(client.getQueryData(cache.noteMetadataKey('u', 'n'))).toBeUndefined()
  })

  it('sign-out removes note queries from every registered client, and nothing else', () => {
    cache.rememberCheckpoint(client, 'u', 'n', checkpoint(3))
    client.setQueryData(['notes', 'u'], { pages: [] })
    client.setQueryData(['billing'], { plan: 'free' })
    cache.clearNoteQueryCaches()
    expect(cache.cachedCheckpoint(client, 'u', 'n')).toBeNull()
    expect(client.getQueryData(['notes', 'u'])).toBeUndefined()
    expect(client.getQueryData(['billing'])).toEqual({ plan: 'free' })
  })

  it('keys carry the user, so another account never reads these bodies', () => {
    cache.rememberCheckpoint(client, 'u', 'n', checkpoint(3))
    expect(cache.cachedCheckpoint(client, 'other', 'n')).toBeNull()
  })
})
