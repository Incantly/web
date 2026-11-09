'use client'

import { normalizeDocument, type DocumentNode, type IncantlyDocument } from '@incantly/canvas-core/document'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { authClient } from '../../../lib/auth-client'
import { ApiError, isApiError } from '../../../lib/api/errors'
import { isSharedNote, notesApi } from '../../../lib/api/notes'
import { diffDocuments } from '../../../lib/notes/documentDiff'
import { loadDocument } from '../../../lib/notes/documentGate'
import { NoteSync, type EditorChange, type SyncState } from '../../../lib/notes/noteSync'
import { acknowledgeNoteRevision, cachedCheckpoint, forgetNoteOpen, loadNoteForOpen, rememberCheckpoint } from '../../../lib/notes/noteOpenCache'
import { IndexedDbNoteSyncStore, getClientId, getTabSessionId, hasPendingWork, syncKey, type NoteSyncRecord, type NoteSyncStore } from '../../../lib/notes/syncStore'
import type { CarryOverEdit } from '../../../lib/document-editor/yjsBinding'
import { notifyApiError } from '../ApiErrorToaster'
import { setLeaveGuard } from './leaveGuard'
import { liveblocksClient } from './liveblocksClient'
import { chooseInstantSource, type InstantSource } from './noteOpenModel'

let sharedStore: IndexedDbNoteSyncStore | null = null
export function noteSyncStore(): NoteSyncStore {
  sharedStore ??= new IndexedDbNoteSyncStore()
  return sharedStore
}

/** Sign-out: closes the shared store's connection so its database can be deleted. */
export function closeNoteSyncStore() {
  sharedStore?.close()
  sharedStore = null
}

/** Legacy queues of the notes open in this tab (sign-out flushes them first). */
const openEngines = new Set<NoteSync>()

/** Sign-out: sends what the open legacy notes still hold, then every other queued note of `userId`. */
export async function flushNoteWork(userId: string): Promise<void> {
  const open = [...openEngines]
  await Promise.all(open.map((engine) => engine.flushNow().catch(() => undefined)))
  await resumePendingNotes(userId).catch(() => undefined)
}

/** True while this device holds legacy edits for `userId` that the server has not acknowledged. */
export async function hasUnsentNoteWork(userId: string): Promise<boolean> {
  if ([...openEngines].some((engine) => engine.hasPending)) return true
  const records = await noteSyncStore().listForUser(userId).catch(() => [])
  return records.some((record) => hasPendingWork(record))
}

export type NoteSessionPhase = 'loading' | 'cached' | 'ready' | 'not-found' | 'no-access' | 'error'

/**
 * This device's unsent legacy edits, carried into the live room once (after `409 NOTE_IS_LIVE`).
 * `headTitle` is the title the edits were made against: a carried rename applies only while the
 * room still has it.
 */
export type LiveCarryOver = { edits: readonly CarryOverEdit[]; title: string | null; headTitle: string }

export type NoteSession = {
  phase: NoteSessionPhase
  /** False when the server says the caller cannot edit (viewer): the session records nothing and never submits. */
  canEdit: boolean
  /**
   * Live note (`collabMode: 'yjs'`): edits are written only to the Liveblocks room, so
   * `record`, `rename` and the conflict actions are inert and `sync` stays null.
   */
  live: boolean
  /** What the editor shows. While `cached`, it is a read-only local copy until the server answers. On live notes, the head checkpoint at open. */
  document: IncantlyDocument | null
  /**
   * Where the `cached` copy came from: the head checkpoint already in memory (`cache`, from a
   * prefetch or the other mount of this open), this device's `incantly-notes` copy
   * (`indexeddb`), or `none`.
   */
  instantSource: InstantSource
  /** Changes when the editor must reload its document (conflict resolution, restore). Legacy notes only. */
  version: number
  sync: SyncState | null
  /** Live notes: the head revision `document` was read at (the read-only view's poll base). */
  headRevision: number
  repaired: boolean
  errorMessage?: string
  /** Live notes only: legacy edits still to apply into the room, or null. */
  carryOver: LiveCarryOver | null
  /**
   * Live notes only: runs `apply` with the carry-over at most once across this browser's tabs
   * (a Web Lock per queue), then forgets the queue here and on this device.
   */
  runCarryOver: (apply: (carryOver: LiveCarryOver) => void) => Promise<void>
  record: (change: EditorChange) => void
  /**
   * Sends pending edits now; resolves to the sync state after (`pending` > 0 means some are still waiting).
   * On live notes it waits briefly for the room to acknowledge local updates and reports the head revision.
   */
  flush: () => Promise<SyncState | null>
  rename: (title: string) => void
  keepMine: () => Promise<void>
  takeServer: () => Promise<void>
  /**
   * Loads a server-originated head revision (AI edits, figures, imports) into the editor.
   * Legacy notes reload. Live notes only refresh `document` and `headRevision`: the bound
   * editor gets every change through the room, and the read-only view (a note the user cannot
   * join) shows the refreshed head. Callers drain pending work first, exactly as with `takeServer`.
   */
  applyServerHead: () => Promise<void>
  restore: (revisionId: string) => Promise<void>
  retry: () => void
  /** Access was lost mid-session elsewhere (suggestion decisions, undo): toast and go read-only, keep edits. */
  markAccessDenied: (error: unknown) => void
}

