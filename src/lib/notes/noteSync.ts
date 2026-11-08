import { normalizeDocument, type DocumentOperation, type IncantlyDocument } from '@incantly/canvas-core/document'
import { ApiError, NETWORK_ERROR, apiErrorMessage } from '../api/errors'
import type { NoteCheckpoint, NoteTransaction, NoteTransactionAck, NoteRevisionDto } from '../api/notes'
import { diffDocuments, diffTransactionGroups, hasNonTransmittableChanges } from './documentDiff'
import { checkDocumentForSave, loadDocument, withTitle } from './documentGate'
import { hasPendingWork, syncKey, type NoteSyncRecord, type NoteSyncStore } from './syncStore'

export type SyncStatus = 'saved' | 'saving' | 'offline' | 'conflict' | 'error' | 'gone' | 'denied'
export type SyncState = { status: SyncStatus; pending: number; revisionNumber: number; message?: string }

/** What the editor reports per change (subset of `CanonicalDocumentChangeEvent`). */
export type EditorChange = { mode: 'none' | 'incremental' | 'checkpoint'; operations: readonly DocumentOperation[]; document: IncantlyDocument }

export type NoteSyncApi = {
  transact(noteId: string, transaction: NoteTransaction): Promise<NoteTransactionAck>
  saveCheckpoint(noteId: string, baseRevisionNumber: number, document: IncantlyDocument): Promise<{ revision: NoteRevisionDto }>
  checkpoint(noteId: string): Promise<NoteCheckpoint>
}

export type NoteSyncOptions = {
  userId: string
  noteId: string
  clientId: string
  /** Per-tab session ID; lets the server tell same-browser tabs apart. */
  tabSessionId: string
  api: NoteSyncApi
  store: NoteSyncStore
  onState?: (state: SyncState) => void
  onAck?: (revisionNumber: number) => void
  /** Called once the server reports NOTE_ACCESS_DENIED mid-session (toast + read-only). */
  onAccessDenied?: (error: ApiError) => void
  /** True when the note metadata carries a collaboration: full saves convert to transactions, never PUT. */
  shared?: boolean
  /** Idle time before sending a batch (default 1000 ms) and the per-batch op cap (default 200). */
  idleMs?: number
  maxOps?: number
  /** Retry delay while offline or the server is busy (default 5000 ms). */
  retryMs?: number
  schedule?: (fn: () => void, ms: number) => () => void
  now?: () => number
  newTransactionId?: () => string
}

const MAX_OPS_PER_REQUEST = 1000
const STOP_CODES = new Set(['TRANSACTION_ID_REUSED', 'CLIENT_SEQUENCE_REUSED', 'CLIENT_SEQUENCE_OUT_OF_ORDER', 'IDEMPOTENCY_KEY_REUSED'])
const CONFLICT_CODES = new Set(['NOTE_TRANSACTION_CONFLICT', 'STALE_NOTE_REVISION'])
/** Immediate rebase attempts per failure before the wedge dialog appears (the background loop keeps retrying). */
const MAX_RECOVER_ATTEMPTS = 2
/** A background wedge-recovery retry backs off at most this far apart. */
const RECOVERY_LOOP_MAX_MS = 60_000
/** While typing without pause, unsent work still flushes at least this often. */
const FLUSH_MAX_AGE_MS = 2_000

/**
 * True when the body carries anything a rebase must not silently drop: visible text or
 * referenced media/figures. Recovery placeholders count only when they carry such content.
 */
function hasCarriedContent(document: IncantlyDocument): boolean {
  const stack: unknown[] = [...document.content]
  while (stack.length > 0) {
    const node = stack.pop() as { text?: unknown; content?: unknown; type?: unknown; attrs?: unknown } | null | undefined
    if (!node || typeof node !== 'object') continue
    if (typeof node.text === 'string' && node.text.length > 0) return true
    if (node.type === 'figure' || node.type === 'image' || node.type === 'video' || node.type === 'audio' || node.type === 'file') return true
    const attrs = node.attrs as { figureId?: unknown; assetId?: unknown } | null | undefined
    if (attrs && (typeof attrs.figureId === 'string' || typeof attrs.assetId === 'string')) return true
    if (Array.isArray(node.content)) stack.push(...node.content)
  }
  return false
}

