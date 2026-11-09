import { createClient, type Client } from '@liveblocks/client'
import { isApiError } from '@/lib/api/errors'
import { liveApi } from '@/lib/api/live'
import { setLeaveGuard } from './leaveGuard'
import { isLiveRateLimit, noteIdFromRoomId } from './liveCollabModel'
import { createTokenBudget } from './noteOpenModel'

/** One tab joins one room at a time; the registry maps that room back to its note. */
type LiveAuthSession = { noteId: string; token: string; at: number }
const authSessions = new Map<string, LiveAuthSession>()

/** Tokens live 1 hour; reuse a join token only while it is safely fresh. */
const TOKEN_REUSE_MS = 50 * 60_000

/** Remember which note a room belongs to (and its join token) before entering it. */
export function registerLiveAuth(roomId: string, noteId: string, token: string) {
  authSessions.set(roomId, { noteId, token, at: Date.now() })
}

/** Forget a room on leave. Tokens are memory-only: never stored, logged or toasted. */
export function unregisterLiveAuth(roomId: string) {
  authSessions.delete(roomId)
}

/**
 * At most one token minted ahead of a click (hover or focus on a shared note link), so the
 * click can enter the room at once. Never entered here, never stored or logged; a prefetch
 * for another note replaces it, and sign-out drops it.
 */
let prefetchedAuth: { noteId: string; roomId: string; token: string; at: number } | null = null
let prefetchInFlight: { noteId: string; promise: Promise<void>; controller: AbortController; committed: boolean } | null = null
/** A prefetched (never used) token serves a click only this long; joins re-authorize after. */
export const PREFETCHED_TOKEN_REUSE_MS = 60_000
/** Hover and focus spend at most 5 authorizes per minute in this tab (the server allows 60, refilling 1/s). */
const prefetchBudget = createTokenBudget()

/** True when an entered room of this note already holds a fresh token (nothing to prefetch). */
function hasJoinToken(noteId: string): boolean {
  for (const session of authSessions.values()) if (session.noteId === noteId && Date.now() - session.at < TOKEN_REUSE_MS) return true
  return false
}

/**
 * Mints a room token for a shared note the user is about to open, without entering the room.
 * One note at a time across the tab: a call for another note aborts the request in flight
 * (unless a click committed it: then the call is skipped) and empties the slot first. Skipped
 * when a valid token for the note already exists, and beyond the tab's prefetch budget.
 * Failures are silent; the click then authorizes as usual.
 */
export function prefetchLiveAuth(noteId: string, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve()
  if (prefetchedAuth?.noteId === noteId && Date.now() - prefetchedAuth.at < PREFETCHED_TOKEN_REUSE_MS) return Promise.resolve()
  if (hasJoinToken(noteId)) return Promise.resolve()
  if (prefetchInFlight?.noteId === noteId) return prefetchInFlight.promise
  if (prefetchInFlight?.committed) return Promise.resolve()
  if (!prefetchBudget.take()) return Promise.resolve()
  prefetchInFlight?.controller.abort()
  prefetchInFlight = null
  prefetchedAuth = null
  const controller = new AbortController()
  const entry = { noteId, promise: Promise.resolve(), controller, committed: false }
  // The caller's abort (pointer left for another note, list unmounted) counts only until a click commits it.
  signal?.addEventListener('abort', () => { if (!entry.committed) controller.abort() }, { once: true })
  entry.promise = liveApi.authorize(noteId, controller.signal).then((result) => {
    // Aborted, replaced by another note's prefetch, or sign-out meanwhile: drop the token.
    if (controller.signal.aborted || prefetchInFlight !== entry) return
    prefetchedAuth = { noteId, roomId: result.roomId, token: result.token, at: Date.now() }
  }, () => undefined).finally(() => {
    if (prefetchInFlight === entry) prefetchInFlight = null
  })
  prefetchInFlight = entry
  return entry.promise
}

/** A click on the note: its prefetch in flight is the join's now, so leaving or hovering elsewhere never aborts it. */
export function commitLiveAuthPrefetch(noteId: string) {
  if (prefetchInFlight?.noteId === noteId) prefetchInFlight.committed = true
}

/**
 * The join's authorize result when a prefetch minted one for this note, at most
 * `PREFETCHED_TOKEN_REUSE_MS` ago, for exactly the room ID live-status just reported. The slot
 * empties either way: one token serves one join, and a token for another room (a rotation
 * since) is never used.
 */
export function takePrefetchedLiveAuth(noteId: string, roomId: string): { roomId: string; token: string } | null {
  const held = prefetchedAuth
  if (!held || held.noteId !== noteId) return null
  prefetchedAuth = null
  if (Date.now() - held.at >= PREFETCHED_TOKEN_REUSE_MS || held.roomId !== roomId) return null
  return { roomId: held.roomId, token: held.token }
}

/** A prefetched token for this note is still being minted (the join waits for it instead of minting a second). */
export function pendingLiveAuthPrefetch(noteId: string): Promise<void> | null {
  if (prefetchInFlight?.noteId !== noteId) return null
  prefetchInFlight.committed = true
  return prefetchInFlight.promise
}

/** The note a room belongs to: the join registry first, the room ID itself as fallback. */
export function noteIdForRoom(roomId: string): string | null {
  return authSessions.get(roomId)?.noteId ?? noteIdFromRoomId(roomId)
}

