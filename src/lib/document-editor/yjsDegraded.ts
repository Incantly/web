import type { IncantlyDocument } from '@incantly/canvas-core/document'
import { ApiError } from '../api/errors'
import { notesApi } from '../api/notes'
import { checkDocumentForSave, loadDocument } from '../notes/documentGate'
import type { EditorChange } from '../notes/noteSync'

/**
 * Degraded/offline interplay for Yjs-flagged notes (Yjs migration Phase 4).
 *
 * - Room loss, budget exhaustion, and offline fall back to the existing `noteSync` behavior and
 *   UI: the same session open flow, the same sync status, the same live-collab notices. No new
 *   UI is introduced here; a degraded Yjs note is indistinguishable from a legacy note. Unshared
 *   notes are never degraded: with no room by design, `noteSync` is their correct path.
 * - Returning to live re-seeds Yjs from the head checkpoint and resumes; the reseed is never a
 *   merge (head content wins, exactly like `takeServer`).
 * - Exactly one writer is ever constructed per note (the Phase 0 dual-write guard): the Yjs fold
 *   and `noteSync` send paths are never alive together. Transitions dispose one side before
 *   opening the other.
 *
 * The host (P1 session wiring) opens the initial writer through the existing flows, attaches it,
 * and feeds room/online/budget signals from `useLiveCollab` + `subscribeOnlineStatus`. The
 * coordinator owns every transition after that. Legacy notes never transition: their signals
 * always select `noteSync`.
 */

/** Which writer owns a note right now. Exactly one is ever constructed (dual-write guard). */
export type CollabWriter = 'yjs' | 'noteSync'

/** Why a Yjs-flagged note fell back to saved sync. Legacy notes are never degraded. */
export type YjsDegradedReason = 'room-loss' | 'budget-exhausted' | 'offline'

/** Mirrors `LiveConnectionState` (liveCollabModel.ts) without importing the workspace layer. */
export type YjsRoomConnection = 'connecting' | 'live' | 'reconnecting' | 'unavailable'

/** Mirrors the live-status `mode` the degraded path already joins on. */
export type YjsLiveMode = 'live' | 'saved_sync'

export type YjsDegradedSignals = {
  /** P0 `CollabMode` via `collabModeOf(liveStatus)` (the single-writer flag read point); widened so unknown server values degrade to legacy. */
  collabMode: string | null | undefined
  connection: YjsRoomConnection
  online: boolean
  liveMode: YjsLiveMode | null
  /** Live-status `reason` when paused; narrows budget exhaustion from other pauses. */
  liveReason?: string | null
}

/**
 * Selects the writer for a note. Yjs owns the note only when the server flagged it AND the room
 * is connected AND the browser is online AND live is open; every other combination — including
 * any unknown flag value — stays on the existing `noteSync` path.
 */
export function selectCollabWriter(signals: YjsDegradedSignals): CollabWriter {
  if (signals.collabMode !== 'yjs') return 'noteSync'
  if (!signals.online) return 'noteSync'
  if (signals.liveMode !== 'live') return 'noteSync'
  if (signals.connection !== 'live') return 'noteSync'
  return 'yjs'
}

/**
 * Why a Yjs-flagged note is degraded, or null when it is live on Yjs. Null for legacy notes:
 * `noteSync` is their only path, not a fallback. A non-budget pause (guard, unshared) reports
 * `room-loss` — live is unavailable either way, and the existing notice copy already names pauses.
 * Unshared notes report null: with no room by design, `noteSync` is correct, not degraded.
 */
export function yjsDegradedReason(signals: YjsDegradedSignals): YjsDegradedReason | null {
  if (selectCollabWriter(signals) === 'yjs') return null
  if (signals.collabMode !== 'yjs') return null
  if (!signals.online) return 'offline'
  if (signals.liveMode !== 'live') {
    if (signals.liveReason === 'NOT_SHARED') return null
    return signals.liveReason === 'BUDGET_EXHAUSTED' ? 'budget-exhausted' : 'room-loss'
  }
  return 'room-loss'
}

/** `navigator.onLine` with an online default outside the browser (SSR, workers). */
export function isOnline(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean') return true
  return navigator.onLine
}

/**
 * Browser online/offline transitions. No-op outside the browser; returns an unsubscribe.
 * The host re-feeds `updateSignals` on every call — this is the offline leg of Phase 4.
 */
