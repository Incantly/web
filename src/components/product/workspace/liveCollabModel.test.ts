import { describe, expect, it } from 'vitest'
import {
  LIVE_CONNECTION_COPY,
  ROOM_FULL_NOTICE,
  authorizeDegradedNotice,
  canPollSavedSync,
  createSingleDisposer,
  initialsFor,
  liveBackoffMs,
  livePausedNotice,
  liveblocksUserId,
  mapCollaborators,
  mapMentionSuggestions,
  noteIdFromRoomId,
  parseRoomEvent,
  restoredNotice,
  savedSyncBackoffMs,
  shouldClearLiveNoticeOnRecovery,
  shouldFastForwardSavedSync,
} from './liveCollabModel'

describe('noteIdFromRoomId', () => {
  it('parses note:{noteId}:{generation}, keeping colons inside the note id', () => {
    expect(noteIdFromRoomId('note:document:01j9zq6y9f7w8e5r6t3y2u1i0o:0')).toBe('document:01j9zq6y9f7w8e5r6t3y2u1i0o')
    expect(noteIdFromRoomId('note:n1:12')).toBe('n1')
  })

  it('rejects anything that is not a room id', () => {
    expect(noteIdFromRoomId('n1')).toBeNull()
    expect(noteIdFromRoomId('room:n1:0')).toBeNull()
    expect(noteIdFromRoomId('note::0')).toBeNull()
    expect(noteIdFromRoomId('note:n1:')).toBeNull()
    expect(noteIdFromRoomId('note:n1')).toBeNull()
    expect(noteIdFromRoomId('note:n1:01')).toBeNull()
    expect(noteIdFromRoomId('note:n1:-1')).toBeNull()
    expect(noteIdFromRoomId('note:n1:next')).toBeNull()
  })

  it('namespaces bare user ids for resolveUsers', () => {
    expect(liveblocksUserId('u1')).toBe('user:u1')
  })
})

describe('liveBackoffMs', () => {
  it('grows 1s, 2s, 4s… and caps at 30s', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 10].map(liveBackoffMs)).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000])
  })

  it('clamps negative and fractional attempts', () => {
    expect(liveBackoffMs(-2)).toBe(1000)
    expect(liveBackoffMs(1.9)).toBe(2000)
  })
})

describe('savedSyncBackoffMs', () => {
  it('grows 5s doubling to a 60s cap', () => {
    expect([0, 1, 2, 3, 4].map(savedSyncBackoffMs)).toEqual([5000, 10000, 20000, 40000, 60000])
  })
})

describe('canPollSavedSync', () => {
  it.each([
    [{ shared: true, visible: true, stopped: false }, true],
    [{ shared: false, visible: true, stopped: false }, false],
    [{ shared: true, visible: false, stopped: false }, false],
    [{ shared: true, visible: true, stopped: true }, false],
    [{ shared: false, visible: false, stopped: true }, false],
  ])('polls only for shared notes in a visible tab on a live session: %o → %s', (gate, expected) => {
    expect(canPollSavedSync(gate)).toBe(expected)
  })
})

describe('shouldFastForwardSavedSync', () => {
  it.each([
    [{ pending: 0, status: 'saved' }, true],
    [{ pending: 0, status: 'saving' }, true],
    [{ pending: 2, status: 'saved' }, false],
    [{ pending: 1, status: 'saving' }, false],
    [{ pending: 0, status: 'conflict' }, false],
    [{ pending: 3, status: 'conflict' }, false],
    [{ pending: 0, status: 'error' }, false],
    [{ pending: 0, status: 'offline' }, false],
    [{ pending: 0, status: 'denied' }, false],
    [{ pending: 0, status: 'gone' }, false],
  ] as const)('fast-forwards only with no pending work on a settled state: %o → %s', (state, expected) => {
    expect(shouldFastForwardSavedSync(state)).toBe(expected)
  })
})