const defaultSchedule = (fn: () => void, ms: number) => { const timer = setTimeout(fn, ms); return () => clearTimeout(timer) }

/**
 * Durable, serialized sync for one note (frontend-api-integration.md "Autosave with typed transactions").
 *
 * - Typed operations are batched, persisted, then sent one request at a time; a batch is removed only
 *   after `201 applied`. Retries reuse the identical transaction ID, sequence and payload.
 * - Structural edits the editor cannot express as operations arrive as full documents and are saved
 *   with `PUT …/checkpoint` after earlier batches drain.
 * - Overlapping edits (`409`) never overwrite: sync first rebases this device's document onto the
 *   head and retries transparently (fresh IDs, so a poisoned receipt is never replayed). Only a
 *   rebase that keeps failing surfaces `conflict`/`error` with the local copy kept, and even then
 *   a background loop keeps retrying while the dialog stays the instant path — a wedge never
 *   blocks sending permanently. The server already rebases non-overlapping edits.
 * - On shared notes (`shared`, from the metadata collaboration) `PUT …/checkpoint` is rejected with
 *   `409 USE_TRANSACTIONS`, so full saves are diffed against the head and queued as transaction batches.
 * - Losing access mid-session (`403 NOTE_ACCESS_DENIED`) stops the queue read-only with local edits kept.
 */
export class NoteSync {
  private data: NoteSyncRecord
  private state: SyncState
  private running: Promise<void> | null = null
  private cancelIdle: (() => void) | null = null
  private cancelRetry: (() => void) | null = null
  private cancelPersist: (() => void) | null = null
  private cancelRecovery: (() => void) | null = null
  private recoverAttempts = 0
  private recoveryFailures = 0
  private wedge: { status: 'conflict' | 'error'; message: string } | null = null
  private lastSendStart = 0
  private disposed = false
  /** Last known head document: the diff base for shared full saves. Memory-only; a revision mismatch refetches. */
  private lastServer: { revisionNumber: number; document: unknown } | null = null
  private readonly options: Required<Omit<NoteSyncOptions, 'onState' | 'onAck' | 'onAccessDenied'>> & Pick<NoteSyncOptions, 'onState' | 'onAck' | 'onAccessDenied'>

  private constructor(options: NoteSyncOptions, record: NoteSyncRecord) {
    this.options = {
      idleMs: 1000, maxOps: 200, retryMs: 5000, schedule: defaultSchedule, now: Date.now, shared: false,
      newTransactionId: () => `txn:${crypto.randomUUID()}`,
      ...options,
    }
    this.lastSendStart = this.options.now()
    this.data = record
    this.state = { status: hasPendingWork(record) ? 'saving' : 'saved', pending: this.pendingCount(), revisionNumber: record.baseRevisionNumber }
  }

  /**
   * Opens sync for a note from the server checkpoint. Unsynced local work wins over the server copy
   * (it is replayed on top); otherwise the server document is used.
   */
  static async open(options: NoteSyncOptions, server: { revisionNumber: number; document: IncantlyDocument; title: string }) {
    const key = syncKey(options.userId, options.noteId)
    const stored = await options.store.get(key)
    const record: NoteSyncRecord = stored && hasPendingWork(stored)
      ? stored
      : { key, userId: options.userId, noteId: options.noteId, baseRevisionNumber: server.revisionNumber, nextSequence: stored?.nextSequence ?? 1, batches: [], open: [], pendingCheckpoint: null, title: server.title, lastDocument: server.document, updatedAt: (options.now ?? Date.now)() }
    const sync = new NoteSync(options, record)
    sync.lastServer = { revisionNumber: server.revisionNumber, document: server.document }
    await options.store.put(record)
    if (hasPendingWork(record)) void sync.flushNow()
    return sync
  }

  /** The document the editor should show: local work when unsynced, otherwise the server copy. */
  get document() { return this.data.lastDocument }
  get title() { return this.data.title }
  get current(): SyncState { return this.state }
  get hasPending() { return hasPendingWork(this.data) }

