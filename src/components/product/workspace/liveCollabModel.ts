import type { LiveblocksUserDto, LiveStatusDto } from '@/lib/api/live'
import type { SyncStatus } from '@/lib/notes/noteSync'

/** The room connection the header presence UI draws. */
export type LiveConnectionState = 'connecting' | 'live' | 'reconnecting' | 'unavailable'

/** What the header presence UI shows per connection state. */
export const LIVE_CONNECTION_COPY: Record<LiveConnectionState, string> = {
  connecting: 'Connecting…',
  live: 'Live',
  reconnecting: 'Reconnecting…',
  unavailable: 'Unavailable',
}

/**
 * A pause or full-room notice for a live (`yjs`) note the user cannot join: such notes never
 * save through transactions, so the note is read-only instead of "changes still save".
 */
export function liveReadOnlyNotice(text: string, family: LiveNoticeFamily): string {
  if (family === 'full') return 'This note is full (10 people). You can read it; editing opens when someone leaves.'
  return text.replace(/ Your changes still save\.$/, ' The note is read-only until live editing resumes.')
}

/** How the open note saves: live through its room, legacy transactions, or not decided yet. */
export type NoteWriteMode = 'live' | 'legacy' | 'pending'

/**
 * Picks the open note's write path from live-status (`verdict`: undefined until it answers,
 * null when it failed). `collabMode` is per note: `yjs` is live for everyone (a user who cannot
 * join reads it read-only), `legacy` uses transactions. Notes the list marks shared stay
 * `pending` (read-only, no transactions) until a verdict arrives, even if live-status fails;
 * other notes start legacy at once, exactly as before. A `409 NOTE_IS_LIVE` (`forcedLive`)
 * switches to live. While a rejoin re-reads live-status, the `previous` decision holds, so a
 * retry never flips the screen; only a `legacy` verdict leaves live.
 */
export function noteWriteMode(input: { verdict: 'legacy' | 'yjs' | null | undefined; listShared: boolean; forcedLive: boolean; previous: NoteWriteMode | null }): NoteWriteMode {
  if (input.forcedLive || input.verdict === 'yjs') return 'live'
  if (input.verdict === 'legacy') return 'legacy'
  if (input.previous && input.previous !== 'pending') return input.previous
  return input.listShared ? 'pending' : 'legacy'
}

/** What the save indicator shows on a live note. */
export type LiveSaveStatus = 'connecting' | 'saving' | 'saved' | 'reconnecting' | 'offline'

export const LIVE_SAVE_COPY: Record<LiveSaveStatus, string> = {
  connecting: 'Connecting…',
  saving: 'Saving…',
  saved: 'Saved',
  reconnecting: 'Reconnecting…',
  offline: 'Offline – changes will sync',
}

/**
 * Live save status: Liveblocks' client sync status (`synchronizing` / `synchronized`) while
 * connected; "Offline" only when the browser itself is offline; "Reconnecting…" while the room
 * connection is down on a reachable network; connecting until the note's doc first loads.
 */
export function liveSaveStatus(input: { sync: 'synchronizing' | 'synchronized'; online: boolean; connection: LiveConnectionState; bound: boolean }): LiveSaveStatus {
  if (!input.online) return 'offline'
  if (!input.bound) return 'connecting'
  if (input.connection !== 'live') return 'reconnecting'
  return input.sync === 'synchronizing' ? 'saving' : 'saved'
}

/** Saved-sync checkpoint poll: every 2.5 s while the tab is visible, plus on focus and on room broadcasts. */
export const SAVED_SYNC_POLL_MS = 2_500
/** A failed saved-sync poll retries with backoff, at most this far apart. */
export const SAVED_SYNC_POLL_MAX_MS = 60_000
/** While live is paused, re-check live-status this often (plus on focus) to rejoin when it reopens. */
export const LIVE_STATUS_RECHECK_MS = 60_000
/** Visible tab: leave the room after this long with no local activity and no incoming remote changes. */
export const LIVE_VISIBLE_IDLE_MS = 10 * 60_000
/** Unexpected drops rejoin with backoff this many times before degrading to saved-sync-only. */
export const LIVE_REJOIN_ATTEMPTS = 5

const ROOM_PREFIX = 'note:'
const NOTE_ID = /^[A-Za-z0-9:_-]{1,128}$/
const GENERATION = /^(0|[1-9][0-9]{0,8})$/

/**
 * `note:{noteId}:{generation}` → the note ID, or null when it is not a room ID.
 * Mirrors the backend `parseRoomId` (room-identity.ts): real note IDs contain
 * `:`, so the generation splits after the LAST separator. Room IDs are never
 * constructed client-side; authorize and live-status always re-read them.
 */
