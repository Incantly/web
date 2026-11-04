import { apiErrorMessage, isApiError } from '../../../lib/api/errors'
import type { InboxNotificationDto, MuteStateDto, NotificationPreferencesDto } from '../../../lib/api/notifications'

/** Inbox refresh while the workspace watches: refetch on focus plus this interval, visible tabs only. */
export const NOTIFICATION_POLL_MS = 45_000
/** One inbox page. The server default; the panel loads more on demand. */
export const NOTIFICATION_PAGE_SIZE = 25

/** Unread rows are the ones with no `readAt`. */
export function unreadCount(items: readonly Pick<InboxNotificationDto, 'readAt'>[]): number {
  return items.filter((item) => item.readAt == null).length
}

/**
 * The bell merges two inboxes (frontend-api-integration.md, "Notifications").
 * The Liveblocks half lands with the Liveblocks inbox wiring; until then the
 * bell shows the Incantly count through this merge point.
 */
export function combinedUnread(incantly: number, liveblocks = 0): number {
  return incantly + liveblocks
}

/** Badge copy: the count, capped so the badge never stretches the top bar. */
export function formatBadgeCount(count: number): string {
  return count > 99 ? '99+' : String(Math.max(0, count))
}

/** Drops a row the server reports as gone (`NOTIFICATION_NOT_FOUND`). */
export function withoutNotification(items: readonly InboxNotificationDto[], id: string): InboxNotificationDto[] {
  return items.filter((item) => item.id !== id)
}

/** Marks one row read locally (the server answer confirms it right after). */
export function markedRead(items: readonly InboxNotificationDto[], id: string, readAt: string): InboxNotificationDto[] {
  return items.map((item) => (item.id === id ? { ...item, readAt } : item))
}

/** Marks every row read locally after `read-all`. */
export function allMarkedRead(items: readonly InboxNotificationDto[], readAt: string): InboxNotificationDto[] {
  return items.map((item) => (item.readAt == null ? { ...item, readAt } : item))
}

function stringId(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

/**
 * Where a row navigates. Payloads hold IDs only, so this reads `noteId` and
 * `threadId` (strings, nothing else) and the hook resolves titles separately.
 */
export function notificationTarget(payload: InboxNotificationDto['payload']): { noteId: string | null; threadId: string | null } {
  if (!payload || typeof payload !== 'object') return { noteId: null, threadId: null }
  const fields = payload as Record<string, unknown>
  return { noteId: stringId(fields.noteId), threadId: stringId(fields.threadId) }
}

/** The person behind a row, when the payload names one. Null renders as "Someone". */
export function notificationActorId(payload: InboxNotificationDto['payload']): string | null {
  if (!payload || typeof payload !== 'object') return null
  return stringId((payload as Record<string, unknown>).actorUserId)
}

/**
 * The action clause for a row. Person rows render as "{actor} {action}";
 * system rows render the text as-is with no actor.
 */
export function notificationAction(type: string): { text: string; actor: 'person' | 'system' } {
  switch (type) {
    case 'note.shared': return { text: 'shared a note with you', actor: 'person' }
    case 'note.invitation': return { text: 'invited you to a note', actor: 'person' }
    case 'note.access_removed': return { text: 'removed your access to a note', actor: 'person' }
    case 'collaboration.checkpoint_quarantined': return { text: 'A change needs your review', actor: 'system' }
    case 'collaboration.live_budget_80': return { text: 'You’ve used 80% of your live minutes', actor: 'system' }
    default: return { text: 'sent you an update', actor: 'person' }
  }
}

/**
 * Reads the `?thread=` deep link (email "View comment" buttons and inbox
 * rows): the thread to scroll to and highlight in the comments panel.
 */
export function threadParamFromSearch(search: string): string | null {
  const raw = new URLSearchParams(search.startsWith('?') ? search : `?${search}`).get('thread')
  const threadId = raw?.trim() ?? ''
  return threadId ? threadId : null
}

/** A 404 `NOTIFICATION_NOT_FOUND` means "gone", never a retry. */
export function isGoneNotification(error: unknown): boolean {
  return isApiError(error, 'NOTIFICATION_NOT_FOUND')
}

/** Friendly copy for inbox failures; gone rows read as "gone", not as errors. */
export function notificationErrorCopy(error: unknown): string {
  return apiErrorMessage(error)
}

/**
 * Folds a mute/unmute answer into the preferences: the scope's row is added
 * or replaced (thread scopes carry their note). Absent rows still mean
 * email enabled; unmuting writes that back explicitly.
 */
export function applyMuteState(prefs: NotificationPreferencesDto, state: MuteStateDto): NotificationPreferencesDto {
  const emailEnabled = !state.muted
  if (state.threadId) {
    const row = { noteId: state.noteId, threadId: state.threadId, emailEnabled }
    const threads = prefs.threads.some((entry) => entry.threadId === state.threadId)
      ? prefs.threads.map((entry) => (entry.threadId === state.threadId ? row : entry))
      : [...prefs.threads, row]
    return { ...prefs, threads }
  }
  const row = { noteId: state.noteId, emailEnabled }
  const notes = prefs.notes.some((entry) => entry.noteId === state.noteId)
    ? prefs.notes.map((entry) => (entry.noteId === state.noteId ? row : entry))
    : [...prefs.notes, row]
  return { ...prefs, notes }
}

/** True only when the preferences carry an explicit muted row; absent rows mean enabled. */
export function isNoteMuted(prefs: NotificationPreferencesDto | null | undefined, noteId: string): boolean {
  return prefs?.notes.some((entry) => entry.noteId === noteId && !entry.emailEnabled) ?? false
}

export function isThreadMuted(prefs: NotificationPreferencesDto | null | undefined, threadId: string): boolean {
  return prefs?.threads.some((entry) => entry.threadId === threadId && !entry.emailEnabled) ?? false
}