let client: Client | null = null

/**
 * The shared Liveblocks client. Auth is `authEndpoint` mode against our own
 * same-origin `/v1/liveblocks/authorize` (session cookies included): no public
 * key or client-side secret anywhere. One client per tab, one room at a time.
 */
export function liveblocksClient(): Client {
  client ??= createClient({
    // Presence throttling ceiling (cursor at most every 50 ms); selection already sends on change only.
    throttle: 50,
    // Hidden tab: the socket leaves after 3 minutes; the SDK rejoins when visible again.
    backgroundKeepAliveTimeout: 3 * 60_000,
    authEndpoint: async (room) => {
      const noteId = room ? noteIdForRoom(room) : null
      if (!room || !noteId) return { error: 'forbidden', reason: 'Unknown room' }
      // The join already authorized: reuse its token while fresh instead of minting another.
      const session = authSessions.get(room)
      if (session && session.noteId === noteId && Date.now() - session.at < TOKEN_REUSE_MS) return { token: session.token }
      try {
        const result = await liveApi.authorize(noteId)
        authSessions.set(room, { noteId, token: result.token, at: Date.now() })
        return { token: result.token }
      } catch (error) {
        // Denials are final, and rate limits degrade to saved-sync with the hook's
        // recheck loop owning recovery: both read as forbidden so the SDK never
        // retries authorize into a storm. Only other failures look transient.
        if (
          isApiError(error, 'NOTE_ACCESS_DENIED')
          || isApiError(error, 'NOTE_NOT_FOUND')
          || (isApiError(error) && (error.status === 403 || error.status === 404))
        ) {
          return { error: 'forbidden', reason: 'Access changed' }
        }
        if (isApiError(error) && isLiveRateLimit(error)) {
          return { error: 'forbidden', reason: 'Live collaboration is rate limited' }
        }
        return { error: 'temporarily_unavailable', reason: 'Live collaboration is unavailable' }
      }
    },
    resolveUsers: async ({ userIds }) => {
      if (userIds.length === 0) return []
      const users = await liveApi.resolveUsers(userIds).catch(() => [])
      const byId = new Map(users.map((user) => [user.id, user]))
      // Same size, same order; strangers resolve to undefined and stay unnamed.
      return userIds.map((userId) => {
        const user = byId.get(userId)
        return user ? { name: user.name } : undefined
      })
    },
    resolveMentionSuggestions: async ({ roomId, text }) => {
      const noteId = noteIdForRoom(roomId)
      if (!noteId) return []
      const users = await liveApi.mentionSuggestions(noteId, { q: text }).catch(() => [])
      return users.map((user) => user.id)
    },
  })
  return client
}

/** Sign-out: drops cached room tokens and disconnects every room, if the client was ever created. */
export function logoutLiveblocks() {
  client?.logout()
  authSessions.clear()
  prefetchedAuth = null
  prefetchInFlight?.controller.abort()
  prefetchInFlight = null
  prefetchBudget.reset()
  lastLocalUpdate = null
  setLeaveGuard('live-room', false)
}

/**
 * Resolves once Liveblocks reports every local update acknowledged, or after `timeoutMs`.
 * Never creates the client: with none, there is nothing to wait for.
 */
export function whenSynchronized(timeoutMs: number): Promise<void> {
  const current = client
  if (!current || current.getSyncStatus() === 'synchronized') return Promise.resolve()
  return new Promise((resolve) => {
    let settled = false
    const done = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      unsubscribe()
      resolve()
    }
    const timer = setTimeout(done, timeoutMs)
    const unsubscribe = current.events.syncStatus.subscribe(() => { if (current.getSyncStatus() === 'synchronized') done() })
  })
}

/**
 * Local live edits the server has not acknowledged yet. A local Yjs update marks the room
 * unsaved; it counts as acknowledged once the client's sync status is `synchronized` again
 * after it (the provider notices local changes ~200 ms late, hence the settle delay). Opening
 * a note, even offline or before its first sync, never marks anything: only edits do.
 */
let lastLocalUpdate: number | null = null
let settleTimer: ReturnType<typeof setTimeout> | null = null
let unsubscribeSync: (() => void) | null = null
const ACK_SETTLE_MS = 400

function settle() {
  settleTimer = null
  if (lastLocalUpdate == null || !client) return
  const waited = Date.now() - lastLocalUpdate
  if (waited < ACK_SETTLE_MS) { settleTimer = setTimeout(settle, ACK_SETTLE_MS - waited); return }
  if (client.getSyncStatus() !== 'synchronized') return
  lastLocalUpdate = null
  setLeaveGuard('live-room', false)
}

/** A live doc applied a local-origin update (typing, undo, a merge or carry-over). */
export function markLiveLocalUpdate() {
  lastLocalUpdate = Date.now()
  setLeaveGuard('live-room', true)
  unsubscribeSync ??= liveblocksClient().events.syncStatus.subscribe(() => {
    if (!settleTimer) settleTimer = setTimeout(settle, 0)
  })
  if (settleTimer) clearTimeout(settleTimer)
  settleTimer = setTimeout(settle, ACK_SETTLE_MS)
}

/** True while local live edits are unacknowledged. */
export function hasUnsyncedLiveChanges(): boolean {
  return lastLocalUpdate != null
}
