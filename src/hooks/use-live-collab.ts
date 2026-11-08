'use client'

import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Room, Status } from '@liveblocks/client'
import { notifyApiError } from '@/components/product/ApiErrorToaster'
import { createFeatureContext, useFeatureContext } from '@/components/product/features/createFeatureContext'
import {
  LIVE_REJOIN_ATTEMPTS,
  LIVE_STATUS_RECHECK_MS,
  LIVE_VISIBLE_IDLE_MS,
  ROOM_FULL_NOTICE,
  SAVED_SYNC_POLL_MS,
  authorizeDegradedNotice,
  canPollSavedSync,
  createSingleDisposer,
  isLiveRateLimit,
  liveBackoffMs,
  livePausedNotice,
  liveRateLimitDelayMs,
  liveblocksUserId,
  mapCollaborators,
  mapMentionSuggestions,
  parseRoomEvent,
  restoredNotice,
  savedSyncBackoffMs,
  shouldClearLiveNoticeOnRecovery,
  shouldFastForwardSavedSync,
  type LiveConnectionState,
  type LiveNoticeFamily,
  type MentionSuggestion,
} from '@/components/product/workspace/liveCollabModel'
import { liveblocksClient, registerLiveAuth, unregisterLiveAuth } from '@/components/product/workspace/liveblocksClient'
import { dropYjsPatchHost } from '@/lib/document-editor/yjsPatch'
import { noteSyncStore, type NoteSession } from '@/components/product/workspace/useNoteSession'
import { useCurrentUser } from '@/components/product/SessionGate'
import { ApiError, isApiError } from '@/lib/api/errors'
import { collabModeOf, liveApi, type CollabMode, type LiveStatusDto } from '@/lib/api/live'
import { notesApi } from '@/lib/api/notes'
import { syncKey } from '@/lib/notes/syncStore'
import { notifyNoteChanged, subscribeNoteChanged, type NoteChangedOrigin } from '@/lib/notes/syncNotify'
import { useNavigation } from '@/hooks/use-navigation'
import { useNotes } from '@/hooks/use-notes'

export type { LiveConnectionState }
export type { MentionSuggestion }

export type LiveCollaborator = { id: string; name: string; initials: string }

export type LiveCollabValue = {
  /** The open note, once live-status confirms it is shared. Null hides presence. */
  noteId: string | null
  /** The entered room, or null when saved-sync-only, idle-left, or hidden. Threads and resolve run through it. */
  room: Room | null
  /** The note the entered room belongs to. Null with the room; always read the pair together. */
  roomNoteId: string | null
  connection: LiveConnectionState
  /** Other people currently in the room (names are untrusted text at render). */
  collaborators: LiveCollaborator[]
  /** Live or saved-sync, once live-status answers. */
  mode: LiveStatusDto['mode'] | null
  /** Which realtime writer the server selected for the open note (Yjs migration flag). Null until live-status answers. */
  collabMode: CollabMode | null
  /** At most one notice per note: pauses, a full room, or a restore. Dismissible. */
  notice: string | null
  dismissNotice: () => void
  /** Re-run the join pipeline for the open note (clears the notice). */
  retry: () => void
}

export const LiveCollabContext = createFeatureContext<LiveCollabValue>('LiveCollab')

function statusToConnection(status: Status): LiveConnectionState {
  switch (status) {
    case 'connected': return 'live'
    case 'reconnecting': return 'reconnecting'
    case 'disconnected': return 'reconnecting'
    default: return 'connecting'
  }
}

function isGone(error: unknown): boolean {
  return error instanceof ApiError && (error.code === 'NOTE_ACCESS_DENIED' || error.code === 'NOTE_NOT_FOUND' || error.status === 404)
}

