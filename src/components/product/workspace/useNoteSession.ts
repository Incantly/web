'use client'

import type { IncantlyDocument } from '@incantly/canvas-core/document'
import { useCallback, useEffect, useRef, useState } from 'react'
import { authClient } from '../../../lib/auth-client'
import { ApiError, isApiError } from '../../../lib/api/errors'
import { isSharedNote, notesApi } from '../../../lib/api/notes'
import { loadDocument } from '../../../lib/notes/documentGate'
import { NoteSync, type EditorChange, type SyncState } from '../../../lib/notes/noteSync'
import { IndexedDbNoteSyncStore, getClientId, hasPendingWork, syncKey, type NoteSyncStore } from '../../../lib/notes/syncStore'
import { notifyApiError } from '../ApiErrorToaster'

let sharedStore: NoteSyncStore | null = null
export function noteSyncStore() {
  sharedStore ??= new IndexedDbNoteSyncStore()
  return sharedStore
}

export type NoteSessionPhase = 'loading' | 'cached' | 'ready' | 'not-found' | 'no-access' | 'error'

export type NoteSession = {
  phase: NoteSessionPhase
  /** What the editor shows. While `cached`, it is a read-only local copy until the server answers. */
  document: IncantlyDocument | null
  /** Changes when the editor must reload its document (conflict resolution, restore). */
  version: number
  sync: SyncState | null
  repaired: boolean
  errorMessage?: string
  record: (change: EditorChange) => void
  /** Sends pending edits now; resolves to the sync state after (`pending` > 0 means some are still waiting). */
  flush: () => Promise<SyncState | null>
  rename: (title: string) => void
  keepMine: () => Promise<void>
  takeServer: () => Promise<void>
  restore: (revisionId: string) => Promise<void>
  retry: () => void
  /** Access was lost mid-session elsewhere (suggestion decisions, undo): toast and go read-only, keep edits. */
  markAccessDenied: (error: unknown) => void
}

/**
 * Opens one note: local cache first (read-only, marked syncing), then the authorized server metadata
 * (which also says whether the note is shared) and checkpoint through the load gate, then live sync.
 * Flushes and persists pending work on close.
 * Render it under a component keyed by note ID so each note starts with fresh state.
 */