  /** Records one editor change and schedules a send after the idle window. */
  record(change: EditorChange) {
    if (this.disposed || change.mode === 'none') return
    this.data.lastDocument = change.document
    // On shared notes a checkpoint that already mapped its operations queues them directly: the full
    // document is exactly base + those operations, so nothing is lost and no PUT is ever attempted.
    const sharedIncremental = this.options.shared && change.mode === 'checkpoint' && change.operations.length > 0 && !this.data.pendingCheckpoint
    if (!sharedIncremental && (change.mode === 'checkpoint' || this.data.pendingCheckpoint)) {
      // A full document supersedes unsealed operations it already contains.
      this.data.pendingCheckpoint = change.document
      this.data.open = []
    } else {
      this.data.open.push(...change.operations)
    }
    this.touch()
    // Wedged states keep recording (the recovery loop picks the edits up), and the record is
    // still persisted: work typed into a conflict must survive a crash exactly like any other.
    if (this.state.status === 'conflict' || this.state.status === 'error' || this.state.status === 'gone' || this.state.status === 'denied') {
      this.schedulePersist()
      return this.emit({})
    }
    this.emit({ status: this.state.status === 'offline' ? 'offline' : 'saving' })
    this.schedulePersist()
    if (this.data.open.length >= this.options.maxOps) void this.flushNow()
    else if (hasPendingWork(this.data) && this.options.now() - this.lastSendStart > FLUSH_MAX_AGE_MS) void this.flushNow()
    else this.scheduleIdleFlush()
  }

  /** Renames the note. The title lives in document metadata, so this queues a full save. */
  rename(title: string) {
    const trimmed = title.trim()
    if (this.disposed || !trimmed || trimmed === this.data.title) return
    this.data.title = trimmed
    const base = this.data.pendingCheckpoint ?? this.data.lastDocument
    if (base) this.data.pendingCheckpoint = withTitle(base, trimmed)
    this.data.open = []
    this.touch()
    this.emit({ status: this.state.status === 'offline' ? 'offline' : 'saving' })
    this.scheduleIdleFlush()
  }

  /** Sends everything pending now (explicit save, reconnect, teardown). Serialized per note. */
  flushNow(): Promise<void> {
    this.cancelIdle?.(); this.cancelIdle = null
    this.cancelRetry?.(); this.cancelRetry = null
    if (this.running) return this.running.then(() => (hasPendingWork(this.data) && this.canSend() ? this.flushNow() : undefined))
    this.lastSendStart = this.options.now()
    this.running = this.drain().finally(() => { this.running = null })
    return this.running
  }

  /** Conflict resolution: save this device's copy on top of the latest server revision. */
  async keepMine() {
    this.resetRecovery()
    const latest = await this.options.api.checkpoint(this.options.noteId)
    const mine = this.data.lastDocument
    this.data.baseRevisionNumber = latest.revision.revisionNumber
    this.lastServer = { revisionNumber: latest.revision.revisionNumber, document: latest.document }
    this.data.batches = []
    this.data.open = []
    this.data.pendingCheckpoint = mine
    this.touch()
    this.emit({ status: 'saving', message: undefined, revisionNumber: latest.revision.revisionNumber })
    await this.flushNow()
  }

  /** Conflict resolution: discard local changes and load the server copy. Returns the document to show. */
  async takeServer() {
    const latest = await this.options.api.checkpoint(this.options.noteId)
    const gate = loadDocument(latest.document)
    if (!gate.ok) throw new ApiError(422, 'INVALID_SERVER_DOCUMENT', null, null)
    await this.adoptHead(gate.document, latest.revision.revisionNumber)
    return gate.document
  }

  /**
   * Adopts an already-fetched head: the same state transition as `takeServer`
   * without the fetch. The server-patch path calls this after applying the
   * head to the live Yjs doc, so the revision pointer follows without a
   * reload. Like `takeServer`, callers use it only once pending work has
   * drained — anything still queued is superseded by the head.
   */
  async adoptHead(document: IncantlyDocument, revisionNumber: number) {
    this.resetRecovery()
    this.data = { ...this.data, baseRevisionNumber: revisionNumber, batches: [], open: [], pendingCheckpoint: null, lastDocument: document, title: document.metadata.title ?? this.data.title }
    this.lastServer = { revisionNumber, document }
    await this.persist()
    this.emit({ status: 'saved', message: undefined, revisionNumber })
  }