export function noteIdFromRoomId(roomId: string): string | null {
  if (!roomId.startsWith(ROOM_PREFIX)) return null
  const separator = roomId.lastIndexOf(':')
  if (separator <= ROOM_PREFIX.length || separator >= roomId.length - 1) return null
  const noteId = roomId.slice(ROOM_PREFIX.length, separator)
  const generation = roomId.slice(separator + 1)
  if (!NOTE_ID.test(noteId) || !GENERATION.test(generation)) return null
  return noteId
}

/** `note:{noteId}:{generation}` → the generation number, or null when it is not a room ID. */
export function roomGeneration(roomId: string): number | null {
  if (!noteIdFromRoomId(roomId)) return null
  return Number(roomId.slice(roomId.lastIndexOf(':') + 1))
}

/** A bare Incantly user ID becomes the namespaced `user:…` ID resolveUsers expects. */
export function liveblocksUserId(userId: string): string {
  return `user:${userId}`
}

/**
 * Rejoin delay for attempt 0, 1, 2…: 1 s, 2 s, 4 s…, capped at 30 s.
 * Deterministic so the growth is unit-tested; callers add no jitter (one tab joins one room).
 */
export function liveBackoffMs(attempt: number): number {
  const clamped = Math.max(0, Math.floor(attempt))
  return Math.min(1_000 * 2 ** clamped, 30_000)
}

/** Saved-sync poll delay after `failures` consecutive failures: 5 s doubling to 60 s, silent. */
export function savedSyncBackoffMs(failures: number): number {
  const clamped = Math.max(0, Math.floor(failures))
  return Math.min(SAVED_SYNC_POLL_MS * 2 ** clamped, SAVED_SYNC_POLL_MAX_MS)
}

export type SavedSyncPollGate = {
  /** False while the tab is hidden. */
  visible: boolean
  /** True once the session is denied or the note is gone. */
  stopped: boolean
}

/**
 * The poller runs in a visible tab on a live session, for shared and unshared notes alike:
 * the same user editing elsewhere (another browser, another device) advances the head either
 * way, and a 304 is cheap. Hidden tabs and denied sessions never poll.
 */
export function canPollSavedSync(gate: SavedSyncPollGate): boolean {
  return gate.visible && !gate.stopped
}

/**
 * A changed checkpoint fast-forwards to the server version only when no local
 * work is still on its way (pending 0 on a settled state). With pending work
 * the poller does nothing: the existing conflict flow owns the merge.
 */
export function shouldFastForwardSavedSync(state: { pending: number; status: SyncStatus }): boolean {
  return state.pending === 0 && (state.status === 'saved' || state.status === 'saving')
}

/** Initials for a presence avatar: the first letters of the first two words, uppercased. */
export function initialsFor(name: string): string {
  const letters = name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0] ?? '')
  const initials = letters.join('').toUpperCase()
  return initials || '?'
}

export type MentionSuggestion = { id: string; name: string; initials: string }

/** Mentionable collaborators for the mention menu. Names stay untrusted text at render. */
export function mapMentionSuggestions(users: readonly LiveblocksUserDto[]): MentionSuggestion[] {
  return users.map((user) => ({ id: user.id, name: user.name, initials: initialsFor(user.name) }))
}

/** A collaborator drawn in the header avatar stack. */
export function mapCollaborators(others: readonly { id: string | number; name: string | null }[]): { id: string; name: string; initials: string }[] {
  return others.map((other) => {
    const name = other.name?.trim() ? other.name : 'Collaborator'
    return { id: String(other.id), name, initials: initialsFor(name) }
  })
}

/** Which copy family set the current live-collab notice. */
export type LiveNoticeFamily = 'paused' | 'full' | 'restored'

/**
 * Auto-recovery clears only pause/degraded notices (authorizeDegradedNotice /
 * livePausedNotice copy). Restore and full-room notices survive a rejoin.
 */
export function shouldClearLiveNoticeOnRecovery(family: LiveNoticeFamily | null): boolean {
  return family === 'paused'
}

/**
 * A slot holding at most one cleanup: replacing disarms the previous one, so
 * repeated arms never accumulate intervals or listeners. Disarming twice is safe.
 */
export function createSingleDisposer(): {
  readonly armed: boolean
  replace: (next: () => void) => void
  disarm: () => void
} {
  let current: (() => void) | null = null
  return {
    get armed() { return current !== null },
    replace(next: () => void) {
      current?.()
      current = next
    },
    disarm() {
      current?.()
      current = null
    },
  }
}

/** The note is full (10 connections including extra tabs): saved sync, no pre-counting client-side. */
export const ROOM_FULL_NOTICE = 'This note is full (10 people). Your changes still save.'

