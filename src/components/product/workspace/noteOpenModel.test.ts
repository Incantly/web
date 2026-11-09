import { afterEach, describe, expect, it, vi } from 'vitest'
import { noteWriteMode } from './liveCollabModel'
import {
  chooseInstantSource, createNoteIntent, createTokenBudget, HOVER_INTENT_MS, isOfflineCopyFresh, liveDocReadiness, OFFLINE_COPY_TRUST_MS,
  olderGenerationRoomIds, outgoingAfterKeyChange, preloadCandidates, sharedWithMeRecord, shouldPreload, TOKEN_INTENT_MS,
} from './noteOpenModel'

describe('chooseInstantSource', () => {
  const cached = { document: 'cached-head' }
  const stored = { document: 'stored-copy', pending: false }

  it('prefers the checkpoint already in the React Query cache', () => {
    expect(chooseInstantSource({ cached, stored, preferPending: true })).toEqual({ source: 'cache', document: 'cached-head' })
  })

  it('falls back to the stored incantly-notes copy when nothing is cached', () => {
    expect(chooseInstantSource({ cached: null, stored, preferPending: true })).toEqual({ source: 'indexeddb', document: 'stored-copy' })
  })

  it('shows nothing when there is no local copy at all', () => {
    expect(chooseInstantSource({ cached: null, stored: null, preferPending: true })).toEqual({ source: 'none', document: null })
  })

  it('shows unsent local edits over the cached head on notes that queue them', () => {
    const pending = { document: 'unsent-edits', pending: true }
    expect(chooseInstantSource({ cached, stored: pending, preferPending: true })).toEqual({ source: 'indexeddb', document: 'unsent-edits' })
  })

  it('keeps the cached head on live notes, whose unsent legacy edits are carried into the room instead', () => {
    const pending = { document: 'unsent-edits', pending: true }
    expect(chooseInstantSource({ cached, stored: pending, preferPending: false })).toEqual({ source: 'cache', document: 'cached-head' })
  })
})

describe('liveDocReadiness', () => {
  const base = { serverSynced: false, offline: 'loaded' as const, offlineTrusted: true, docRoomId: 'note:a:1', currentRoomId: 'note:a:1' }

  it('is editable at once when the doc’s own non-empty offline copy loaded for the room being joined', () => {
    expect(liveDocReadiness(base)).toBe('instant')
  })

  it('never makes a doc for another room ID editable', () => {
    expect(liveDocReadiness({ ...base, currentRoomId: 'note:a:2' })).toBe('loading')
  })

  it('stays read-only while the room ID is not known yet', () => {
    expect(liveDocReadiness({ ...base, currentRoomId: null })).toBe('loading')
  })

  it('stays read-only until the first sync when the offline copy is empty or still loading', () => {
    expect(liveDocReadiness({ ...base, offline: 'empty' })).toBe('loading')
    expect(liveDocReadiness({ ...base, offline: 'loading' })).toBe('loading')
  })

  it('stays read-only until the first sync when the offline copy is not trusted (stale, never synced here)', () => {
    expect(liveDocReadiness({ ...base, offlineTrusted: false })).toBe('loading')
  })

  it('is ready after the first server sync whatever the offline copy held', () => {
    expect(liveDocReadiness({ ...base, serverSynced: true, offline: 'empty' })).toBe('synced')
  })
})

describe('shouldPreload', () => {
  it('skips preloading when the browser asks to save data', () => {
    expect(shouldPreload({ saveData: true, effectiveType: '4g' })).toBe(false)
  })

  it('skips preloading on 2G-class connections', () => {
    expect(shouldPreload({ effectiveType: '2g' })).toBe(false)
    expect(shouldPreload({ effectiveType: 'slow-2g' })).toBe(false)
  })

  it('preloads on ordinary connections and where the Network Information API is missing', () => {
    expect(shouldPreload({ saveData: false, effectiveType: '4g' })).toBe(true)
    expect(shouldPreload(undefined)).toBe(true)
  })
})

describe('preloadCandidates', () => {
  it('picks the most recently updated notes, skipping the open one', () => {
    const notes = [{ id: 'a', updatedAt: 1 }, { id: 'b', updatedAt: 5 }, { id: 'c', updatedAt: 3 }, { id: 'd', updatedAt: 4 }]
    expect(preloadCandidates(notes, { count: 2 })).toEqual(['b', 'd'])
    expect(preloadCandidates(notes, { count: 2, exclude: 'b' })).toEqual(['d', 'c'])
  })
})