/**
 * Live collaboration for the open note. Runs once, in `LiveCollabProvider`.
 *
 * - Joins the note's room when a shared note opens (live-status, then authorize,
 *   then enter); leaves on close, unmount and note-switch. One room per tab.
 * - Unexpected drops rejoin with backoff; authorize failures degrade to
 *   saved-sync-only with one notice at most (no toasts from here, except when
 *   access is revoked mid-session and the note must close).
 * - A visible tab idle for 10 minutes leaves the room and rejoins on the next
 *   interaction; hidden tabs leave after 3 minutes via the client's
 *   `backgroundKeepAliveTimeout` and rejoin when visible.
 */
export function useLiveCollabState(): LiveCollabValue {
  const user = useCurrentUser()
  const { activeNoteId, navigate } = useNavigation()
  const { activeNote } = useNotes()
  const [noteId, setNoteId] = useState<string | null>(null)
  const [room, setRoom] = useState<Room | null>(null)
  const [roomNoteId, setRoomNoteId] = useState<string | null>(null)
  const [connection, setConnection] = useState<LiveConnectionState>('unavailable')
  const [collaborators, setCollaborators] = useState<LiveCollaborator[]>([])
  const [mode, setMode] = useState<LiveStatusDto['mode'] | null>(null)
  const [collabMode, setCollabMode] = useState<CollabMode | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const listShared = activeNote?.id === activeNoteId && (activeNote?.shared ?? false)

  const dismissNotice = useCallback(() => setNotice(null), [])
  const retry = useCallback(() => { setNotice(null); setAttempt((value) => value + 1) }, [])

  useEffect(() => {
    if (activeNoteId == null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset room state when no note is open
      setNoteId(null); setRoom(null); setRoomNoteId(null); setConnection('unavailable'); setCollaborators([]); setMode(null); setCollabMode(null); setNotice(null)
      return
    }
    const note = activeNoteId
    const ownerId = user.id
    // Everything below is scoped to this note: `seen` drops late async work after a switch.
    let disposed = false
    let seen = 0
    let leaveRoom: (() => void) | null = null
    let roomId: string | null = null
    let liveMode: LiveStatusDto['mode'] | null = null
    let idleLeft = false
    let noticed = false
    let noticeFamily: LiveNoticeFamily | null = null
    let rejoinCount = 0
    const timers = new Set<ReturnType<typeof setTimeout>>()
    const disposers: (() => void)[] = []
    const recheckSlot = createSingleDisposer()
    disposers.push(() => recheckSlot.disarm())
    const controller = new AbortController()
    const isCurrent = (at: number) => !disposed && at === seen
    const later = (fn: () => void, ms: number) => {
      const timer = setTimeout(() => { timers.delete(timer); fn() }, ms)
      timers.add(timer)
    }
    const sayOnce = (text: string | null, family: LiveNoticeFamily) => {
      if (disposed || noticed || !text) return
      noticed = true
      noticeFamily = family
      setNotice(text)
    }
    const trackMode = (next: LiveStatusDto['mode'] | null) => { liveMode = next; setMode(next) }

    setNoteId(null); setConnection('connecting'); setCollaborators([]); setMode(null); setCollabMode(null); setNotice(null)

    const leave = () => {
      leaveRoom?.()
      leaveRoom = null
      if (roomId) unregisterLiveAuth(roomId)
      roomId = null
      // The patch host drops on every leave and only re-registers after a fresh seed. Full cross-room
      // isolation (rejoin reseed-from-head) is a Phase 4 item: until it lands, the re-attached Y.Doc
      // can still converge prior room state into the new room at the CRDT level.
      dropYjsPatchHost(note)
      if (!disposed) { setRoom(null); setRoomNoteId(null); setCollaborators([]) }
    }

    /** Visible-tab idle: leave after 10 quiet minutes; the next interaction rejoins. */
    const armIdle = (at: number) => {
      if (idleTimer) { clearTimeout(idleTimer); timers.delete(idleTimer) }
      idleTimer = setTimeout(() => {
        timers.delete(idleTimer as ReturnType<typeof setTimeout>)
        idleTimer = null
        if (!isCurrent(at) || !roomId || document.hidden) return
        idleLeft = true
        leave()
        setConnection('unavailable')
      }, LIVE_VISIBLE_IDLE_MS)
      timers.add(idleTimer)
    }
    let idleTimer: ReturnType<typeof setTimeout> | null = null

    /** While paused, re-check live-status every minute and on focus; join when it reopens. */
    const armRecheck = (at: number) => {
      const recheck = async () => {
        if (!isCurrent(at) || document.hidden) return
        try {
          const status = await liveApi.liveStatus(note, controller.signal)
          if (!isCurrent(at)) return
          trackMode(status.mode)
          setCollabMode(collabModeOf(status))
          if (status.mode === 'live') {
            setNoteId(note)
            void joinLive(at, false)
          } else if (status.reason === 'NOT_SHARED') {
            setNoteId(null); setConnection('unavailable')
          }
        } catch { /* Pauses fail silently; the next recheck retries. */ }
      }
      const interval = setInterval(() => void recheck(), LIVE_STATUS_RECHECK_MS)
      const onFocus = () => void recheck()
      window.addEventListener('focus', onFocus)
      // Replace, never accumulate: re-arming disarms the previous interval + listener.
      recheckSlot.replace(() => { clearInterval(interval); window.removeEventListener('focus', onFocus) })
    }

    const enter = (at: number, nextRoomId: string) => {
      if (!isCurrent(at)) return
      leave()
      idleLeft = false
      roomId = nextRoomId
      const entered = liveblocksClient().enterRoom(nextRoomId, { initialPresence: { selection: null } })
      leaveRoom = entered.leave
      const room = entered.room
      setRoom(room)
      setRoomNoteId(note)
      setConnection(statusToConnection(room.getStatus()))
      setCollaborators(mapCollaborators(room.getOthers().map((other) => ({ id: other.id ?? other.connectionId, name: other.info?.name ?? null }))))
      room.subscribe('status', (status) => {
        if (!isCurrent(at)) return
        // Only a real connection resets the consecutive-failure count: resetting on
        // authorize success lets authorize-200 → enter-rejected loop past the cap.
        if (status === 'connected') rejoinCount = 0
        setConnection(statusToConnection(status))
      })
      room.subscribe('others', (others) => {
        if (!isCurrent(at)) return
        // Someone watching others type stays live: remote activity resets the idle clock.
        armIdle(at)
        setCollaborators(mapCollaborators(others.map((other) => ({ id: other.id ?? other.connectionId, name: other.info?.name ?? null }))))
      })
      room.subscribe('error', (error) => {
        if (!isCurrent(at)) return
        const code = error.context.type === 'ROOM_CONNECTION_ERROR' ? error.context.code : -1
        if (code === 4005) {
          // The note is full: saved sync, no pre-counting, one notice.
          leave()
          setConnection('unavailable')
          sayOnce(ROOM_FULL_NOTICE, 'full')
        } else if (code === 4006 || code === 4001 || code === 4100) {
          // Rotation (re-read the room ID), kick, or refused connection: re-authorize and rejoin.
          void rejoin(at, code === 4001)
        } else {
          // Unknown room failure: degrade to saved-sync with a notice instead of
          // stranding the UI on 'connecting' forever. The recheck loop rejoins if live reopens.
          leave()
          setConnection('unavailable')
          sayOnce(authorizeDegradedNotice(null), 'paused')
          armRecheck(at)
        }
      })
      room.subscribe('event', ({ event }) => {
        if (!isCurrent(at)) return
        const parsed = parseRoomEvent(event)
        if (!parsed || parsed.noteId !== note) return
        if (parsed.type === 'ACCESS_CHANGED') {
          void rejoin(at, true)
        } else if (parsed.type === 'CONTENT_CHANGED') {
          // A checkpoint landed: re-read it now instead of waiting out the poll interval.
          notifyNoteChanged(parsed.noteId)
        } else {
          // A restore also advances the head: reload it like any other change. The poller
          // re-seeds (never patches) a restore. The notice waits for a confirming
          // checkpoint read: anyone in the room can broadcast, so an unverified
          // claim never names a user.
          notifyNoteChanged(parsed.noteId, 'restore')
          void (async () => {
            try {
              const head = await notesApi.checkpoint(note, controller.signal)
              if (!isCurrent(at)) return
              // Only a restore-kind head carrying the broadcast's revision ID confirms it; a
              // forged claim (or a head that already moved past the restore) stays silent.
              if (head.revision.kind !== 'restore' || head.revision.id !== parsed.revisionId) return
              // Only IDs and times cross the room: resolve the actor for the "who restored" copy.
              const users = await liveApi.resolveUsers([liveblocksUserId(parsed.actorUserId)]).catch(() => [])
              if (!isCurrent(at)) return
              noticeFamily = 'restored'
              setNotice(restoredNotice(users[0]?.name ?? null, head.revision.createdAt))
            } catch {
              // Unconfirmed claims stay silent; the poller still fast-forwards real restores.
            }
          })()
        }
      })
      armIdle(at)
    }

    const joinLive = async (at: number, removalCheck: boolean) => {
      if (!isCurrent(at)) return
      setConnection('connecting')
      try {
        // Always re-read the room ID: a revocation rotation changes it and drops the old connection.
        const authorized = await liveApi.authorize(note, controller.signal)
        if (!isCurrent(at)) return
        registerLiveAuth(authorized.roomId, note, authorized.token)
        enter(at, authorized.roomId)
        // Joined: stop the recheck loop and clear a stale pause/degraded notice (never restore/full ones).
        recheckSlot.disarm()
        if (shouldClearLiveNoticeOnRecovery(noticeFamily)) {
          noticeFamily = null
          setNotice(null)
        }
      } catch (error) {
        if (!isCurrent(at) || controller.signal.aborted) return
        if (removalCheck && isGone(error)) {
          // Our own access was revoked: close the note and clear its collaboration cache.
          leave()
          trackMode(null)
          setCollabMode(null)
          setNoteId(null)
          setConnection('unavailable')
          await noteSyncStore().remove(syncKey(ownerId, note)).catch(() => {})
          notifyApiError(error)
          navigate('notes')
          return
        }
        if (isApiError(error, 'NOTE_NOT_SHARED') || isGone(error)) {
          setNoteId(null); trackMode('saved_sync'); setConnection('unavailable')
          return
        }
        trackMode('saved_sync'); setConnection('unavailable')
        sayOnce(authorizeDegradedNotice(isApiError(error) ? error.code : null), 'paused')
        // 429: stay on saved-sync until Retry-After/resetsAt elapses. The recheck loop
        // (live-status, not authorize) owns recovery — never an immediate SDK retry.
        // A far-future resetsAt defers the recheck itself; otherwise the 60 s interval
        // already exceeds a typical Retry-After.
        if (isApiError(error) && isLiveRateLimit(error)) {
          const delay = liveRateLimitDelayMs(error)
          if (delay !== null && delay > LIVE_STATUS_RECHECK_MS) {
            later(() => { if (isCurrent(at)) armRecheck(at) }, delay)
            return
          }
        }
        armRecheck(at)
      }
    }

    const rejoin = async (at: number, removalCheck: boolean) => {
      if (!isCurrent(at)) return
      leave()
      if (rejoinCount >= LIVE_REJOIN_ATTEMPTS) {
        setConnection('unavailable')
        sayOnce(authorizeDegradedNotice(null), 'paused')
        armRecheck(at)
        return
      }
      // Drops rejoin within a second or two; "Reconnecting…" shows only while it takes longer.
      setConnection('reconnecting')
      const delay = liveBackoffMs(rejoinCount)
      rejoinCount += 1
      later(() => { void joinLive(at, removalCheck) }, delay)
    }

    void (async () => {
      const at = seen
      let status: LiveStatusDto
      try {
        status = await liveApi.liveStatus(note, controller.signal)
      } catch (error) {
        if (!isCurrent(at) || controller.signal.aborted) return
        if (isGone(error)) return // The session owns access loss; presence just hides.
        // Transient: saved-sync-only from the list's shared flag, and recheck for recovery.
        if (listShared) {
          setNoteId(note); trackMode('saved_sync')
          armRecheck(at)
        }
        setConnection('unavailable')
        sayOnce(authorizeDegradedNotice(isApiError(error) ? error.code : null), 'paused')
        return
      }
      if (!isCurrent(at)) return
      trackMode(status.mode)
      setCollabMode(collabModeOf(status))
      if (status.mode === 'saved_sync') {
        if (status.reason === 'NOT_SHARED') return // Unshared notes use the note API; presence hides.
        setNoteId(note)
        setConnection('unavailable')
        sayOnce(livePausedNotice(status), 'paused')
        armRecheck(at)
        return
      }
      setNoteId(note)
      void joinLive(at, false)
    })()

    const onActivity = () => {
      if (disposed || document.hidden) return
      if (idleLeft && liveMode === 'live') {
        idleLeft = false
        rejoinCount = 0
        void joinLive(seen, false)
      } else if (roomId) {
        armIdle(seen)
      }
    }
    const onVisible = () => {
      if (document.hidden || disposed) return
      // Hidden tabs left via backgroundKeepAliveTimeout: rejoin when seen again.
      if (!roomId && !idleLeft && liveMode === 'live') {
        rejoinCount = 0
        void joinLive(seen, false)
      } else {
        onActivity()
      }
    }
    const activityEvents: (keyof WindowEventMap)[] = ['keydown', 'pointermove', 'scroll']
    activityEvents.forEach((name) => window.addEventListener(name, onActivity, { passive: true }))
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      disposed = true
      seen += 1
      controller.abort()
      timers.forEach((timer) => clearTimeout(timer))
      timers.clear()
      disposers.forEach((dispose) => dispose())
      activityEvents.forEach((name) => window.removeEventListener(name, onActivity))
      document.removeEventListener('visibilitychange', onVisible)
      leave()
    }
    // The join pipeline intentionally restarts only on note-switch, shared-flag change, or manual retry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNoteId, listShared, attempt])

  return useMemo<LiveCollabValue>(() => ({
    noteId, room, roomNoteId, connection, collaborators, mode, collabMode, notice, dismissNotice, retry,
  }), [noteId, room, roomNoteId, connection, collaborators, mode, collabMode, notice, dismissNotice, retry])
}

/** Live collaboration for the open note: room state, collaborators, and the saved-sync poller. Must be used inside `WorkspaceProviders`. */
export function useLiveCollab(): LiveCollabValue {
  return useFeatureContext(LiveCollabContext)
}

export const mentionSuggestionsKey = (noteId: string, query: string) => ['live-mention-suggestions', noteId, query] as const

/**
 * People and agents the caller may mention in a note. Cached per note for a
 * minute; callers debounce keystrokes before changing `query` and pass
 * `active` only while a token is open, so idle composers never look up. An
 * empty query looks up without `q` (the server's default list, for a bare
 * `@`). Someone without access cannot be mentioned — the share dialog is the
 * way to add them.
 */
export function useMentionSuggestions(noteId: string, query: string, active: boolean): { suggestions: MentionSuggestion[]; loading: boolean; error: unknown } {
  const trimmed = query.trim()
  const result = useQuery({
    queryKey: mentionSuggestionsKey(noteId, trimmed),
    queryFn: ({ signal }) => liveApi.mentionSuggestions(noteId, trimmed ? { q: trimmed } : {}, signal),
    enabled: active,
    staleTime: 60_000,
    meta: { silentErrors: true },
  })
  return useMemo(() => ({
    suggestions: mapMentionSuggestions(result.data ?? []),
    loading: result.isPending && result.fetchStatus !== 'idle',
    error: result.isError ? result.error : null,
  }), [result.data, result.isPending, result.fetchStatus, result.isError, result.error])
}

/**
 * Saved-sync polling for one open note, shared or not: the conditional checkpoint read
 * every 2.5 s while the tab is visible, plus on window focus and immediately when a room
 * broadcast says the head moved (cheap 304 when unchanged). On change with no pending
 * local work it fast-forwards to the server version; with pending work it retries soon
 * (the rebase flow owns the merge). Failures back off silently; nothing here ever toasts.
 * No shared state, so no provider: `NoteScreen` calls it with its session.
 */
export function useSavedSyncPoll(noteId: string, session: NoteSession) {
  const sessionRef = useRef(session)
  useEffect(() => { sessionRef.current = session })
  useEffect(() => {
    let stopped = false
    let etag: string | null = null
    let failures = 0
    let inFlight = false
    /** Upgrade-only: a restore re-seeds instead of patching, and only a fast-forward read consumes it. */
    let pendingOrigin: NoteChangedOrigin = 'content'
    let timer: ReturnType<typeof setTimeout> | null = null
    const controller = new AbortController()
    const schedule = (short = false) => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => { timer = null; void tick() }, short ? 1_000 : failures === 0 ? SAVED_SYNC_POLL_MS : savedSyncBackoffMs(failures))
    }
    const tick = async () => {
      if (stopped || inFlight || controller.signal.aborted) return
      const current = sessionRef.current
      const settled = current.phase === 'ready' && current.sync != null
        && current.sync.status !== 'denied' && current.sync.status !== 'gone'
      if (!canPollSavedSync({ visible: !document.hidden, stopped: !settled })) { schedule(); return }
      inFlight = true
      let changedBusy = false
      try {
        const read = etag
          ? await notesApi.checkpoint(noteId, controller.signal, etag)
          : await notesApi.checkpoint(noteId, controller.signal).then((full) => ({ ...full, notModified: false as const }))
        failures = 0
        if (read.notModified) {
          etag = read.etag ?? etag
          // A 304 never consumes a pending restore; the fast-forward read below does.
        } else {
          const latest = sessionRef.current
          const sync = latest.sync
          const changed = sync != null && read.revision.revisionNumber > sync.revisionNumber
          if (changed && sync && shouldFastForwardSavedSync({ pending: sync.pending, status: sync.status })) {
            etag = read.etag
            const origin = pendingOrigin
            pendingOrigin = 'content'
            // applyServerHead marks a mid-poll denial read-only itself; the throw stays silent here.
            await latest.applyServerHead(origin).catch(() => {})
          } else if (!changed) {
            etag = read.etag
            // Unchanged reads never consume a pending restore either.
          } else {
            // Changed but busy: keep the old ETag and retry soon, so the fast-forward lands
            // right after the drain instead of waiting out the interval.
            changedBusy = true
          }
        }
      } catch (error) {
        if (controller.signal.aborted) return
        // Denied or deleted: stop. The session surfaces access loss through its own flows.
        if (error instanceof ApiError && (error.code === 'NOTE_ACCESS_DENIED' || error.code === 'NOTE_NOT_FOUND' || error.status === 404)) {
          stopped = true
          return
        }
        failures += 1
      } finally {
        inFlight = false
        if (!stopped) schedule(changedBusy)
      }
    }
    const pollNow = () => {
      // Focus, visibility and room broadcasts poll now instead of waiting out the interval.
      if (timer) { clearTimeout(timer); timer = null }
      void tick()
    }
    const onVisible = () => { if (!document.hidden) pollNow() }
    const onNotified = (changed: string, origin: NoteChangedOrigin) => { if (changed === noteId) { if (origin === 'restore') pendingOrigin = origin; pollNow() } }
    const unsubscribe = subscribeNoteChanged(onNotified)
    window.addEventListener('focus', pollNow)
    document.addEventListener('visibilitychange', onVisible)
    void tick()
    return () => {
      stopped = true
      controller.abort()
      if (timer) clearTimeout(timer)
      unsubscribe()
      window.removeEventListener('focus', pollNow)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [noteId])
}