export function subscribeOnlineStatus(listener: (online: boolean) => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const onOnline = () => listener(true)
  const onOffline = () => listener(false)
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
  return () => {
    window.removeEventListener('online', onOnline)
    window.removeEventListener('offline', onOffline)
  }
}

/** Head checkpoint gated for use as a seed: untrusted JSON until `loadDocument` passes. */
export type YjsHeadCheckpoint = { revisionNumber: number; document: IncantlyDocument; title: string }

/**
 * Re-reads the head checkpoint for a reseed, through the same load gate the session open uses.
 * Throws `INVALID_SERVER_DOCUMENT` (422) when the head cannot be read safely — the caller aborts
 * the transition and stays on its current writer, exactly like a failed `takeServer`.
 */
export async function readYjsHeadCheckpoint(noteId: string, signal?: AbortSignal): Promise<YjsHeadCheckpoint> {
  const checkpoint = await notesApi.checkpoint(noteId, signal)
  const gate = loadDocument(checkpoint.document)
  if (!gate.ok) throw new ApiError(422, 'INVALID_SERVER_DOCUMENT', null, null)
  return { revisionNumber: checkpoint.revision.revisionNumber, document: gate.document, title: gate.document.metadata.title ?? '' }
}

/**
 * Crash-recovery precedence (P4 persistence contract): the sync record remains the persistence
 * source of truth on reload. A persisted Yjs snapshot is restored only when the sync record has
 * no pending work; otherwise the snapshot predates the degraded writer's edits and is discarded.
 * Implemented by the P1 open flow via `yjsPersistence.ts`.
 */
export function shouldRestoreYjsSnapshot(state: { hasPendingSyncWork: boolean }): boolean {
  return !state.hasPendingSyncWork
}

/**
 * The P1 Yjs binding surface the coordinator drives. `reseed` also serves the P3 restore path
 * (a restore still re-seeds); the coordinator itself always constructs a fresh binding seeded
 * from the head, which is the same guarantee through construction rather than in place.
 */
export type YjsBindingHandle = {
  /** Replaces binding content with the head checkpoint (never a merge). */
  reseed(document: IncantlyDocument, revisionNumber: number): void
  /** Best-effort fold flush before teardown; failures are non-fatal (see `unsavedDocument`). */
  flush?: () => Promise<void>
  /** Last folded canonical document not yet acknowledged, or null when the fold is clean. */
  unsavedDocument?: () => IncantlyDocument | null
  destroy(): void
}

/** The `NoteSync` surface the coordinator drives on the degraded path (structural; `NoteSync` satisfies it). */
export type NoteSyncWriterHandle = {
  record(change: EditorChange): void
  flushNow(): Promise<void>
  dispose(): Promise<void>
}

export type YjsCoordinatorOptions = {
  /** Re-reads the head checkpoint (usually `readYjsHeadCheckpoint` bound to the note). */
  readHead: () => Promise<YjsHeadCheckpoint>
  /** Opens the degraded writer exactly as the legacy session does (`NoteSync.open`). */
  openNoteSync: (head: YjsHeadCheckpoint) => Promise<NoteSyncWriterHandle> | NoteSyncWriterHandle
  /** Constructs the Yjs writer seeded from the head (P1 binding open). */
  openYjs: (head: YjsHeadCheckpoint) => Promise<YjsBindingHandle> | YjsBindingHandle
  /**
   * Fires on every writer change (and on reason-only changes while degraded, so the host can
   * refresh notices). Null means no writer could be constructed; the host shows its error UI and
   * the next signal change retries.
   */
  onWriterChange?: (writer: CollabWriter | null, reason: YjsDegradedReason | null) => void
}

/**
 * Owns the single writer for one open note and transitions it as room/online/budget signals move.
 * Transitions serialize in signal order (last one wins); every step degrades toward keeping a
 * writer rather than stranding the note writerless. Never throws except on a double attach,
 * which is a host bug.
 *
 * Adoption note: the hook-based session drives transitions instead — `NoteRoute`
 * selects via `selectCollabWriter` and remounts the session scope on a flip
 * (teardown flushes pending work first), which is this class's open/degrade/
 * recover cycle expressed through React lifecycles. This imperative coordinator
 * stays available (and fully reviewed) for a host that needs transitions without
 * a remount; do not construct both for one note.
 */
