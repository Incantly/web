import { apiFetch } from './client'
import type { Schema } from './types'

export type AuthorizeLiveblocksResultDto = Schema<'AuthorizeLiveblocksResultDto'>
export type LiveblocksUserDto = Schema<'LiveblocksUserDto'>
export type LiveStatusDto = Schema<'LiveStatusDto'>
export type LiveStatusMode = LiveStatusDto['mode']
export type LiveStatusReason = NonNullable<LiveStatusDto['reason']>
/** Which realtime writer the server selected for a note (live-status `collabMode`). Mirrors the backend `CollabMode`; the client never decides alone. */
export type CollabMode = 'legacy' | 'yjs'

/**
 * Single-writer flag read point (Yjs migration Phase 0): the server's live-status `collabMode` selects exactly one send path per open note — the `noteSync` send for `legacy`, the canonical fold for `yjs` (Phase 2). Fails closed to `legacy` on missing or unexpected values so pre-rollout responses behave exactly as today.
 */
export function collabModeOf(status: { collabMode?: CollabMode }): CollabMode {
  return status.collabMode === 'yjs' ? 'yjs' : 'legacy'
}

const id = (value: string) => encodeURIComponent(value)

/** Thin wrappers over the live-collaboration routes (frontend-live.md "Join flow" + "Users and mentions"). */
export const liveApi = {
  /**
   * Mints a short-lived room token for a note (`POST /v1/liveblocks/authorize`).
   * Always re-read `roomId`: after a revocation rotation it changes and the old connection drops.
   * The token is memory-only: return it to the Liveblocks SDK and never store or log it.
   */
  async authorize(noteId: string, signal?: AbortSignal) {
    // Single attempt: a 429/5xx degrades to saved-sync with the recheck loop owning
    // recovery via live-status. Retrying here would multiply the SDK's own retries
    // into an authorize storm and ignore Retry-After/resetsAt.
    return (await apiFetch<AuthorizeLiveblocksResultDto>('/v1/liveblocks/authorize', { method: 'POST', body: { noteId }, signal, maxAttempts: 1 })).data
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
