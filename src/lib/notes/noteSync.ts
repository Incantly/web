import { normalizeDocument, type DocumentOperation, type IncantlyDocument } from '@incantly/canvas-core/document'
import { ApiError, NETWORK_ERROR, apiErrorMessage } from '../api/errors'
import type { NoteCheckpoint, NoteTransaction, NoteTransactionAck, NoteRevisionDto } from '../api/notes'
import { diffDocuments, diffTransactionGroups } from './documentDiff'
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
  api: NoteSyncApi
  store: NoteSyncStore
  onState?: (state: SyncState) => void
  onAck?: (revisionNumber: number) => void
  /** Called once the server reports NOTE_ACCESS_DENIED mid-session (toast + read-only). */
  onAccessDenied?: (error: ApiError) => void
  /** True when the note metadata carries a collaboration: full saves convert to transactions, never PUT. */
  shared?: boolean
  /** Idle time before sending a batch (default 1500 ms) and the per-batch op cap (default 200). */
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

const defaultSchedule = (fn: () => void, ms: number) => { const timer = setTimeout(fn, ms); return () => clearTimeout(timer) }

/**
 * Durable, serialized sync for one note (frontend-api-integration.md "Autosave with typed transactions").
 *
 * - Typed operations are batched, persisted, then sent one request at a time; a batch is removed only
 *   after `201 applied`. Retries reuse the identical transaction ID, sequence and payload.
 * - Structural edits the editor cannot express as operations arrive as full documents and are saved
 *   with `PUT …/checkpoint` after earlier batches drain.
 * - Overlapping edits (`409`) never overwrite: the note enters `conflict` with the local copy kept,
 *   and the user chooses `keepMine` or `takeServer`. The server already rebases non-overlapping edits.
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
  private disposed = false
  /** Last known head document: the diff base for shared full saves. Memory-only; a revision mismatch refetches. */
  private lastServer: { revisionNumber: number; document: unknown } | null = null
  private readonly options: Required<Omit<NoteSyncOptions, 'onState' | 'onAck' | 'onAccessDenied'>> & Pick<NoteSyncOptions, 'onState' | 'onAck' | 'onAccessDenied'>

  private constructor(options: NoteSyncOptions, record: NoteSyncRecord) {
    this.options = {
      idleMs: 1500, maxOps: 200, retryMs: 5000, schedule: defaultSchedule, now: Date.now, shared: false,
      newTransactionId: () => `txn:${crypto.randomUUID()}`,
      ...options,
    }
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
    if (this.state.status === 'conflict' || this.state.status === 'error' || this.state.status === 'gone' || this.state.status === 'denied') return this.emit({})
    this.emit({ status: this.state.status === 'offline' ? 'offline' : 'saving' })
    this.schedulePersist()
    if (this.data.open.length >= this.options.maxOps) void this.flushNow()
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
    this.running = this.drain().finally(() => { this.running = null })
    return this.running
  }

  /** Conflict resolution: save this device's copy on top of the latest server revision. */
  async keepMine() {
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
    this.data = { ...this.data, baseRevisionNumber: latest.revision.revisionNumber, batches: [], open: [], pendingCheckpoint: null, lastDocument: gate.document, title: gate.document.metadata.title ?? this.data.title }
    this.lastServer = { revisionNumber: latest.revision.revisionNumber, document: gate.document }
    await this.persist()
    this.emit({ status: 'saved', message: undefined, revisionNumber: latest.revision.revisionNumber })
    return gate.document
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
    this.cancelIdle?.(); this.cancelRetry?.(); this.cancelPersist?.()
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
      this.emit({ status: 'error', message: 'This note has content that can’t be saved. Copy anything important, then reload the note.' })
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
      this.emit({ status: 'error', message: 'This note has content that can’t be saved. Copy anything important, then reload the note.' })
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
      this.emit({ status: 'error', message: 'The latest saved version couldn’t be read, so saving stopped to protect your changes.' })
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
    if (CONFLICT_CODES.has(code)) { this.emit({ status: 'conflict', message: 'This note changed on another device or tab.' }); return false }
    if (STOP_CODES.has(code)) { this.emit({ status: 'error', message: 'Saving stopped to protect your changes. Choose “Save my version” to continue.' }); return false }
    if (code === 'NOTE_NOT_FOUND' || status === 404) { this.emit({ status: 'gone', message: 'This note was deleted.' }); return false }
    if (code === 'NOTE_ACCESS_DENIED') { this.enterDenied(error); return false }
    if (code === 'ROOM_DOCUMENT_TOO_LARGE') {
      // The room is at its size limit: retrying is futile until the user splits the note. Stop with edits kept.
      this.emit({ status: 'error', message: apiErrorMessage(error) })
      return false
    }
    if (status === 401) return false // apiFetch already routes to sign-in; work stays persisted.
    if (code === 'INVALID_NOTE_TRANSACTION') {
      if (this.options.shared) {
        // No full-save fallback on shared notes: the server would answer USE_TRANSACTIONS. Stop with edits kept.
        this.emit({ status: 'error', message: 'An edit couldn’t be saved. Copy any important text and reload the note.' })
        return false
      }
      // The server rejected these operations; save the whole current document instead.
      this.data.batches.shift()
      this.data.pendingCheckpoint = this.data.lastDocument
      this.data.open = []
      this.touch()
      return true
    }
    // Offline, busy (TRANSACTION_IN_PROGRESS), or retries exhausted: keep the identical payload and try later.
    this.emit({ status: 'offline', message: code === 'TRANSACTION_IN_PROGRESS' ? 'Waiting for an earlier save to finish.' : undefined })
    this.cancelRetry?.()
    this.cancelRetry = this.options.schedule(() => { this.cancelRetry = null; void this.flushNow() }, this.options.retryMs)
    return false
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