export class YjsSessionCoordinator {
  private readonly options: YjsCoordinatorOptions
  private writer: CollabWriter | null = null
  private reason: YjsDegradedReason | null = null
  private signals: YjsDegradedSignals | null = null
  private yjs: YjsBindingHandle | null = null
  private sync: NoteSyncWriterHandle | null = null
  private lastHead: YjsHeadCheckpoint | null = null
  private tail: Promise<void> = Promise.resolve()
  private disposed = false
  /** Set once the host attaches its initial writer; signals before attach are ignored (no writer is constructed until the host's handle is owned, so attach can never throw with two writers alive). */
  private attached = false

  constructor(options: YjsCoordinatorOptions) {
    this.options = options
  }

  /** The attached writer, or null before attach / after dispose / when no writer could open. */
  get current(): CollabWriter | null { return this.writer }

  /** Why the note is degraded, or null when live on Yjs or on the legacy path. */
  get degradedReason(): YjsDegradedReason | null { return this.reason }

  /** Last head checkpoint seen (attach or transition); the offline fallback when a re-read fails. */
  get head(): YjsHeadCheckpoint | null { return this.lastHead }

  /** Attaches the Yjs writer the host opened (P1 open flow). Exactly once per coordinator. */
  attachYjs(binding: YjsBindingHandle, head: YjsHeadCheckpoint): void {
    this.attach('yjs', binding, head)
  }

  /** Attaches the noteSync writer the host opened (existing session open flow). Exactly once per coordinator. */
  attachNoteSync(sync: NoteSyncWriterHandle, head: YjsHeadCheckpoint): void {
    this.attach('noteSync', sync, head)
  }

  private attach(writer: CollabWriter, handle: YjsBindingHandle | NoteSyncWriterHandle, head: YjsHeadCheckpoint): void {
    if (this.disposed) return
    if (this.writer !== null) throw new Error(`YjsSessionCoordinator: ${this.writer} is already attached`)
    this.writer = writer
    if (writer === 'yjs') this.yjs = handle as YjsBindingHandle
    else this.sync = handle as NoteSyncWriterHandle
    this.lastHead = head
    this.attached = true
    this.enqueue()
  }

  /** Feeds fresh signals; transitions writers when the wanted writer changes. Never throws. */
  updateSignals(signals: YjsDegradedSignals): void {
    if (this.disposed) return
    this.signals = signals
    this.enqueue()
  }

  /** Resolves once every queued transition has applied. */
  whenSettled(): Promise<void> {
    return this.tail
  }

  /** Tears down the attached writer. Pending work stays persisted for the next open. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    const yjs = this.yjs
    const sync = this.sync
    this.yjs = null
    this.sync = null
    this.writer = null
    const teardown = async () => {
      try { yjs?.destroy() } catch {}
      try { await sync?.dispose() } catch {}
    }
    this.tail = this.tail.then(teardown, teardown)
  }

  private enqueue(): void {
    if (this.disposed || !this.attached || this.signals === null) return
    const signals = this.signals
    this.tail = this.tail.then(() => this.apply(signals), () => this.apply(signals))
  }

  private async apply(signals: YjsDegradedSignals): Promise<void> {
    if (this.disposed || !this.attached) return
    const wanted = selectCollabWriter(signals)
    const reason = yjsDegradedReason(signals)
    if (this.writer === null) {
      await this.openFresh(wanted, reason)
      return
    }
    if (wanted === this.writer) {
      if (reason !== this.reason) {
        this.reason = reason
        this.options.onWriterChange?.(this.writer, reason)
      }
      return
    }
    if (wanted === 'noteSync') await this.degrade(reason)
    else await this.recover()
  }

  /** Opens the wanted writer after a total failure left the note writerless; the next signal change retries. */
  private async openFresh(wanted: CollabWriter, reason: YjsDegradedReason | null): Promise<void> {
    let head: YjsHeadCheckpoint | null = null
    try { head = await this.options.readHead() } catch { head = this.lastHead }
    if (this.disposed) return
    if (!head) return
    this.lastHead = head
    try {
      if (wanted === 'yjs') {
        const yjs = await this.options.openYjs(head)
        if (this.disposed) {
          try { yjs.destroy() } catch {}
          return
        }
        this.yjs = yjs
        this.writer = 'yjs'
        this.reason = null
      } else {
        const sync = await this.options.openNoteSync(head)
        if (this.disposed) {
          try { await sync.dispose() } catch {}
          return
        }
        this.sync = sync
        this.writer = 'noteSync'
        this.reason = reason
      }
      this.options.onWriterChange?.(this.writer, this.reason)
    } catch {}
  }

