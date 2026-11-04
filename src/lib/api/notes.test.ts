import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { configureApiClient } from './client'
import { isSharedNote, notesApi } from './notes'

function json(status: number, body?: unknown, headers: Record<string, string> = {}) {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
}

let replies: Response[]
let fetchMock: ReturnType<typeof vi.fn>
let restore: () => void

beforeEach(() => {
  replies = []
  fetchMock = vi.fn(async () => replies.shift() ?? json(500, { code: 'HTTP_500' }))
  restore = configureApiClient({ fetch: fetchMock as unknown as typeof fetch, sleep: async () => {} })
})
afterEach(() => restore())

const headerOf = (call: number, name: string) => (fetchMock.mock.calls[call][1] as RequestInit & { headers: Headers }).headers.get(name)

describe('notesApi.checkpoint', () => {
  it('returns the checkpoint with the ETag for a later conditional read', async () => {
    replies.push(json(200, { revision: { revisionNumber: 3 }, document: { id: 'n1' } }, { ETag: '"r3"' }))
    const read = await notesApi.checkpoint('n1')
    expect(read).toMatchObject({ etag: '"r3"', revision: { revisionNumber: 3 }, document: { id: 'n1' } })
    expect(headerOf(0, 'If-None-Match')).toBeNull()
  })

  it('sends If-None-Match and surfaces 200 as a fresh checkpoint', async () => {
    replies.push(json(200, { revision: { revisionNumber: 4 }, document: { id: 'n1' } }, { ETag: '"r4"' }))
    const read = await notesApi.checkpoint('n1', undefined, '"r3"')
    expect(headerOf(0, 'If-None-Match')).toBe('"r3"')
    expect(read).toMatchObject({ notModified: false, etag: '"r4"', revision: { revisionNumber: 4 } })
  })

  it('surfaces 304 as not-modified without a body', async () => {
    replies.push(json(304, undefined, { ETag: '"r3"' }))
    const read = await notesApi.checkpoint('n1', undefined, '"r3"')
    expect(headerOf(0, 'If-None-Match')).toBe('"r3"')
    expect(read).toEqual({ notModified: true, etag: '"r3"' })
  })
})

describe('notesApi.trash', () => {
  it('lists the trash newest first with cursor paging', async () => {
    replies.push(json(200, { items: [{ id: 'note:1' }], nextCursor: 'c1' }))
    const page = await notesApi.trash({ limit: 25 })
    expect(fetchMock.mock.calls[0][0]).toBe('/v1/notes/trash?limit=25')
    expect(page).toEqual({ items: [{ id: 'note:1' }], nextCursor: 'c1' })
  })

  it('passes the cursor through for later pages', async () => {
    replies.push(json(200, { items: [], nextCursor: null }))
    await notesApi.trash({ cursor: 'c1' })
    expect(fetchMock.mock.calls[0][0]).toBe('/v1/notes/trash?limit=25&cursor=c1')
  })
})

describe('notesApi.restoreTrash', () => {
  it('restores with POST and no body', async () => {
    replies.push(json(200, { id: 'note:1', title: 'Back' }))
    const note = await notesApi.restoreTrash('note:1')
    expect(fetchMock.mock.calls[0][0]).toBe('/v1/notes/note%3A1/restore')
    const init = fetchMock.mock.calls[0][1] as RequestInit & { headers: Headers }
    expect(init.method).toBe('POST')
    expect(init.body).toBeUndefined()
    expect(init.headers.get('Content-Type')).toBeNull()
    expect(note).toEqual({ id: 'note:1', title: 'Back' })
  })

  it('routes NOTE_NOT_DELETED to the caller without retrying', async () => {
    replies.push(json(409, { code: 'NOTE_NOT_DELETED' }))
    await expect(notesApi.restoreTrash('note:1')).rejects.toMatchObject({ code: 'NOTE_NOT_DELETED' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('routes NOTE_NOT_FOUND to the caller without retrying', async () => {
    replies.push(json(404, { code: 'NOTE_NOT_FOUND' }))
    await expect(notesApi.restoreTrash('note:gone')).rejects.toMatchObject({ code: 'NOTE_NOT_FOUND' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('notesApi.sharedWithMe', () => {
  it('lists shared notes with cursor paging', async () => {
    replies.push(json(200, { items: [{ id: 'grant:1' }], nextCursor: null }))
    const page = await notesApi.sharedWithMe({})
    expect(fetchMock.mock.calls[0][0]).toBe('/v1/notes/shared-with-me?limit=25')
    expect(page.items).toEqual([{ id: 'grant:1' }])
  })
})

describe('isSharedNote', () => {
  it('is true exactly when collaboration is present', () => {
    expect(isSharedNote({ collaboration: { roomId: 'note:n1:1' } })).toBe(true)
    expect(isSharedNote({})).toBe(false)
    expect(isSharedNote({ collaboration: undefined })).toBe(false)
    expect(isSharedNote(null)).toBe(false)
    expect(isSharedNote(undefined)).toBe(false)
  })
})