  /** Access was lost mid-session (transactions, suggestion decisions, undo): stop read-only, keep local edits. */
  markAccessDenied(error: unknown) {
    if (this.disposed || this.state.status === 'denied') return
    this.cancelIdle?.(); this.cancelIdle = null
    this.cancelRetry?.(); this.cancelRetry = null
    void this.persist()
    this.enterDenied(error)
  }

  private enterDenied(error: unknown) {
    this.emit({ status: 'denied', message: 'You no longer have access to this note. Your edits are kept on this device.' })
    if (error instanceof ApiError) this.options.onAccessDenied?.(error)
  }

  /** Stops timers. Pending work stays persisted for the next open. */
  async dispose() {
    this.disposed = true
    this.cancelIdle?.(); this.cancelRetry?.(); this.cancelPersist?.(); this.cancelRecovery?.()
    await this.persist()
  }

  private canSend() {
    return !this.disposed && this.state.status !== 'conflict' && this.state.status !== 'error' && this.state.status !== 'gone' && this.state.status !== 'denied'
  }

  private async drain() {
    while (this.canSend() && hasPendingWork(this.data)) {
      this.sealOpenOperations()
      await this.persist() // Persist before every send: pending work must survive a crash mid-request.
      try {
        if (this.data.batches.length) await this.sendBatch(this.data.batches[0])
        else if (this.data.pendingCheckpoint) await this.sendCheckpoint(this.data.pendingCheckpoint)
        await this.persist() // Record the acknowledgement so a reload never resends applied work.
      } catch (error) {
        if (!(await this.handleFailure(error))) return
      }
    }
    if (this.canSend() && !hasPendingWork(this.data)) this.emit({ status: 'saved', message: undefined })
  }

  private sealOpenOperations() {
    while (this.data.open.length && !this.data.pendingCheckpoint) {
      const operations = this.data.open.splice(0, MAX_OPS_PER_REQUEST)
      // Time-seeded so the sequence keeps rising even if this device's stored state is lost.
      const sequence = Math.max(this.data.nextSequence, this.options.now())
      this.data.nextSequence = sequence + 1
      this.data.batches.push({ transactionId: this.options.newTransactionId(), localSequence: String(sequence), operations })
    }
  }

  private async sendBatch(batch: NoteSyncRecord['batches'][number]) {
    const ack = await this.options.api.transact(this.options.noteId, {
      version: 1,
      transactionId: batch.transactionId,
      clientId: this.options.clientId,
      tabSessionId: this.options.tabSessionId,
      localSequence: batch.localSequence,
      baseRevisionNumber: this.data.baseRevisionNumber,
      operations: batch.operations,
    })
    this.acknowledge(ack.revision.revisionNumber, () => { this.data.batches = this.data.batches.filter((item) => item.transactionId !== batch.transactionId) })
  }

  private async sendCheckpoint(document: IncantlyDocument) {
    if (this.options.shared) return this.convertPendingToBatches(document)
    const titled = this.data.title ? withTitle(document, this.data.title) : document
    const gate = checkDocumentForSave(titled)
    if (!gate.ok) {
      this.enterRecoverableWedge('error', 'This note has content that can’t be saved. Copy anything important, then reload the note.')
      return
    }
    const result = await this.options.api.saveCheckpoint(this.options.noteId, this.data.baseRevisionNumber, gate.document)
    // Only clear the checkpoint if no newer full document arrived while this request was in flight.
    this.acknowledge(result.revision.revisionNumber, () => { if (this.data.pendingCheckpoint === document) this.data.pendingCheckpoint = null })
  }