/** Live paused but the note is shared: saved sync until it reopens. Null on `live` (no notice). */
export function livePausedNotice(
  status: Pick<LiveStatusDto, 'mode' | 'reason' | 'resetsAt'>,
  formatDate: (iso: string) => string = (iso) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(iso)),
): string | null {
  if (status.mode === 'live') return null
  if (status.reason === 'NOT_SHARED') return null
  if (status.reason === 'BUDGET_EXHAUSTED' && status.resetsAt) {
    return `Live cursors are paused until ${formatDate(status.resetsAt)}. Your changes still save.`
  }
  if (status.reason === 'BUDGET_EXHAUSTED') return 'Live cursors are paused for now. Your changes still save.'
  return 'Live collaboration is paused. Your changes still save.'
}

/**
 * One notice at most when joining degrades to saved-sync-only. Null means stay
 * silent: unshared notes use the note API, and access loss is owned by the session.
 */
export function authorizeDegradedNotice(code: string | null): string | null {
  switch (code) {
    case 'NOTE_NOT_SHARED':
    case 'NOTE_ACCESS_DENIED':
    case 'NOTE_NOT_FOUND':
      return null
    case 'LIVE_COLLABORATION_LIMIT_REACHED':
    case 'RATE_LIMITED':
      return 'Live cursors are paused for now. Your changes still save.'
    case 'LIVE_COLLABORATION_PAUSED':
    case 'LIVE_COLLABORATION_UNAVAILABLE':
      return 'Live collaboration is paused. Your changes still save.'
    default:
      return 'Live collaboration isn’t available right now. Your changes still save.'
  }
}

/**
 * True when an authorize failure is a rate limit (HTTP 429): the caller must
 * degrade to saved-sync and let the recheck loop own recovery, never retry
 * authorize immediately. Covers both the generic `RATE_LIMITED` code and the
 * live-specific `LIVE_COLLABORATION_LIMIT_REACHED` (fallback `saved_sync`).
 */
export function isLiveRateLimit(error: { status: number; code: string }): boolean {
  return error.status === 429 || error.code === 'RATE_LIMITED' || error.code === 'LIVE_COLLABORATION_LIMIT_REACHED'
}

/**
 * How long to stay on saved-sync after a 429 before rechecking: the body's
 * `resetsAt` (ISO) when present, else the `Retry-After` seconds. Null when the
 * error carries neither (the caller uses its normal recheck interval, which
 * already exceeds a typical Retry-After).
 */
export function liveRateLimitDelayMs(error: { retryAfterSeconds: number | null; body: unknown }): number | null {
  const body = (error.body ?? null) as { resetsAt?: unknown } | null
  if (typeof body?.resetsAt === 'string') {
    const at = Date.parse(body.resetsAt)
    if (Number.isFinite(at)) return Math.max(0, at - Date.now())
  }
  if (error.retryAfterSeconds !== null) return Math.max(0, error.retryAfterSeconds * 1000)
  return null
}

export type CollaborationRoomEvent =
  | { type: 'ACCESS_CHANGED'; noteId: string; generation: number }
  | { type: 'RESTORED'; noteId: string; revisionId: string; actorUserId: string; restoredAt: string }
  | { type: 'CONTENT_CHANGED'; noteId: string; revisionNumber: number; changedAt: string }

/** Narrows an untrusted broadcast payload to the known room events (backend room-events.ts). Unparseable dates are rejected so a forged broadcast can never throw in notice formatting. */
export function parseRoomEvent(event: unknown): CollaborationRoomEvent | null {
  if (!event || typeof event !== 'object') return null
  const payload = event as Record<string, unknown>
  if (payload.type === 'ACCESS_CHANGED' && typeof payload.noteId === 'string' && typeof payload.generation === 'number') {
    return { type: 'ACCESS_CHANGED', noteId: payload.noteId, generation: payload.generation }
  }
  if (
    payload.type === 'RESTORED'
    && typeof payload.noteId === 'string'
    && typeof payload.revisionId === 'string'
    && typeof payload.actorUserId === 'string'
    && typeof payload.restoredAt === 'string'
    && !Number.isNaN(Date.parse(payload.restoredAt))
  ) {
    return { type: 'RESTORED', noteId: payload.noteId, revisionId: payload.revisionId, actorUserId: payload.actorUserId, restoredAt: payload.restoredAt }
  }
  if (
    payload.type === 'CONTENT_CHANGED'
    && typeof payload.noteId === 'string'
    && typeof payload.revisionNumber === 'number'
    && typeof payload.changedAt === 'string'
    && !Number.isNaN(Date.parse(payload.changedAt))
  ) {
    return { type: 'CONTENT_CHANGED', noteId: payload.noteId, revisionNumber: payload.revisionNumber, changedAt: payload.changedAt }
  }
  return null
}

/** "Ada restored the version from 14:05." The actor name stays untrusted text at render. */
export function restoredNotice(
  actorName: string | null,
  restoredAt: string,
  formatTime: (iso: string) => string = (iso) => new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(iso)),
): string {
  const when = formatTime(restoredAt)
  return actorName?.trim() ? `${actorName} restored the version from ${when}.` : `A collaborator restored the version from ${when}.`
}