/** How long a live flush waits for Liveblocks to acknowledge local updates. */
const LIVE_FLUSH_WAIT_MS = 5_000
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * The edits a stored legacy queue still holds, as top-level operations against the head.
 * Same base: the diff is exactly this device's edits, and each update or delete carries the
 * head's block so it applies only where nobody changed that block since. Older base: the diff
 * also holds other people's later changes reversed, so only inserts are kept, and updates are
 * always added below the room's block (never replacing it); deletes and moves are dropped.
 */
function carryOverFrom(record: NoteSyncRecord | undefined, head: IncantlyDocument, headRevision: number): LiveCarryOver | null {
  if (!record || !hasPendingWork(record) || !record.lastDocument) return null
  const local = loadDocument(record.lastDocument)
  if (!local.ok) return null
  const diff = diffDocuments(head, normalizeDocument(local.document)).content
  const sameBase = record.baseRevisionNumber === headRevision
  const headBlocks = new Map<string, DocumentNode>(head.content.map((node) => [node.id, node]))
  const edits: CarryOverEdit[] = []
  for (const operation of diff) {
    if (operation.type === 'insertNode') edits.push({ operation, head: null })
    else if (operation.type === 'updateNode') edits.push({ operation, head: sameBase ? headBlocks.get(operation.nodeId) ?? null : null })
    else if (sameBase && operation.type === 'deleteNode') edits.push({ operation, head: headBlocks.get(operation.nodeId) ?? null })
    else if (sameBase && operation.type === 'moveNode') edits.push({ operation, head: null })
  }
  const headTitle = head.metadata.title ?? ''
  const title = record.title && record.title.trim() && record.title !== headTitle ? record.title : null
  return edits.length || title ? { edits, title, headTitle } : null
}

/** The head checkpoint already in memory, through the load gate (never trusted as is). */
function instantFromCache(client: ReturnType<typeof useQueryClient>, userId: string, noteId: string): { document: IncantlyDocument; revision: number } | null {
  const cached = cachedCheckpoint(client, userId, noteId)
  if (!cached) return null
  const gate = loadDocument(cached.document)
  if (gate.ok) return { document: gate.document, revision: cached.revision.revisionNumber }
  // A cached body that fails the gate is never offered again.
  forgetNoteOpen(client, userId, noteId)
  return null
}

/**
 * Opens one note: the best local copy first (read-only, marked syncing: the checkpoint already
 * in memory renders on the first frame, else this device's stored copy), then the authorized
 * server metadata (which also says whether the note is shared) and checkpoint through the load
 * gate, then sync. The server reads go through the shared open cache, so the remount when a
 * shared note's write path is decided reuses them instead of sending them again.
 * Legacy notes sync through `NoteSync` and flush on close; live notes never construct it.
 * Render it under a component keyed by note ID and mode so each note starts with fresh state.
 */