  /**
   * Shared-note full save: diffs the pending document against the head and queues the result as
   * transaction batches, which then persist and send through the normal path with identical
   * idempotency. Runs only once earlier batches have drained, so the base is current. A diff
   * against a stale fetch is dropped when a newer full document arrived meanwhile — the loop
   * simply converts the newer one instead, so a stale response never overwrites newer content.
   */
  private async convertPendingToBatches(document: IncantlyDocument) {
    const titled = this.data.title ? withTitle(document, this.data.title) : document
    const gate = checkDocumentForSave(titled)
    if (!gate.ok) {
      this.enterRecoverableWedge('error', 'This note has content that can’t be saved. Copy anything important, then reload the note.')
      return
    }
    const base = this.data.baseRevisionNumber
    let server = this.lastServer && this.lastServer.revisionNumber === base ? this.lastServer.document : null
    if (!server) {
      const latest = await this.options.api.checkpoint(this.options.noteId)
      server = latest.document
      this.data.baseRevisionNumber = latest.revision.revisionNumber
      this.lastServer = { revisionNumber: latest.revision.revisionNumber, document: server }
      this.touch()
      this.emit({ revisionNumber: latest.revision.revisionNumber })
    }
    if (this.data.pendingCheckpoint !== document) return
    const serverGate = loadDocument(server)
    if (!serverGate.ok) {
      this.enterRecoverableWedge('error', 'The latest saved version couldn’t be read, so saving stopped to protect your changes.')
      return
    }
    // Both sides normalized the same way: otherwise defaults the load gate fills in would diff as changes.
    const diff = diffDocuments(serverGate.document, normalizeDocument(gate.document))
    const groups = diffTransactionGroups(diff, MAX_OPS_PER_REQUEST)
    if (groups.length === 0) {
      // Nothing transmittable (a title-only change has no typed operation): the title stays local.
      this.acknowledge(this.data.baseRevisionNumber, () => { if (this.data.pendingCheckpoint === document) this.data.pendingCheckpoint = null })
      return
    }
    for (const operations of groups) {
      const sequence = Math.max(this.data.nextSequence, this.options.now())
      this.data.nextSequence = sequence + 1
      this.data.batches.push({ transactionId: this.options.newTransactionId(), localSequence: String(sequence), operations: [...operations] })
    }
    this.data.pendingCheckpoint = null
    this.touch()
  }

  private acknowledge(revisionNumber: number, clear: () => void) {
    this.data.baseRevisionNumber = revisionNumber
    clear()
    this.touch()
    this.resetRecovery()
    this.options.onAck?.(revisionNumber)
    this.emit({ revisionNumber })
  }

  /** Returns true when draining may continue. */
  private async handleFailure(error: unknown) {
    const code = error instanceof ApiError ? error.code : NETWORK_ERROR
    const status = error instanceof ApiError ? error.status : 0
    if (code === 'USE_TRANSACTIONS' && this.data.pendingCheckpoint && this.data.batches.length === 0) {
      // The note was shared while open (PUT only runs once batches have drained): convert from now on.
      this.options.shared = true
      return true
    }
    if (CONFLICT_CODES.has(code) || STOP_CODES.has(code) || code === 'INVALID_NOTE_TRANSACTION') {
      // Conflicts, poisoned identities and rejected batches all rebase onto the head and retry
      // with fresh IDs — including on unshared notes, where a merge-by-diff replaces the old
      // whole-document PUT fallback (which could overwrite the other side's intervening edits).
      const recovered = await this.tryAutoRecover()
      if (recovered === 'requeued') return true
      if (recovered === 'deferred') return false
      if (CONFLICT_CODES.has(code)) this.enterRecoverableWedge('conflict', 'This note changed on another device or tab.')
      else if (STOP_CODES.has(code)) this.enterRecoverableWedge('error', 'Saving stopped to protect your changes. Choose “Save my version” to continue.')
      else this.enterRecoverableWedge('error', 'An edit couldn’t be saved. Copy any important text and reload the note.')
      return false
    }
    if (code === 'NOTE_NOT_FOUND' || status === 404) { this.emit({ status: 'gone', message: 'This note was deleted.' }); return false }
    if (code === 'NOTE_ACCESS_DENIED') { this.enterDenied(error); return false }
    if (code === 'ROOM_DOCUMENT_TOO_LARGE') {
      // The room is at its size limit: retrying is futile until the user splits the note. Stop with edits kept.
      this.emit({ status: 'error', message: apiErrorMessage(error) })
      return false
    }
    if (status === 401) return false // apiFetch already routes to sign-in; work stays persisted.
    // Offline, busy (TRANSACTION_IN_PROGRESS), or retries exhausted: keep the identical payload and try later.
    this.emit({ status: 'offline', message: code === 'TRANSACTION_IN_PROGRESS' ? 'Waiting for an earlier save to finish.' : undefined })
    this.cancelRetry?.()
    this.cancelRetry = this.options.schedule(() => { this.cancelRetry = null; void this.flushNow() }, this.options.retryMs)
    return false
  }