describe('isOfflineCopyFresh', () => {
  const now = 10 * OFFLINE_COPY_TRUST_MS
  it('trusts a copy whose room synced on this device within a day', () => {
    expect(isOfflineCopyFresh({ lastSyncedAt: now - 60_000, now, online: true })).toBe(true)
  })
  it('does not trust a weeks-old copy, or one never synced here, while online', () => {
    expect(isOfflineCopyFresh({ lastSyncedAt: now - OFFLINE_COPY_TRUST_MS - 1, now, online: true })).toBe(false)
    expect(isOfflineCopyFresh({ lastSyncedAt: null, now, online: true })).toBe(false)
  })
  it('trusts the copy while the browser is offline (it is all there is; edits sync on reconnect)', () => {
    expect(isOfflineCopyFresh({ lastSyncedAt: null, now, online: false })).toBe(true)
  })
})

describe('olderGenerationRoomIds', () => {
  it('lists only the same note’s older generations', () => {
    const names = ['note:document:a:0', 'note:document:a:1', 'note:document:a:3', 'note:document:b:0', 'incantly-notes']
    expect(olderGenerationRoomIds('note:document:a:2', names)).toEqual(['note:document:a:0', 'note:document:a:1'])
  })
  it('lists nothing for a value that is not a room ID', () => {
    expect(olderGenerationRoomIds('incantly-notes', ['note:document:a:0'])).toEqual([])
  })
})

describe('outgoingAfterKeyChange', () => {
  const slot = { key: 'k1', ready: true, bound: false, document: {} }
  it('keeps the editor just replaced when it was ready, read-only and unbound', () => {
    expect(outgoingAfterKeyChange(slot, true)).toBe(slot)
  })
  it('keeps nothing when the replaced editor was not ready (never an older one), bound, or handoff is off', () => {
    expect(outgoingAfterKeyChange({ ...slot, ready: false }, true)).toBeNull()
    expect(outgoingAfterKeyChange({ ...slot, bound: true }, true)).toBeNull()
    expect(outgoingAfterKeyChange(slot, false)).toBeNull()
  })
})

describe('createTokenBudget', () => {
  it('allows 5 token prefetches per minute, then refuses until the window moves', () => {
    let now = 0
    const budget = createTokenBudget({ now: () => now })
    expect([1, 2, 3, 4, 5].map(() => budget.take())).toEqual([true, true, true, true, true])
    expect(budget.take()).toBe(false)
    now = 59_999
    expect(budget.take()).toBe(false)
    now = 60_000
    expect(budget.take()).toBe(true)
  })
})