export function useNoteSession(userId: string, noteId: string, options: { onAck?: (revisionNumber: number, title: string | null) => void } = {}): NoteSession {
  const [phase, setPhase] = useState<NoteSessionPhase>('loading')
  const [document, setDocument] = useState<IncantlyDocument | null>(null)
  const [sync, setSync] = useState<SyncState | null>(null)
  const [version, setVersion] = useState(0)
  const [repaired, setRepaired] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string>()
  const [attempt, setAttempt] = useState(0)
  const engine = useRef<NoteSync | null>(null)
  const onAck = useRef(options.onAck)
  useEffect(() => { onAck.current = options.onAck })

  useEffect(() => {
    let live = true
    const controller = new AbortController()
    const store = noteSyncStore()
    void (async () => {
      // 1) Instant open from this device's cache (untrusted: it still passes the load gate).
      const cached = await store.get(syncKey(userId, noteId)).catch(() => undefined)
      if (live && cached?.lastDocument) {
        const gate = loadDocument(cached.lastDocument)
        if (gate.ok) { setDocument(gate.document); setPhase('cached') }
      }
      // 2) The server copy is the authority.
      try {
        const [metadata, checkpoint] = await Promise.all([
          notesApi.get(noteId, controller.signal),
          notesApi.checkpoint(noteId, controller.signal),
        ])
        const gate = loadDocument(checkpoint.document)
        if (!gate.ok) throw new ApiError(422, 'INVALID_SERVER_DOCUMENT', null, null)
        const opened = await NoteSync.open({
          userId, noteId, clientId: getClientId(), api: notesApi, store,
          shared: isSharedNote(metadata),
          onState: (state) => { if (live) setSync(state) },
          onAck: (revisionNumber) => onAck.current?.(revisionNumber, engine.current?.title ?? null),
          onAccessDenied: (denied) => { if (live) notifyApiError(denied) },
        }, { revisionNumber: checkpoint.revision.revisionNumber, document: gate.document, title: gate.document.metadata.title ?? '' })
        if (!live) { void opened.dispose(); return }
        engine.current = opened
        setRepaired(gate.repaired)
        setDocument(opened.document ?? gate.document)
        setSync(opened.current)
        setVersion((value) => value + 1)
        setPhase('ready')
      } catch (error) {
        if (!live || controller.signal.aborted) return
        if (error instanceof ApiError && error.code === 'NOTE_ACCESS_DENIED') {
          await store.remove(syncKey(userId, noteId)).catch(() => {})
          setDocument(null); setPhase('no-access'); return
        }
        if (error instanceof ApiError && (error.code === 'NOTE_NOT_FOUND' || error.status === 404)) {
          await store.remove(syncKey(userId, noteId)).catch(() => {})
          setDocument(null); setPhase('not-found'); return
        }
        if (error instanceof ApiError && error.code === 'INVALID_SERVER_DOCUMENT') {
          setPhase('error'); setErrorMessage('This note’s content couldn’t be opened safely.'); return
        }
        // Offline or failing: keep showing the cached copy read-only if there is one.
        setPhase((current) => (current === 'cached' ? 'cached' : 'error'))
        setErrorMessage('We couldn’t load the latest version of this note.')
      }
    })()

    return () => {
      live = false
      controller.abort()
      const closing = engine.current
      engine.current = null
      if (closing) void closing.flushNow().finally(() => closing.dispose())
    }
  }, [userId, noteId, attempt])

  // Reconnect: confirm the session is still valid, then send this note's pending edits right away.
  useEffect(() => {
    const onOnline = () => { void authClient.getSession().then((result) => { if (result.data?.user) void engine.current?.flushNow() }) }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [])

  const record = useCallback((change: EditorChange) => engine.current?.record(change), [])
  const rename = useCallback((title: string) => engine.current?.rename(title), [])
  const flush = useCallback(async () => {
    const current = engine.current
    if (!current) return null
    await current.flushNow()
    return current.current
  }, [])
  const markAccessDenied = useCallback((error: unknown) => engine.current?.markAccessDenied(error), [])
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
  const restore = useCallback(async (revisionId: string) => {
    try {
      await notesApi.restore(noteId, revisionId)
      await reloadFromServer()
    } catch (error) {
      if (isApiError(error, 'NOTE_ACCESS_DENIED')) markAccessDenied(error)
      throw error
    }
  }, [noteId, reloadFromServer, markAccessDenied])

  return { phase, document, version, sync, repaired, errorMessage, record, flush, rename, keepMine, takeServer: reloadFromServer, restore, markAccessDenied, retry: () => { setPhase('loading'); setErrorMessage(undefined); setAttempt((value) => value + 1) } }
}

/**
 * Sends pending work for notes that are not open (e.g. after reconnecting or a reload).
 * Each note is opened against its server checkpoint, flushed, then closed.
 */
export async function resumePendingNotes(userId: string, exceptNoteId?: string) {
  const store = noteSyncStore()
  const records = (await store.listForUser(userId).catch(() => [])).filter((record) => hasPendingWork(record) && record.noteId !== exceptNoteId)
  for (const record of records) {
    try {
      const [metadata, checkpoint] = await Promise.all([notesApi.get(record.noteId), notesApi.checkpoint(record.noteId)])
      const gate = loadDocument(checkpoint.document)
      if (!gate.ok) continue
      const sync = await NoteSync.open({ userId, noteId: record.noteId, clientId: getClientId(), api: notesApi, store, shared: isSharedNote(metadata) }, { revisionNumber: checkpoint.revision.revisionNumber, document: gate.document, title: gate.document.metadata.title ?? '' })
      await sync.flushNow()
      await sync.dispose()
    } catch (error) {
      if (error instanceof ApiError && (error.status === 404 || error.code === 'NOTE_ACCESS_DENIED')) await store.remove(record.key).catch(() => {})
    }
  }
}
