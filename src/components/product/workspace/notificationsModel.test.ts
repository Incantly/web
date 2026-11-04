import { describe, expect, it } from 'vitest'
import { ApiError } from '../../../lib/api/errors'
import type { InboxNotificationDto, NotificationPreferencesDto } from '../../../lib/api/notifications'
import {
  allMarkedRead,
  applyMuteState,
  combinedUnread,
  formatBadgeCount,
  isGoneNotification,
  isNoteMuted,
  isThreadMuted,
  markedRead,
  notificationAction,
  notificationActorId,
  notificationErrorCopy,
  notificationTarget,
  threadParamFromSearch,
  unreadCount,
  withoutNotification,
} from './notificationsModel'

function row(overrides: Partial<InboxNotificationDto> = {}): InboxNotificationDto {
  return { id: 'n1', type: 'note.shared', payload: {}, createdAt: '2026-01-01T00:00:00.000Z', readAt: null, ...overrides }
}

const prefs = (overrides: Partial<NotificationPreferencesDto> = {}): NotificationPreferencesDto => ({
  emailEnabledAll: true,
  notes: [],
  threads: [],
  ...overrides,
})

describe('unreadCount / combinedUnread / formatBadgeCount', () => {
  it('counts only rows with no readAt', () => {
    expect(unreadCount([row(), row({ id: 'n2', readAt: '2026-01-02T00:00:00.000Z' }), row({ id: 'n3' })])).toBe(2)
    expect(unreadCount([])).toBe(0)
  })

  it('merges both inboxes, defaulting the Liveblocks half to zero', () => {
    expect(combinedUnread(3)).toBe(3)
    expect(combinedUnread(3, 2)).toBe(5)
  })

  it('caps the badge at 99+', () => {
    expect(formatBadgeCount(0)).toBe('0')
    expect(formatBadgeCount(99)).toBe('99')
    expect(formatBadgeCount(100)).toBe('99+')
  })
})

describe('local read state', () => {
  it('marks one row read and leaves the rest', () => {
    const next = markedRead([row(), row({ id: 'n2' })], 'n2', '2026-01-03T00:00:00.000Z')
    expect(next[0].readAt).toBeNull()
    expect(next[1].readAt).toBe('2026-01-03T00:00:00.000Z')
  })

  it('marks everything read but keeps existing read stamps', () => {
    const next = allMarkedRead([row(), row({ id: 'n2', readAt: 'earlier' })], 'now')
    expect(next.map((item) => item.readAt)).toEqual(['now', 'earlier'])
  })

  it('drops a gone row', () => {
    expect(withoutNotification([row(), row({ id: 'n2' })], 'n1')).toEqual([row({ id: 'n2' })])
  })
})

describe('notificationTarget / notificationActorId', () => {
  it('reads note and thread IDs from the payload', () => {
    expect(notificationTarget({ noteId: 'note:1', threadId: 'th_1' })).toEqual({ noteId: 'note:1', threadId: 'th_1' })
  })

  it('ignores non-string IDs and missing payloads', () => {
    expect(notificationTarget({ noteId: 42, threadId: '' })).toEqual({ noteId: null, threadId: null })
    expect(notificationTarget(null as unknown as Record<string, unknown>)).toEqual({ noteId: null, threadId: null })
  })

  it('reads the actor ID when present', () => {
    expect(notificationActorId({ actorUserId: 'u1' })).toBe('u1')
    expect(notificationActorId({})).toBeNull()
  })
})

describe('notificationAction', () => {
  it.each([
    ['note.shared', 'shared a note with you', 'person'],
    ['note.invitation', 'invited you to a note', 'person'],
    ['note.access_removed', 'removed your access to a note', 'person'],
    ['collaboration.checkpoint_quarantined', 'A change needs your review', 'system'],
    ['collaboration.live_budget_80', '80% of your live minutes', 'system'],
    ['something.new', 'sent you an update', 'person'],
  ] as const)('%s renders "%s"', (type, text, actor) => {
    const action = notificationAction(type)
    expect(action.text).toContain(text)
    expect(action.actor).toBe(actor)
  })
})

describe('threadParamFromSearch', () => {
  it('reads ?thread= with or without the leading question mark', () => {
    expect(threadParamFromSearch('?note=note:1&thread=th_1')).toBe('th_1')
    expect(threadParamFromSearch('note=note:1&thread=th_2')).toBe('th_2')
  })

  it('returns null when the param is missing or blank', () => {
    expect(threadParamFromSearch('?note=note:1')).toBeNull()
    expect(threadParamFromSearch('?thread=%20%20')).toBeNull()
    expect(threadParamFromSearch('')).toBeNull()
  })
})

describe('notificationErrorCopy / isGoneNotification', () => {
  it('reads a gone notification as "gone", not as an error to retry', () => {
    const gone = new ApiError(404, 'NOTIFICATION_NOT_FOUND', null, null)
    expect(isGoneNotification(gone)).toBe(true)
    expect(notificationErrorCopy(gone)).toMatch(/gone/)
    expect(isGoneNotification(new ApiError(429, 'RATE_LIMITED', null, 1))).toBe(false)
    expect(notificationErrorCopy(new ApiError(429, 'RATE_LIMITED', null, 1))).toMatch(/Too many/)
  })
})

describe('mute state helpers', () => {
  it('adds a muted note row and unmutes it back explicitly', () => {
    const muted = applyMuteState(prefs(), { noteId: 'note:1', muted: true })
    expect(muted.notes).toEqual([{ noteId: 'note:1', emailEnabled: false }])
    expect(isNoteMuted(muted, 'note:1')).toBe(true)
    const unmuted = applyMuteState(muted, { noteId: 'note:1', muted: false })
    expect(unmuted.notes).toEqual([{ noteId: 'note:1', emailEnabled: true }])
    expect(isNoteMuted(unmuted, 'note:1')).toBe(false)
  })

  it('adds a muted thread row scoped to its note', () => {
    const muted = applyMuteState(prefs(), { noteId: 'note:1', threadId: 'th_1', muted: true })
    expect(muted.threads).toEqual([{ noteId: 'note:1', threadId: 'th_1', emailEnabled: false }])
    expect(muted.notes).toEqual([])
    expect(isThreadMuted(muted, 'th_1')).toBe(true)
  })

  it('replaces an existing row instead of duplicating it', () => {
    const first = applyMuteState(prefs(), { noteId: 'note:1', muted: true })
    const second = applyMuteState(first, { noteId: 'note:1', muted: true })
    expect(second.notes).toHaveLength(1)
  })

  it('treats absent rows and missing preferences as enabled', () => {
    expect(isNoteMuted(prefs(), 'note:1')).toBe(false)
    expect(isThreadMuted(prefs(), 'th_1')).toBe(false)
    expect(isNoteMuted(null, 'note:1')).toBe(false)
    expect(isThreadMuted(undefined, 'th_1')).toBe(false)
  })
})