describe('createNoteIntent', () => {
  function setup() {
    vi.useFakeTimers()
    const prefetchNote = vi.fn()
    const commitLive = vi.fn()
    const signals: { noteId: string; signal: AbortSignal; settle: () => void }[] = []
    const prefetchLive = vi.fn((noteId: string, signal: AbortSignal) => new Promise<void>((resolve) => { signals.push({ noteId, signal, settle: resolve }) }))
    const intent = createNoteIntent({ prefetchNote, prefetchLive, commitLive })
    return { intent, prefetchNote, prefetchLive, commitLive, signals }
  }
  afterEach(() => { vi.useRealTimers() })

  it('warms the note after the hover delay, and mints a token only after the longer token dwell', () => {
    const { intent, prefetchNote, prefetchLive } = setup()
    intent.hover('a')
    vi.advanceTimersByTime(HOVER_INTENT_MS - 1)
    expect(prefetchNote).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(prefetchNote).toHaveBeenCalledWith('a')
    expect(prefetchLive).not.toHaveBeenCalled()
    vi.advanceTimersByTime(TOKEN_INTENT_MS - HOVER_INTENT_MS)
    expect(prefetchLive).toHaveBeenCalledTimes(1)
  })

  it('cancels when the pointer leaves before the delay', () => {
    const { intent, prefetchNote, prefetchLive } = setup()
    intent.hover('a')
    vi.advanceTimersByTime(100)
    intent.leave('a')
    vi.advanceTimersByTime(1_000)
    expect(prefetchNote).not.toHaveBeenCalled()
    expect(prefetchLive).not.toHaveBeenCalled()
  })

  it('leaving between the warm and token delays warms but never mints', () => {
    const { intent, prefetchNote, prefetchLive } = setup()
    intent.hover('a')
    vi.advanceTimersByTime(200)
    intent.leave('a')
    vi.advanceTimersByTime(1_000)
    expect(prefetchNote).toHaveBeenCalledTimes(1)
    expect(prefetchLive).not.toHaveBeenCalled()
  })

  it('replaces a pending hover with the newer one', () => {
    const { intent, prefetchNote } = setup()
    intent.hover('a')
    vi.advanceTimersByTime(100)
    intent.hover('b')
    vi.advanceTimersByTime(HOVER_INTENT_MS)
    expect(prefetchNote.mock.calls).toEqual([['b']])
  })

  it('warms at once on keyboard focus, but mints only if focus stays for the token dwell', () => {
    const { intent, prefetchNote, prefetchLive } = setup()
    intent.focus('a')
    expect(prefetchNote).toHaveBeenCalledWith('a')
    expect(prefetchLive).not.toHaveBeenCalled()
    intent.leave('a')
    vi.advanceTimersByTime(1_000)
    expect(prefetchLive).not.toHaveBeenCalled()
    intent.focus('a')
    vi.advanceTimersByTime(TOKEN_INTENT_MS)
    expect(prefetchLive).toHaveBeenCalledTimes(1)
  })

  it('runs live preparation (token prefetch) for one note at a time, aborting the previous one', () => {
    const { intent, prefetchLive, signals } = setup()
    intent.hover('a')
    vi.advanceTimersByTime(TOKEN_INTENT_MS)
    intent.hover('b')
    vi.advanceTimersByTime(TOKEN_INTENT_MS)
    expect(prefetchLive.mock.calls.map(([noteId]) => noteId)).toEqual(['a', 'b'])
    expect(signals[0]?.signal.aborted).toBe(true)
    expect(signals[1]?.signal.aborted).toBe(false)
  })

  it('does not prepare the same note twice while its preparation is in flight, but may after it settles', async () => {
    const { intent, prefetchLive, signals } = setup()
    intent.focus('a')
    vi.advanceTimersByTime(TOKEN_INTENT_MS)
    intent.focus('a')
    vi.advanceTimersByTime(TOKEN_INTENT_MS)
    expect(prefetchLive).toHaveBeenCalledTimes(1)
    signals[0]?.settle()
    await vi.runAllTimersAsync()
    intent.focus('a')
    vi.advanceTimersByTime(TOKEN_INTENT_MS)
    expect(prefetchLive).toHaveBeenCalledTimes(2)
  })

  it('a click commits the preparation in flight: leaving the list no longer aborts it', () => {
    const { intent, commitLive, signals } = setup()
    intent.hover('a')
    vi.advanceTimersByTime(TOKEN_INTENT_MS)
    intent.commit('a')
    expect(commitLive).toHaveBeenCalledWith('a')
    intent.cancelAll()
    expect(signals[0]?.signal.aborted).toBe(false)
  })

  it('a click before the token dwell cancels the pending token prefetch (the join authorizes itself)', () => {
    const { intent, prefetchLive, commitLive } = setup()
    intent.hover('a')
    vi.advanceTimersByTime(200)
    intent.commit('a')
    vi.advanceTimersByTime(1_000)
    expect(prefetchLive).not.toHaveBeenCalled()
    expect(commitLive).not.toHaveBeenCalled()
  })

  it('cancelAll drops pending timers and aborts uncommitted live preparation', () => {
    const { intent, prefetchNote, signals } = setup()
    intent.focus('a')
    vi.advanceTimersByTime(TOKEN_INTENT_MS)
    intent.hover('b')
    intent.cancelAll()
    vi.advanceTimersByTime(1_000)
    expect(prefetchNote.mock.calls).toEqual([['a']])
    expect(signals[0]?.signal.aborted).toBe(true)
  })
})

describe('sharedWithMeRecord (grantee shared flag)', () => {
  it('marks a note shared with the caller as shared, so it opens pending and read-only, never in legacy sync', () => {
    const record = sharedWithMeRecord({ note: { id: 'n', title: 'Shared', updatedAt: '2026-01-01T00:00:00.000Z' } })
    expect(record.shared).toBe(true)
    expect(noteWriteMode({ verdict: undefined, listShared: record.shared, forcedLive: false, previous: null })).toBe('pending')
  })
})