  /**
   * Transparent rebase after a conflict, sequence, or rejected batch: refetches the head and
   * re-expresses this device's document as fresh batches on it, so retries never replay a
   * poisoned receipt. Non-overlapping edits merge; overlapping ones conflict again and, after
   * bounded immediate attempts, wedge with the background loop owning the retry. Local content
   * is never dropped here: `failed` only means the existing dialog takes over.
   */
  private async tryAutoRecover(): Promise<'requeued' | 'deferred' | 'failed'> {
    if (this.recoverAttempts >= MAX_RECOVER_ATTEMPTS) return 'failed'
    this.recoverAttempts += 1
    let latest: NoteCheckpoint
    try {
      latest = await this.options.api.checkpoint(this.options.noteId)
    } catch (error) {
      if (error instanceof ApiError && error.code === 'NOTE_ACCESS_DENIED') { this.enterDenied(error); return 'deferred' }
      if (error instanceof ApiError && (error.code === 'NOTE_NOT_FOUND' || error.status === 404)) {
        this.emit({ status: 'gone', message: 'This note was deleted.' })
        return 'deferred'
      }
      if (error instanceof ApiError && error.status === 401) return 'deferred'
      // A failed refetch is transient: stay offline and retry, without spending the wedge.
      this.emit({ status: 'offline', message: undefined })
      this.cancelRetry?.()
      this.cancelRetry = this.options.schedule(() => { this.cancelRetry = null; void this.flushNow() }, this.options.retryMs)
      return 'deferred'
    }
    const mine = this.data.lastDocument
    // Nothing local to rebase (a legacy record with pending work but no document): keep the
    // queue intact and let the wedge dialog take over.
    if (!mine) return 'failed'
    const pending = { batches: this.data.batches, open: this.data.open, pendingCheckpoint: this.data.pendingCheckpoint }
    this.data.batches = []
    this.data.open = []
    this.data.pendingCheckpoint = null
    // Both sides normalized the same way, as in the shared conversion below: otherwise
    // defaults the load gate fills in would diff as changes.
    const titled = this.data.title ? withTitle(mine, this.data.title) : mine
    const gate = checkDocumentForSave(titled)
    const serverGate = loadDocument(latest.document)
    if (!gate.ok || !serverGate.ok) {
      // Unreadable either side: restore the queue so the background loop retries (new edits or
      // a healed head can unblock it) instead of dropping work into a dead wedge. The base is
      // untouched: it advances only below, once both gates pass.
      this.data.batches = pending.batches
      this.data.open = pending.open
      this.data.pendingCheckpoint = pending.pendingCheckpoint
      await this.persist()
      return 'failed'
    }
    // Advance only once both gates pass: a crash in the wedge must reload the restored queue
    // against its original base, never against a head it never saw.
    this.data.baseRevisionNumber = latest.revision.revisionNumber
    this.lastServer = { revisionNumber: latest.revision.revisionNumber, document: latest.document }
    const local = normalizeDocument(gate.document)
    if (!this.options.shared && hasNonTransmittableChanges(serverGate.document, local)) {
      // Title/layout/research cannot ride transactions: requeue the full document as a PUT on
      // the fresh base instead of silently dropping them while reporting saved. When the local
      // body is empty (a pure rename), the PUT carries the server body: requeuing an empty body
      // here would wipe concurrent server text to save the title.
      const base = !hasCarriedContent(local) && hasCarriedContent(serverGate.document) ? serverGate.document : local
      this.data.pendingCheckpoint = this.data.title ? withTitle(base, this.data.title) : base
      this.touch()
      this.emit({ status: 'saving', message: undefined, revisionNumber: latest.revision.revisionNumber })
      await this.persist()
      return 'requeued'
    }
    if (!hasCarriedContent(local) && hasCarriedContent(serverGate.document)) {
      // An empty local document must never auto-delete carried server content: that rebase is
      // indistinguishable from a dropped load or a conversion failure, and applying it wipes the
      // note for every collaborator. Restore the queue so nothing is lost and let the wedge dialog
      // take over — a user who really deleted everything confirms there.
      this.data.batches = pending.batches
      this.data.open = pending.open
      this.data.pendingCheckpoint = pending.pendingCheckpoint
      await this.persist()
      return 'failed'
    }
    const diff = diffDocuments(serverGate.document, local)
    for (const operations of diffTransactionGroups(diff, MAX_OPS_PER_REQUEST)) {
      const sequence = Math.max(this.data.nextSequence, this.options.now())
      this.data.nextSequence = sequence + 1
      this.data.batches.push({ transactionId: this.options.newTransactionId(), localSequence: String(sequence), operations: [...operations] })
    }
    this.touch()
    this.emit({ status: 'saving', message: undefined, revisionNumber: latest.revision.revisionNumber })
    await this.persist()
    return 'requeued'
  }