describe('initialsFor', () => {
  it('takes the first letters of the first two words', () => {
    expect(initialsFor('Ada Lovelace')).toBe('AL')
    expect(initialsFor('ada')).toBe('A')
    expect(initialsFor('  Jean-Luc Picard  ')).toBe('JP')
  })

  it('falls back to a placeholder for empty names', () => {
    expect(initialsFor('')).toBe('?')
    expect(initialsFor('   ')).toBe('?')
  })
})

describe('mapMentionSuggestions', () => {
  it('maps resolved users to id, name and initials', () => {
    expect(mapMentionSuggestions([
      { id: 'user:u1', name: 'Ada Lovelace', color: '#2b62d9', avatarUrl: null },
      { id: 'agent:a1', name: 'Quizzer', color: '#1a6b34' },
    ])).toEqual([
      { id: 'user:u1', name: 'Ada Lovelace', initials: 'AL' },
      { id: 'agent:a1', name: 'Quizzer', initials: 'Q' },
    ])
  })
})

describe('mapCollaborators', () => {
  it('maps room others to the avatar stack, naming the unresolved', () => {
    expect(mapCollaborators([
      { id: 'user:u1', name: 'Ada Lovelace' },
      { id: 42, name: null },
      { id: 'user:u2', name: '   ' },
    ])).toEqual([
      { id: 'user:u1', name: 'Ada Lovelace', initials: 'AL' },
      { id: '42', name: 'Collaborator', initials: 'C' },
      { id: 'user:u2', name: 'Collaborator', initials: 'C' },
    ])
  })
})

describe('LIVE_CONNECTION_COPY', () => {
  it('names every connection state', () => {
    expect(LIVE_CONNECTION_COPY).toEqual({ connecting: 'Connecting…', live: 'Live', reconnecting: 'Reconnecting…', unavailable: 'Unavailable' })
  })
})

describe('livePausedNotice', () => {
  const formatDate = (iso: string) => `on ${iso}`

  it('stays silent on live and unshared notes', () => {
    expect(livePausedNotice({ mode: 'live', reason: undefined, resetsAt: undefined }, formatDate)).toBeNull()
    expect(livePausedNotice({ mode: 'saved_sync', reason: 'NOT_SHARED', resetsAt: undefined }, formatDate)).toBeNull()
  })

  it('names the budget reset date when the pause carries one', () => {
    expect(livePausedNotice({ mode: 'saved_sync', reason: 'BUDGET_EXHAUSTED', resetsAt: '2026-12-01T00:00:00.000Z' }, formatDate))
      .toBe('Live cursors are paused until on 2026-12-01T00:00:00.000Z. Your changes still save.')
    expect(livePausedNotice({ mode: 'saved_sync', reason: 'BUDGET_EXHAUSTED', resetsAt: undefined }, formatDate))
      .toBe('Live cursors are paused for now. Your changes still save.')
    expect(livePausedNotice({ mode: 'saved_sync', reason: 'GUARD_PAUSED', resetsAt: '2026-12-01T00:00:00.000Z' }, formatDate))
      .toBe('Live collaboration is paused. Your changes still save.')
  })
})

describe('authorizeDegradedNotice', () => {
  it('stays silent where another flow owns the state', () => {
    expect(authorizeDegradedNotice('NOTE_NOT_SHARED')).toBeNull()
    expect(authorizeDegradedNotice('NOTE_ACCESS_DENIED')).toBeNull()
    expect(authorizeDegradedNotice('NOTE_NOT_FOUND')).toBeNull()
  })

  it('explains pauses and limits as saved-sync-only', () => {
    expect(authorizeDegradedNotice('LIVE_COLLABORATION_LIMIT_REACHED')).toBe('Live cursors are paused for now. Your changes still save.')
    expect(authorizeDegradedNotice('LIVE_COLLABORATION_PAUSED')).toBe('Live collaboration is paused. Your changes still save.')
    expect(authorizeDegradedNotice('LIVE_COLLABORATION_UNAVAILABLE')).toBe('Live collaboration is paused. Your changes still save.')
  })

  it('falls back to a generic notice for unknown and network failures', () => {
    expect(authorizeDegradedNotice('SOME_NEW_CODE')).toBe('Live collaboration isn’t available right now. Your changes still save.')
    expect(authorizeDegradedNotice(null)).toBe('Live collaboration isn’t available right now. Your changes still save.')
  })

  it('names the full room exactly', () => {
    expect(ROOM_FULL_NOTICE).toBe('This note is full (10 people). Your changes still save.')
  })
})