  /**
   * Yjs → noteSync: re-reads the head first (fallback: last known head — a stale base simply
   * re-bases through the existing conflict machinery), best-effort flushes the fold, destroys the
   * Yjs side, then opens noteSync exactly as the legacy session does. A folded-but-unflushed
   * document is recorded into noteSync as a checkpoint change, so no keystroke is lost even when
   * the fold flush failed offline. Aborts — keeping the Yjs writer converging locally — when no
   * head is available at all.
   */
  private async degrade(reason: YjsDegradedReason | null): Promise<void> {
    const binding = this.yjs
    if (this.writer !== 'yjs' || !binding) return
    let head: YjsHeadCheckpoint | null = null
    try { head = await this.options.readHead() } catch { head = this.lastHead }
    if (this.disposed) return
    if (!head) return
    this.lastHead = head
    try { await binding.flush?.() } catch {}
    if (this.disposed) return
    let unsaved: IncantlyDocument | null = null
    try { unsaved = binding.unsavedDocument?.() ?? null } catch { unsaved = null }
    try { binding.destroy() } catch {}
    this.yjs = null
    let sync: NoteSyncWriterHandle
    try {
      sync = await this.options.openNoteSync(head)
    } catch {
      // noteSync failed to open (broken store): restore a Yjs writer rather than strand the note writerless.
      await this.restoreYjs(head)
      return
    }
    if (this.disposed) {
      try { await sync.dispose() } catch {}
      return
    }
    this.sync = sync
    this.writer = 'noteSync'
    this.reason = reason
    if (unsaved) {
      // Defense-in-depth: the fold gate should have passed already, but the handle type cannot
      // enforce it — drop unvalidatable output and keep the head rather than recording it.
      const gate = checkDocumentForSave(unsaved)
      if (gate.ok) {
        try { sync.record({ mode: 'checkpoint', operations: [], document: gate.document }) } catch {}
      }
    }
    this.options.onWriterChange?.('noteSync', reason)
  }

  /**
   * noteSync → Yjs: best-effort flushes noteSync, re-reads the head checkpoint (aborts — staying
   * degraded, with the existing noteSync retry machinery owning recovery — when the re-read
   * fails), disposes noteSync, then constructs the Yjs writer seeded from that head. The reseed
   * is never a merge: head content wins, exactly like `takeServer`.
   */
  private async recover(): Promise<void> {
    const sync = this.sync
    if (this.writer !== 'noteSync' || !sync) return
    try { await sync.flushNow() } catch {}
    if (this.disposed) return
    let head: YjsHeadCheckpoint | null = null
    try { head = await this.options.readHead() } catch { head = null }
    if (this.disposed) return
    if (!head) return
    this.lastHead = head
    try { await sync.dispose() } catch {}
    if (this.disposed) return
    this.sync = null
    let yjs: YjsBindingHandle
    try {
      yjs = await this.options.openYjs(head)
    } catch {
      // Yjs failed to construct (broken binding): restore a noteSync writer rather than strand the note writerless.
      await this.restoreNoteSync(head)
      return
    }
    if (this.disposed) {
      try { yjs.destroy() } catch {}
      return
    }
    this.yjs = yjs
    this.writer = 'yjs'
    this.reason = null
    this.options.onWriterChange?.('yjs', null)
  }

  private async restoreYjs(head: YjsHeadCheckpoint): Promise<void> {
    try {
      const yjs = await this.options.openYjs(head)
      if (this.disposed) {
        try { yjs.destroy() } catch {}
        return
      }
      this.yjs = yjs
      this.writer = 'yjs'
      this.options.onWriterChange?.('yjs', this.reason)
    } catch {
      if (this.disposed) return
      this.writer = null
      this.options.onWriterChange?.(null, this.reason)
    }
  }

  private async restoreNoteSync(head: YjsHeadCheckpoint): Promise<void> {
    try {
      const sync = await this.options.openNoteSync(head)
      if (this.disposed) {
        try { await sync.dispose() } catch {}
        return
      }
      this.sync = sync
      this.writer = 'noteSync'
      this.options.onWriterChange?.('noteSync', this.reason)
    } catch {
      if (this.disposed) return
      this.writer = null
      this.options.onWriterChange?.(null, this.reason)
    }
  }
}
