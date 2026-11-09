/**
 * Opening a note fast: which local copy to show first, when a live note's own offline copy may
 * be edited before the room's first sync, and when to warm notes ahead of a click. Pure
 * functions and one small timer controller; the hooks wire them to React Query and the DOM.
 */

import { noteIdFromRoomId, roomGeneration } from './liveCollabModel'

/** A copy the screen can show read-only before the server answers. */
export type InstantCandidate<T> = { document: T } | null
export type InstantSource = 'cache' | 'indexeddb' | 'none'
export type InstantChoice<T> = { source: InstantSource; document: T | null }

/**
 * The best local copy to show the moment a note opens (read-only, still untrusted: callers run
 * it through the load gate). This device's unsent edits come first on notes that queue them
 * (`preferPending`), since that is what the editor will show once the queue opens; otherwise
 * the server checkpoint already in the React Query cache (prefetched or just read); otherwise
 * the last canonical copy stored in the `incantly-notes` database; otherwise nothing.
 */
export function chooseInstantSource<T>(input: {
  cached: InstantCandidate<T>
  stored: (InstantCandidate<T> & { pending: boolean }) | null
  preferPending: boolean
}): InstantChoice<T> {
  const { cached, stored, preferPending } = input
  if (stored && stored.pending && preferPending) return { source: 'indexeddb', document: stored.document }
  if (cached) return { source: 'cache', document: cached.document }
  if (stored) return { source: 'indexeddb', document: stored.document }
  return { source: 'none', document: null }
}

/** An offline copy is trusted for editing before the first sync only if its room synced on this device this recently. */
export const OFFLINE_COPY_TRUST_MS = 24 * 60 * 60_000

/**
 * Whether a room's offline copy may be edited before the room's first server sync: it
 * synchronized on this device within `OFFLINE_COPY_TRUST_MS`, or the browser is offline (then
 * the copy is all there is, and edits sync on reconnect as before).
 */
export function isOfflineCopyFresh(input: { lastSyncedAt: number | null; now: number; online: boolean }): boolean {
  if (!input.online) return true
  return input.lastSyncedAt != null && input.now - input.lastSyncedAt >= 0 && input.now - input.lastSyncedAt <= OFFLINE_COPY_TRUST_MS
}

/** Offline databases of the same note's older room generations, once `roomId` has synced (never newer ones or other notes). */
export function olderGenerationRoomIds(roomId: string, databaseNames: readonly string[]): string[] {
  const noteId = noteIdFromRoomId(roomId)
  const generation = roomGeneration(roomId)
  if (noteId == null || generation == null) return []
  return databaseNames.filter((name) => {
    const other = roomGeneration(name)
    return name !== roomId && other != null && noteIdFromRoomId(name) === noteId && other < generation
  })
}

/** What loading this room's offline Yjs copy from IndexedDB found. */
export type OfflineCopyState = 'loading' | 'empty' | 'loaded'

/**
 * Whether a live note's doc may be shown editable:
 * - `synced`: the room's first server sync finished (the rule before this change).
 * - `instant`: not synced yet, but the doc's own offline copy loaded non-empty, is trusted
 *   (its room synced on this device recently, or the browser is offline), and the doc belongs
 *   to the room ID this note is joining now (same CRDT doc, so edits merge on connect).
 * - `loading`: neither; the editor stays read-only.
 * A doc whose room ID differs from the current one is never instant: it is never attached to,
 * or merged into, another room.
 */
export function liveDocReadiness(input: {
  serverSynced: boolean
  offline: OfflineCopyState
  /** `isOfflineCopyFresh` at open. */
  offlineTrusted: boolean
  docRoomId: string
  currentRoomId: string | null
}): 'synced' | 'instant' | 'loading' {
  if (input.serverSynced) return 'synced'
  if (input.offline === 'loaded' && input.offlineTrusted && input.currentRoomId != null && input.docRoomId === input.currentRoomId) return 'instant'
  return 'loading'
}

/** The subset of `navigator.connection` the preloader reads. */
export type ConnectionHint = { saveData?: boolean; effectiveType?: string } | null | undefined

/** Background preloading is skipped on Save-Data and on 2G-class connections. */
export function shouldPreload(connection: ConnectionHint): boolean {
  if (!connection) return true
  if (connection.saveData === true) return false
  return connection.effectiveType !== 'slow-2g' && connection.effectiveType !== '2g'
}

/** How many of the most recent notes the list preloads. */
export const PRELOAD_NOTE_COUNT = 4

/** The most recently updated note IDs, newest first, skipping the open note. */
export function preloadCandidates(notes: readonly { id: string; updatedAt: number }[], options: { count?: number; exclude?: string | null } = {}): string[] {
  return notes
    .filter((note) => note.id !== options.exclude)
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, options.count ?? PRELOAD_NOTE_COUNT)
    .map((note) => note.id)
}

/** Pointer rest before a note's checkpoint and metadata are warmed. */
export const HOVER_INTENT_MS = 150
/**
 * Pointer rest (or time with keyboard focus) before a room token is minted. Longer than the
 * checkpoint delay: each authorize is real server work, spends the user's authorize rate limit
 * and counts the room as active.
 */
export const TOKEN_INTENT_MS = 300