  /** Wedges with the dialog copy, and starts the background loop so sending never blocks permanently. */
  private enterRecoverableWedge(status: 'conflict' | 'error', message: string) {
    this.wedge = { status, message }
    this.emit({ status, message })
    this.scheduleRecoveryLoop()
  }

  /** A healed sync forgets its wedge: any ack, manual resolution, or dispose calls this. */
  private resetRecovery() {
    this.recoverAttempts = 0
    this.recoveryFailures = 0
    this.wedge = null
    this.cancelRecovery?.(); this.cancelRecovery = null
  }

  /**
   * Background wedge recovery: re-attempts the rebase with backoff until it lands, so a
   * conflict/error state never blocks sending permanently. New edits recorded meanwhile ride
   * along (the rebase always diffs the latest local document). Stops on any acknowledgement,
   * manual resolution, dispose, or a terminal access state.
   */
  private scheduleRecoveryLoop() {
    this.cancelRecovery?.(); this.cancelRecovery = null
    const delay = Math.min(this.options.retryMs * 2 ** this.recoveryFailures, RECOVERY_LOOP_MAX_MS)
    this.recoveryFailures += 1
    this.cancelRecovery = this.options.schedule(() => {
      this.cancelRecovery = null
      if (this.disposed || !hasPendingWork(this.data) || this.running) {
        if (!this.disposed && hasPendingWork(this.data)) this.scheduleRecoveryLoop()
        return
      }
      if (!this.wedge || (this.state.status !== 'conflict' && this.state.status !== 'error')) return
      const wedge = this.wedge
      this.recoverAttempts = 0
      this.emit({ status: 'saving', message: undefined })
      void (async () => {
        const recovered = await this.tryAutoRecover()
        if (recovered === 'requeued') return this.flushNow()
        if (recovered === 'deferred') return
        this.enterRecoverableWedge(wedge.status, wedge.message)
      })()
    }, delay)
  }

  private scheduleIdleFlush() {
    this.cancelIdle?.()
    this.cancelIdle = this.options.schedule(() => { this.cancelIdle = null; void this.flushNow() }, this.options.idleMs)
  }

  private schedulePersist() {
    this.cancelPersist?.()
    this.cancelPersist = this.options.schedule(() => { this.cancelPersist = null; void this.persist() }, 300)
  }

  private async persist() {
    this.cancelPersist?.(); this.cancelPersist = null
    await this.options.store.put(this.data)
  }

  private touch() { this.data.updatedAt = this.options.now() }

  private pendingCount() {
    return this.data.batches.length + (this.data.open.length ? 1 : 0) + (this.data.pendingCheckpoint ? 1 : 0)
  }

  private emit(changes: Partial<SyncState>) {
    this.state = { ...this.state, ...changes, pending: this.pendingCount(), revisionNumber: changes.revisionNumber ?? this.data.baseRevisionNumber }
    this.options.onState?.(this.state)
  }
}