describe('parseRoomEvent', () => {
  it('narrows the known broadcasts', () => {
    expect(parseRoomEvent({ type: 'ACCESS_CHANGED', noteId: 'n1', generation: 2 })).toEqual({ type: 'ACCESS_CHANGED', noteId: 'n1', generation: 2 })
    expect(parseRoomEvent({ type: 'RESTORED', noteId: 'n1', revisionId: 'r1', actorUserId: 'u1', restoredAt: '2026-01-01T14:05:00.000Z' }))
      .toEqual({ type: 'RESTORED', noteId: 'n1', revisionId: 'r1', actorUserId: 'u1', restoredAt: '2026-01-01T14:05:00.000Z' })
  })

  it('rejects malformed and unknown payloads', () => {
    expect(parseRoomEvent(null)).toBeNull()
    expect(parseRoomEvent('RESTORED')).toBeNull()
    expect(parseRoomEvent({ type: 'RESTORED', noteId: 'n1' })).toBeNull()
    expect(parseRoomEvent({ type: 'ACCESS_CHANGED', noteId: 'n1', generation: '2' })).toBeNull()
    expect(parseRoomEvent({ type: 'SOME_FUTURE_EVENT' })).toBeNull()
  })
})

describe('restoredNotice', () => {
  const formatTime = () => '14:05'

  it('names who restored and when', () => {
    expect(restoredNotice('Ada', '2026-01-01T14:05:00.000Z', formatTime)).toBe('Ada restored the version from 14:05.')
  })

  it('falls back when the actor cannot be resolved', () => {
    expect(restoredNotice(null, '2026-01-01T14:05:00.000Z', formatTime)).toBe('A collaborator restored the version from 14:05.')
    expect(restoredNotice('  ', '2026-01-01T14:05:00.000Z', formatTime)).toBe('A collaborator restored the version from 14:05.')
  })
})

describe('shouldClearLiveNoticeOnRecovery', () => {
  it('clears only pause/degraded notices, never restore, full-room, or empty ones', () => {
    expect(shouldClearLiveNoticeOnRecovery('paused')).toBe(true)
    expect(shouldClearLiveNoticeOnRecovery('full')).toBe(false)
    expect(shouldClearLiveNoticeOnRecovery('restored')).toBe(false)
    expect(shouldClearLiveNoticeOnRecovery(null)).toBe(false)
  })
})

describe('createSingleDisposer', () => {
  it('starts disarmed; disarming twice is safe', () => {
    const slot = createSingleDisposer()
    expect(slot.armed).toBe(false)
    expect(() => { slot.disarm(); slot.disarm() }).not.toThrow()
    expect(slot.armed).toBe(false)
  })

  it('replace disarms the previous cleanup instead of accumulating', () => {
    const slot = createSingleDisposer()
    const calls: string[] = []
    slot.replace(() => { calls.push('first') })
    expect(slot.armed).toBe(true)
    slot.replace(() => { calls.push('second') })
    expect(calls).toEqual(['first'])
    expect(slot.armed).toBe(true)
    slot.disarm()
    expect(calls).toEqual(['first', 'second'])
    expect(slot.armed).toBe(false)
  })

  it('re-arming after disarm works', () => {
    const slot = createSingleDisposer()
    let count = 0
    slot.replace(() => { count += 1 })
    slot.disarm()
    expect(count).toBe(1)
    slot.replace(() => { count += 10 })
    slot.disarm()
    expect(count).toBe(11)
    expect(slot.armed).toBe(false)
  })
})