export type NoteIntentDeps = {
  /** Checkpoint and metadata into the cache (cheap, any number of notes). */
  prefetchNote: (noteId: string) => void
  /**
   * Live-status, then a room token only when it says the note is live (the list's shared flag
   * can lag a fresh share, so live-status decides). At most one runs at a time; starting
   * another aborts the previous one, unless the previous was committed by a click.
   */
  prefetchLive: (noteId: string, signal: AbortSignal) => Promise<void>
  /** A click on the note claims its live preparation: the open's join may be waiting on it. */
  commitLive?: (noteId: string) => void
  schedule?: (fn: () => void, ms: number) => unknown
  cancel?: (handle: unknown) => void
  delayMs?: number
  tokenDelayMs?: number
}

export type NoteIntent = {
  /** The pointer rests on a note link: warm it after `HOVER_INTENT_MS`, prepare its room after `TOKEN_INTENT_MS`. */
  hover: (noteId: string) => void
  /** Keyboard focus landed on a note link: warm it now, prepare its room if focus stays `TOKEN_INTENT_MS`. */
  focus: (noteId: string) => void
  /** The pointer left (or focus moved away): pending work for this note is cancelled. */
  leave: (noteId: string) => void
  /** The note was clicked: its live preparation is committed (never aborted by leaving or unmounting). */
  commit: (noteId: string) => void
  /**
   * Cancels pending timers and aborts uncommitted live preparation (unmount). The controller
   * stays usable, so a remount of the same list (React's dev double mount) keeps working.
   */
  cancelAll: () => void
}

/**
 * Hover and focus intent for note links. A hover arms two timers (warm, then room); leaving
 * before they fire cancels them, and a hover on another note replaces them. Live preparation
 * (live-status and a token) runs for one note at a time: starting it for another note aborts
 * the previous one, and the same note is not prepared twice while in flight. Nothing here
 * ever enters a room.
 */
export function createNoteIntent(deps: NoteIntentDeps): NoteIntent {
  const schedule = deps.schedule ?? ((fn: () => void, ms: number) => setTimeout(fn, ms))
  const cancel = deps.cancel ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>))
  const delay = deps.delayMs ?? HOVER_INTENT_MS
  const tokenDelay = deps.tokenDelayMs ?? TOKEN_INTENT_MS
  let armed: { noteId: string; handles: unknown[] } | null = null
  let live: { noteId: string; controller: AbortController } | null = null

  const disarm = () => {
    if (armed) for (const handle of armed.handles) cancel(handle)
    armed = null
  }
  const prepareLive = (noteId: string) => {
    if (live?.noteId === noteId) return
    live?.controller.abort()
    const controller = new AbortController()
    const entry = { noteId, controller }
    live = entry
    // Settled: a later hover of the same note may prepare again (a fresh token is then reused, not re-minted).
    void deps.prefetchLive(noteId, controller.signal).catch(() => undefined).finally(() => { if (live === entry) live = null })
  }
  const arm = (noteId: string, warmNow: boolean) => {
    disarm()
    const entry: { noteId: string; handles: unknown[] } = { noteId, handles: [] }
    armed = entry
    if (warmNow) deps.prefetchNote(noteId)
    else entry.handles.push(schedule(() => { if (armed === entry) deps.prefetchNote(noteId) }, delay))
    entry.handles.push(schedule(() => {
      if (armed !== entry) return
      armed = null
      prepareLive(noteId)
    }, tokenDelay))
  }

  return {
    hover: (noteId) => { if (armed?.noteId !== noteId) arm(noteId, false) },
    focus: (noteId) => arm(noteId, true),
    leave: (noteId) => { if (armed?.noteId === noteId) disarm() },
    commit: (noteId) => {
      if (armed?.noteId === noteId) disarm()
      if (live?.noteId !== noteId) return
      // Detached: leaving the list or hovering elsewhere no longer aborts what the join awaits.
      live = null
      deps.commitLive?.(noteId)
    },
    cancelAll: () => {
      disarm()
      live?.controller.abort()
      live = null
    },
  }
}

/** At most this many hover/focus token prefetches per tab per window. */
export const TOKEN_PREFETCH_LIMIT = 5
export const TOKEN_PREFETCH_WINDOW_MS = 60_000

/** A sliding-window budget: `take` is true (and spends one) while fewer than `limit` were taken in the last `windowMs`. */
export function createTokenBudget(options: { limit?: number; windowMs?: number; now?: () => number } = {}) {
  const limit = options.limit ?? TOKEN_PREFETCH_LIMIT
  const windowMs = options.windowMs ?? TOKEN_PREFETCH_WINDOW_MS
  const now = options.now ?? Date.now
  let taken: number[] = []
  return {
    take(): boolean {
      const at = now()
      taken = taken.filter((time) => at - time < windowMs)
      if (taken.length >= limit) return false
      taken.push(at)
      return true
    },
    reset() { taken = [] },
  }
}

/**
 * Editor handoff: when the editor's key changes, the outgoing editor kept on screen is the one
 * just replaced, if it was ready, read-only and unbound with a document; otherwise none. A slot
 * older than the immediately previous one is never kept.
 */
export function outgoingAfterKeyChange<T extends { ready: boolean; bound: boolean; document: unknown }>(previous: T, enabled: boolean): T | null {
  return enabled && previous.ready && !previous.bound && previous.document != null ? previous : null
}

/**
 * A note shared with the caller (shared-with-me) as a list record: shared by definition, so a
 * grantee's open note opens pending (read-only until live-status decides), never in legacy sync.
 */
export function sharedWithMeRecord(item: { note: { id: string; title: string; updatedAt: string } }) {
  return { id: item.note.id, title: item.note.title, updatedAt: Date.parse(item.note.updatedAt) || 0, spaceId: null, currentRevisionId: null, shared: true }
}
