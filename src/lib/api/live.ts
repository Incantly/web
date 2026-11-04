import { apiFetch } from './client'
import type { Schema } from './types'

export type AuthorizeLiveblocksResultDto = Schema<'AuthorizeLiveblocksResultDto'>
export type LiveblocksUserDto = Schema<'LiveblocksUserDto'>
export type LiveStatusDto = Schema<'LiveStatusDto'>
export type LiveStatusMode = LiveStatusDto['mode']
export type LiveStatusReason = NonNullable<LiveStatusDto['reason']>

const id = (value: string) => encodeURIComponent(value)

/** Thin wrappers over the live-collaboration routes (frontend-live.md "Join flow" + "Users and mentions"). */
export const liveApi = {
  /**
   * Mints a short-lived room token for a note (`POST /v1/liveblocks/authorize`).
   * Always re-read `roomId`: after a revocation rotation it changes and the old connection drops.
   * The token is memory-only: return it to the Liveblocks SDK and never store or log it.
   */
  async authorize(noteId: string, signal?: AbortSignal) {
    return (await apiFetch<AuthorizeLiveblocksResultDto>('/v1/liveblocks/authorize', { method: 'POST', body: { noteId }, signal })).data
  },
  /**
   * Resolves Liveblocks user IDs to display profiles (`POST /v1/liveblocks/users`).
   * Strangers are silently omitted, so the result can be shorter than the request.
   */
  async resolveUsers(userIds: string[], signal?: AbortSignal) {
    return (await apiFetch<LiveblocksUserDto[]>('/v1/liveblocks/users', { method: 'POST', body: { userIds }, signal })).data
  },
  /** Decides whether to connect live or stay on saved sync. Call this before connecting. */
  async liveStatus(noteId: string, signal?: AbortSignal) {
    return (await apiFetch<LiveStatusDto>(`/v1/notes/${id(noteId)}/live-status`, { signal })).data
  },
  /**
   * People and agents the caller may mention in a note (owner, grant holders, enabled agents).
   * Prefix match on display name, at most `limit` (default 10).
   */
  async mentionSuggestions(noteId: string, params: { q?: string; limit?: number } = {}, signal?: AbortSignal) {
    const query = new URLSearchParams()
    if (params.q) query.set('q', params.q)
    if (params.limit !== undefined) query.set('limit', String(params.limit))
    const suffix = query.size ? `?${query}` : ''
    return (await apiFetch<LiveblocksUserDto[]>(`/v1/notes/${id(noteId)}/mention-suggestions${suffix}`, { signal })).data
  },
}
