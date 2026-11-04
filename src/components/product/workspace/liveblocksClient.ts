import { createClient, type Client } from '@liveblocks/client'
import { isApiError } from '@/lib/api/errors'
import { liveApi } from '@/lib/api/live'
import { noteIdFromRoomId } from './liveCollabModel'

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
        // Denials are final; anything else reads as a transient failure to the SDK.
        if (isApiError(error, 'NOTE_ACCESS_DENIED') || isApiError(error, 'NOTE_NOT_FOUND')) {
          return { error: 'forbidden', reason: 'Access changed' }
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
