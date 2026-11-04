import { apiFetch } from './client'
import type { Schema } from './types'

export type InboxNotificationDto = Schema<'InboxNotificationDto'>
export type InboxPageDto = Schema<'InboxPageDto'>
export type NotificationPreferencesDto = Schema<'NotificationPreferencesDto'>
export type NotificationPreferenceNoteDto = Schema<'NotificationPreferenceNoteDto'>
export type NotificationPreferenceThreadDto = Schema<'NotificationPreferenceThreadDto'>
export type UpdatePreferencesDto = Schema<'UpdatePreferencesDto'>
export type MuteStateDto = Schema<'MuteStateDto'>
export type UnsubscribeResultDto = Schema<'UnsubscribeResultDto'>

const id = (value: string) => encodeURIComponent(value)

function pageQuery(params: { cursor?: string; limit?: number }) {
  const query = new URLSearchParams()
  if (params.cursor) query.set('cursor', params.cursor)
  if (params.limit !== undefined) query.set('limit', String(params.limit))
  const suffix = query.size ? `?${query}` : ''
  return suffix
}

/** Thin wrappers over the notification routes (frontend-api-integration.md, "Notifications"). */
export const notificationsApi = {
  /**
   * The caller's Incantly inbox: shares, invitations and AI notices (comments
   * and mentions live in the Liveblocks inbox instead). Cursor-paginated;
   * payloads hold IDs only — resolve titles through authorized reads.
   */
  async inbox(params: { cursor?: string; limit?: number } = {}, signal?: AbortSignal) {
    return (await apiFetch<InboxPageDto>(`/v1/notifications${pageQuery(params)}`, { signal })).data
  },
  /** Marks one notification read. Idempotent; a missing or foreign ID is 404 `NOTIFICATION_NOT_FOUND`. */
  async markRead(notificationId: string) {
    return (await apiFetch<InboxNotificationDto>(`/v1/notifications/${id(notificationId)}/read`, { method: 'POST' })).data
  },
  /** Marks every notification read. Idempotent; never touches the Liveblocks inbox. */
  async readAll() {
    return (await apiFetch<Schema<'ReadAllResultDto'>>('/v1/notifications/read-all', { method: 'POST' })).data
  },
  /** Collaboration email preferences. Absent note/thread rows mean email enabled. */
  async preferences(signal?: AbortSignal) {
    return (await apiFetch<NotificationPreferencesDto>('/v1/notification-preferences', { signal })).data
  },
  /** Sets the master switch for all collaboration email. Idempotent. */
  async updatePreferences(body: UpdatePreferencesDto) {
    return (await apiFetch<NotificationPreferencesDto>('/v1/notification-preferences', { method: 'PATCH', body })).data
  },
  /** Mutes email for one note. Idempotent; needs read access (`NOTE_NOT_FOUND` otherwise). */
  async muteNote(noteId: string) {
    return (await apiFetch<MuteStateDto>(`/v1/notes/${id(noteId)}/mute`, { method: 'PUT' })).data
  },
  /** Unmutes email for one note. Idempotent. */
  async unmuteNote(noteId: string) {
    return (await apiFetch<MuteStateDto>(`/v1/notes/${id(noteId)}/mute`, { method: 'DELETE' })).data
  },
  /** Mutes email for one comment thread. Idempotent; needs read access to the note. */
  async muteThread(noteId: string, threadId: string) {
    return (await apiFetch<MuteStateDto>(`/v1/notes/${id(noteId)}/threads/${id(threadId)}/mute`, { method: 'PUT' })).data
  },
  /** Unmutes email for one comment thread. Idempotent. */
  async unmuteThread(noteId: string, threadId: string) {
    return (await apiFetch<MuteStateDto>(`/v1/notes/${id(noteId)}/threads/${id(threadId)}/mute`, { method: 'DELETE' })).data
  },
  /**
   * Redeems an email unsubscribe token (`POST /v1/email/unsubscribe`).
   * The `GET` variant is the backend-rendered HTML email link and redeems on
   * open, so the app never fetches it — unsubscribing always takes an
   * explicit button press that lands here. Public; the token authenticates.
   */
  async unsubscribe(token: string) {
    return (await apiFetch<UnsubscribeResultDto>('/v1/email/unsubscribe', { method: 'POST', body: { token } })).data
  },
}