export function useNoteSession(userId: string, noteId: string, options: {
  onAck?: (revisionNumber: number, title: string | null) => void
  /** Live mode for this mount; later changes are ignored (the screen remounts to switch). */
  live?: boolean
  /** The server answered `409 NOTE_IS_LIVE`: the screen switches this note to live mode. */
  onNoteIsLive?: () => void
  /** The write path is not decided yet (shared note awaiting live-status): load read-only, never start `NoteSync`. */
  hold?: boolean
} = {}): NoteSession {
  const queryClient = useQueryClient()
  const [instant] = useState(() => instantFromCache(queryClient, userId, noteId))
  const [phase, setPhase] = useState<NoteSessionPhase>(instant ? 'cached' : 'loading')
  const [canEdit, setCanEdit] = useState(true)
  const canEditRef = useRef(true)
  const [document, setDocument] = useState<IncantlyDocument | null>(instant?.document ?? null)
  const [instantSource, setInstantSource] = useState<InstantSource>(instant ? 'cache' : 'none')
  /** The server revision on screen, when it is one (the cached head or a loaded checkpoint); null for a local copy. */
  const shownRevision = useRef<number | null>(instant?.revision ?? null)
  const [sync, setSync] = useState<SyncState | null>(null)
  const [version, setVersion] = useState(0)
  const [repaired, setRepaired] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string>()
  const [carryOver, setCarryOver] = useState<LiveCarryOver | null>(null)
  const [headRevision, setHeadRevision] = useState(0)
  const [attempt, setAttempt] = useState(0)
  const engine = useRef<NoteSync | null>(null)
  const callbacks = useRef({ onAck: options.onAck, onNoteIsLive: options.onNoteIsLive })
  useEffect(() => { callbacks.current = { onAck: options.onAck, onNoteIsLive: options.onNoteIsLive } })
  const [live] = useState(options.live === true)
  const hold = !live && options.hold === true
  const lastRevision = useRef(0)
  /** This mount recorded an edit (legacy) or renamed: the cached head is stale on close. */
  const wrote = useRef(false)

  useEffect(() => {
    let active = true
    const controller = new AbortController()
    const store = noteSyncStore()
    /**
     * Read-only heads (live, undecided): the editor reloads only when the head differs from the
     * revision already on screen, so the cached head becoming authoritative never remounts it.
     */
    const showHead = (head: IncantlyDocument, repairedHead: boolean, revision: number) => {
      setRepaired(repairedHead)
      setDocument(head)
      if (shownRevision.current !== revision) setVersion((value) => value + 1)
      shownRevision.current = revision
    }
    void (async () => {
      // The server read starts first and runs while this device's copy is read below.
      const serverRead = loadNoteForOpen(queryClient, userId, noteId)
      serverRead.catch(() => undefined)
      // 1) Instant open from the best local copy (untrusted: it still passes the load gate). The
      //    checkpoint in memory already rendered on the first frame; this device's stored copy
      //    replaces it only when it holds unsent edits (what the queue will show), or stands in
      //    when nothing was in memory.
      const cached = await store.get(syncKey(userId, noteId)).catch(() => undefined)
      if (active && cached?.lastDocument) {
        const inMemory = cachedCheckpoint(queryClient, userId, noteId)
        const choice = chooseInstantSource({
          cached: inMemory ? { document: inMemory.document } : null,
          stored: { document: cached.lastDocument, pending: hasPendingWork(cached) },
          preferPending: !live,
        })
        const gate = choice.source === 'indexeddb' ? loadDocument(choice.document) : null
        if (gate?.ok) {
          // Replacing the in-memory head already on screen needs a reload; a first copy does not.
          if (shownRevision.current !== null) setVersion((value) => value + 1)
          shownRevision.current = null
          setDocument(gate.document); setInstantSource('indexeddb'); setPhase('cached')
        }
      }
      // 2) The server copy is the authority (one read per open, shared through the open cache).
      try {
        const [metadata, checkpoint] = await serverRead
        if (!active) return
        const gate = loadDocument(checkpoint.document)
        if (!gate.ok) throw new ApiError(422, 'INVALID_SERVER_DOCUMENT', null, null)
        // Viewers open read-only up front: recording or submitting anything (even figure
        // hydration drift) would 403 and wrongly toast "no longer have access".
        const editable = metadata.canEdit !== false
        canEditRef.current = editable
        setCanEdit(editable)
        lastRevision.current = checkpoint.revision.revisionNumber
        setHeadRevision(checkpoint.revision.revisionNumber)
        if (live) {
          // Live: the room is the editor's content and its only write path. Unsent legacy work
          // on this device (typed before the note went live) is carried into the room once.
          const stored = await store.get(syncKey(userId, noteId)).catch(() => undefined)
          if (!active) return
          const carried = editable ? carryOverFrom(stored, gate.document, checkpoint.revision.revisionNumber) : null
          if (!carried && stored) await store.remove(syncKey(userId, noteId)).catch(() => {})
          if (!active) return
          setCarryOver(carried)
          showHead(gate.document, gate.repaired, checkpoint.revision.revisionNumber)
          setPhase('ready')
          return
        }
        if (hold) {
          // Undecided write path: show the head read-only; NoteSync starts once the path is known.
          showHead(gate.document, gate.repaired, checkpoint.revision.revisionNumber)
          setPhase('ready')
          return
        }
        const opened = await NoteSync.open({
          userId, noteId, clientId: getClientId(), tabSessionId: getTabSessionId(), api: notesApi, store,
          shared: isSharedNote(metadata),
          onState: (state) => { if (active) setSync(state) },
          onAck: (revisionNumber) => {
            // This tab's own save: a cached head older than it is never shown again.
            acknowledgeNoteRevision(queryClient, userId, noteId, revisionNumber)
            callbacks.current.onAck?.(revisionNumber, engine.current?.title ?? null)
          },
          onAccessDenied: (denied) => { if (active) notifyApiError(denied) },
          onNoteIsLive: () => { if (active) callbacks.current.onNoteIsLive?.() },
        }, { revisionNumber: checkpoint.revision.revisionNumber, document: gate.document, title: gate.document.metadata.title ?? '' })
        if (!active) { void opened.dispose(); return }
        engine.current = opened
        openEngines.add(opened)
        shownRevision.current = null
        setRepaired(gate.repaired)
        setDocument(opened.document ?? gate.document)
        setSync(opened.current)
        setVersion((value) => value + 1)
        setPhase('ready')
      } catch (error) {
        if (!active || controller.signal.aborted) return
        if (error instanceof ApiError && error.code === 'NOTE_ACCESS_DENIED') {
          await store.remove(syncKey(userId, noteId)).catch(() => {})
          setDocument(null); setPhase('no-access'); return
        }
        if (error instanceof ApiError && (error.code === 'NOTE_NOT_FOUND' || error.status === 404)) {
          await store.remove(syncKey(userId, noteId)).catch(() => {})
          setDocument(null); setPhase('not-found'); return
        }
        if (error instanceof ApiError && error.code === 'INVALID_SERVER_DOCUMENT') {
          // The cached read is that same unreadable document: never reuse it.
          forgetNoteOpen(queryClient, userId, noteId)
          setPhase('error'); setErrorMessage('This note’s content couldn’t be opened safely.'); return
        }
        // Offline or failing: keep showing the cached copy read-only if there is one.
        setPhase((current) => (current === 'cached' ? 'cached' : 'error'))
        setErrorMessage('We couldn’t load the latest version of this note.')
      }
    })()

    return () => {
      active = false
      controller.abort()
      const closing = engine.current
      engine.current = null
      if (closing) void closing.flushNow().finally(() => { openEngines.delete(closing); void closing.dispose() })
      // Written here: the cached head predates these edits, so the next open reads afresh.
      if (wrote.current) forgetNoteOpen(queryClient, userId, noteId)
    }
  }, [userId, noteId, attempt, live, hold, queryClient])

  // Reconnect: confirm the session is still valid, then send this note's pending edits right away.
  useEffect(() => {
    if (live) return
    const onOnline = () => { void authClient.getSession().then((result) => { if (result.data?.user) void engine.current?.flushNow() }) }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [live])

  // Leaving with unsent legacy edits asks first: the guard is registered only while this
  // queue holds work (live notes report through the Liveblocks client's local-update tracking).
  const leaveKey = `note-sync:${noteId}`
  useEffect(() => {
    if (live) return
    setLeaveGuard(leaveKey, Boolean(sync && sync.pending > 0))
  }, [live, sync, leaveKey])
  useEffect(() => () => setLeaveGuard(leaveKey, false), [leaveKey])

  const record = useCallback((change: EditorChange) => {
    if (!canEditRef.current || !engine.current) return
    if (change.mode !== 'none') wrote.current = true
    engine.current.record(change)
  }, [])
  const rename = useCallback(
    (title: string) => {
      if (!canEditRef.current) return
      wrote.current = true
      engine.current?.rename(title)
    },
    [],
  )
  const flush = useCallback(async (): Promise<SyncState | null> => {
    if (live) {
      // The room is the write path: wait (bounded) for Liveblocks to acknowledge local updates,
      // then checkpoint the room now (`POST …/checkpoints`), so selection-based requests name a
      // revision that holds the text on screen. Viewers cannot checkpoint: they get the head.
      const client = liveblocksClient()
      const deadline = Date.now() + LIVE_FLUSH_WAIT_MS
      while (client.getSyncStatus() !== 'synchronized' && Date.now() < deadline) await sleep(100)
      if (client.getSyncStatus() !== 'synchronized') return { status: 'saving', pending: 1, revisionNumber: lastRevision.current }
      try {
        if (canEditRef.current) {
          try {
            const saved = await notesApi.saveNow(noteId)
            lastRevision.current = saved.revision.revisionNumber
            acknowledgeNoteRevision(queryClient, userId, noteId, saved.revision.revisionNumber)
            return { status: 'saved', pending: 0, revisionNumber: lastRevision.current }
          } catch (error) {
            // Unshared meanwhile, or edit access gone: fall back to the head like a viewer.
            if (!isApiError(error, 'NOTE_NOT_SHARED') && !isApiError(error, 'NOTE_ACCESS_DENIED')) throw error
          }
        }
        const head = await notesApi.checkpoint(noteId)
        lastRevision.current = head.revision.revisionNumber
        return { status: 'saved', pending: 0, revisionNumber: lastRevision.current }
      } catch {
        // Busy, unavailable or offline: report unsaved so callers ask the user to retry.
        return { status: 'offline', pending: 1, revisionNumber: lastRevision.current }
      }
    }
    if (!canEditRef.current) return engine.current?.current ?? null
    const current = engine.current
    if (!current) return null
    await current.flushNow()
    return current.current
  }, [live, noteId, queryClient, userId])
  const markAccessDenied = useCallback((error: unknown) => {
    if (live) {
      if (!canEditRef.current) return
      canEditRef.current = false
      setCanEdit(false)
      if (error instanceof ApiError) notifyApiError(error)
      return
    }
    engine.current?.markAccessDenied(error)
  }, [live])
  const reloadFromServer = useCallback(async () => {
    const current = engine.current
    if (!current) return
    try {
      const next = await current.takeServer()
      setDocument(next)
      setVersion((value) => value + 1)
    } catch (error) {
      // A denied checkpoint read means access was lost mid-session: toast and go read-only
      // like any other mid-session denial. Callers still see the throw to dismiss their dialog.
      if (isApiError(error, 'NOTE_ACCESS_DENIED')) current.markAccessDenied(error)
      throw error
    }
  }, [])
  const keepMine = useCallback(async () => {
    const current = engine.current
    if (!current) return
    try {
      await current.keepMine()
    } catch (error) {
      if (isApiError(error, 'NOTE_ACCESS_DENIED')) current.markAccessDenied(error)
      throw error
    }
  }, [])
  const applyServerHead = useCallback(async () => {
    if (live) {
      try {
        const latest = await notesApi.checkpoint(noteId)
        const gate = loadDocument(latest.document)
        if (!gate.ok) throw new ApiError(422, 'INVALID_SERVER_DOCUMENT', null, null)
        rememberCheckpoint(queryClient, userId, noteId, latest)
        lastRevision.current = latest.revision.revisionNumber
        setHeadRevision(latest.revision.revisionNumber)
        setDocument(gate.document)
        setVersion((value) => value + 1)
      } catch (error) {
        if (isApiError(error, 'NOTE_ACCESS_DENIED')) markAccessDenied(error)
        throw error
      }
      return
    }
    const current = engine.current
    if (!current) return
    try {
      const latest = await notesApi.checkpoint(noteId)
      const gate = loadDocument(latest.document)
      if (!gate.ok) throw new ApiError(422, 'INVALID_SERVER_DOCUMENT', null, null)
      await current.adoptHead(gate.document, latest.revision.revisionNumber)
      rememberCheckpoint(queryClient, userId, noteId, latest)
      setDocument(gate.document)
      setVersion((value) => value + 1)
    } catch (error) {
      // A denied checkpoint read means access was lost mid-session: toast and go read-only
      // like any other mid-session denial. Callers still see the throw to dismiss their dialog.
      if (isApiError(error, 'NOTE_ACCESS_DENIED')) current.markAccessDenied(error)
      throw error
    }
  }, [noteId, live, markAccessDenied, queryClient, userId])
  const restore = useCallback(async (revisionId: string) => {
    try {
      await notesApi.restore(noteId, revisionId)
      // Legacy: a restore is a new version, loaded explicitly. Live: the server wrote it into the room.
      await applyServerHead()
    } catch (error) {
      if (isApiError(error, 'NOTE_ACCESS_DENIED')) markAccessDenied(error)
      throw error
    }
  }, [noteId, applyServerHead, markAccessDenied])
  const carryOverRef = useRef(carryOver)
  useEffect(() => { carryOverRef.current = carryOver })
  const runCarryOver = useCallback(async (apply: (carryOver: LiveCarryOver) => void) => {
    const key = syncKey(userId, noteId)
    const run = async () => {
      const current = carryOverRef.current
      if (!current) return
      // Another tab may have carried this queue already: only a queue still on disk is applied.
      const stored = await noteSyncStore().get(key).catch(() => undefined)
      carryOverRef.current = null
      setCarryOver(null)
      if (!stored || !hasPendingWork(stored)) return
      apply(current)
      await noteSyncStore().remove(key).catch(() => {})
    }
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined
    if (!locks) { await run(); return }
    // One tab per queue: a tab that cannot take the lock leaves the carry-over to the holder.
    await locks.request(`incantly-carry-over:${key}`, { ifAvailable: true }, async (lock) => {
      if (!lock) { carryOverRef.current = null; setCarryOver(null); return }
      await run()
    })
  }, [userId, noteId])

  return {
    phase, canEdit, live, document, instantSource, version, sync, headRevision, repaired, errorMessage, carryOver, runCarryOver,
    record, flush, rename, keepMine, takeServer: reloadFromServer, applyServerHead, restore, markAccessDenied,
    retry: () => { setPhase('loading'); setErrorMessage(undefined); setAttempt((value) => value + 1) },
  }
}

/**
 * Sends pending work for notes that are not open (e.g. after reconnecting or a reload).
 * Each note is opened against its server checkpoint, flushed, then closed. A live note
 * answers `409 NOTE_IS_LIVE` and keeps its work for the live screen to carry over.
 */
export async function resumePendingNotes(userId: string, exceptNoteId?: string) {
  const store = noteSyncStore()
  const records = (await store.listForUser(userId).catch(() => [])).filter((record) => hasPendingWork(record) && record.noteId !== exceptNoteId)
  for (const record of records) {
    try {
      const [metadata, checkpoint] = await Promise.all([notesApi.get(record.noteId), notesApi.checkpoint(record.noteId)])
      const gate = loadDocument(checkpoint.document)
      if (!gate.ok) continue
      const sync = await NoteSync.open({ userId, noteId: record.noteId, clientId: getClientId(), tabSessionId: getTabSessionId(), api: notesApi, store, shared: isSharedNote(metadata) }, { revisionNumber: checkpoint.revision.revisionNumber, document: gate.document, title: gate.document.metadata.title ?? '' })
      await sync.flushNow()
      await sync.dispose()
    } catch (error) {
      if (error instanceof ApiError && (error.status === 404 || error.code === 'NOTE_ACCESS_DENIED')) await store.remove(record.key).catch(() => {})
    }
  }
}
