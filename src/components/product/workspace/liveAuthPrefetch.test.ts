import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Deferred = { noteId: string; signal: AbortSignal; resolve: (value: { roomId: string; token: string }) => void }
const calls: Deferred[] = []

vi.mock('@/lib/api/live', () => ({
  liveApi: {
    authorize: (noteId: string, signal: AbortSignal) => new Promise((resolve) => { calls.push({ noteId, signal, resolve }) }),
  },
}))

const { commitLiveAuthPrefetch, logoutLiveblocks, pendingLiveAuthPrefetch, prefetchLiveAuth, PREFETCHED_TOKEN_REUSE_MS, takePrefetchedLiveAuth } = await import('./liveblocksClient')

async function minted(noteId: string, roomId: string) {
  const done = prefetchLiveAuth(noteId)
  calls.at(-1)?.resolve({ roomId, token: `token-${noteId}` })
  await done
}

describe('prefetchLiveAuth (hover token prefetch)', () => {
  beforeEach(() => { calls.length = 0; logoutLiveblocks() })
  afterEach(() => { vi.useRealTimers(); logoutLiveblocks() })

  it('keeps a token for the hovered note, used by exactly one join for the same room ID', async () => {
    await minted('a', 'note:a:1')
    expect(takePrefetchedLiveAuth('b', 'note:b:1')).toBeNull()
    expect(takePrefetchedLiveAuth('a', 'note:a:1')).toEqual({ roomId: 'note:a:1', token: 'token-a' })
    expect(takePrefetchedLiveAuth('a', 'note:a:1')).toBeNull()
  })

  it('never uses a token for a room other than the one the fresh live-status reports (rotation)', async () => {
    await minted('a', 'note:a:1')
    expect(takePrefetchedLiveAuth('a', 'note:a:2')).toBeNull()
    // The mismatched token is dropped, not kept for later.
    expect(takePrefetchedLiveAuth('a', 'note:a:1')).toBeNull()
  })

  it('reuses a prefetched token for about a minute only', async () => {
    vi.useFakeTimers()
    await minted('a', 'note:a:1')
    vi.advanceTimersByTime(PREFETCHED_TOKEN_REUSE_MS)
    expect(takePrefetchedLiveAuth('a', 'note:a:1')).toBeNull()
  })

  it('prefetches for one note at a time: a newer note aborts the older request and its token is dropped', async () => {
    const first = prefetchLiveAuth('a')
    const second = prefetchLiveAuth('b')
    expect(calls.map((call) => call.noteId)).toEqual(['a', 'b'])
    expect(calls[0]?.signal.aborted).toBe(true)
    calls[0]?.resolve({ roomId: 'note:a:1', token: 'token-a' })
    calls[1]?.resolve({ roomId: 'note:b:1', token: 'token-b' })
    await Promise.all([first, second])
    expect(takePrefetchedLiveAuth('a', 'note:a:1')).toBeNull()
    expect(takePrefetchedLiveAuth('b', 'note:b:1')).toEqual({ roomId: 'note:b:1', token: 'token-b' })
  })

  it('never re-mints while the note’s prefetched token is valid, and shares a request in flight', async () => {
    const first = prefetchLiveAuth('a')
    const again = prefetchLiveAuth('a')
    expect(calls).toHaveLength(1)
    calls[0]?.resolve({ roomId: 'note:a:1', token: 'token-a' })
    await Promise.all([first, again])
    await prefetchLiveAuth('a')
    expect(calls).toHaveLength(1)
  })

  it('spends at most 5 authorizes per minute on prefetching', async () => {
    for (const noteId of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) await minted(noteId, `note:${noteId}:1`)
    expect(calls.map((call) => call.noteId)).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('drops the token when the caller aborts before a click (pointer moved to another note)', async () => {
    const controller = new AbortController()
    const done = prefetchLiveAuth('a', controller.signal)
    controller.abort()
    expect(calls[0]?.signal.aborted).toBe(true)
    calls[0]?.resolve({ roomId: 'note:a:1', token: 'token-a' })
    await done
    expect(takePrefetchedLiveAuth('a', 'note:a:1')).toBeNull()
  })

  it('a click commits the prefetch: leaving the list or hovering another note no longer aborts it', async () => {
    const controller = new AbortController()
    const done = prefetchLiveAuth('a', controller.signal)
    commitLiveAuthPrefetch('a')
    controller.abort()
    await prefetchLiveAuth('b')
    expect(calls.map((call) => call.noteId)).toEqual(['a'])
    expect(calls[0]?.signal.aborted).toBe(false)
    calls[0]?.resolve({ roomId: 'note:a:1', token: 'token-a' })
    await done
    expect(takePrefetchedLiveAuth('a', 'note:a:1')).toEqual({ roomId: 'note:a:1', token: 'token-a' })
  })

  it('the join waiting on a prefetch commits it too', () => {
    const controller = new AbortController()
    void prefetchLiveAuth('a', controller.signal)
    expect(pendingLiveAuthPrefetch('a')).not.toBeNull()
    expect(pendingLiveAuthPrefetch('b')).toBeNull()
    controller.abort()
    expect(calls[0]?.signal.aborted).toBe(false)
  })

  it('sign-out drops the prefetched token', async () => {
    await minted('a', 'note:a:1')
    logoutLiveblocks()
    expect(takePrefetchedLiveAuth('a', 'note:a:1')).toBeNull()
  })
})
