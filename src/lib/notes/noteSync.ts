import type { DocumentOperation, IncantlyDocument } from '@incantly/core/document'
import { ApiError, NETWORK_ERROR } from '../api/errors'
import type { NoteCheckpoint, NoteTransaction, NoteTransactionAck, NoteRevisionDto } from '../api/notes'
import { checkDocumentForSave, loadDocument, withTitle } from './documentGate'
import { hasPendingWork, syncKey, type NoteSyncRecord, type NoteSyncStore } from './syncStore'

export type SyncStatus = 'saved' | 'saving' | 'offline' | 'conflict' | 'error' | 'gone'
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
 */
export class NoteSync {
  private data: NoteSyncRecord
  private state: SyncState
  private running: Promise<void> | null = null
  private cancelIdle: (() => void) | null = null
  private cancelRetry: (() => void) | null = null
  private cancelPersist: (() => void) | null = null
  private disposed = false
  private readonly options: Required<Omit<NoteSyncOptions, 'onState' | 'onAck'>> & Pick<NoteSyncOptions, 'onState' | 'onAck'>

  private constructor(options: NoteSyncOptions, record: NoteSyncRecord) {
    this.options = {
      idleMs: 1500, maxOps: 200, retryMs: 5000, schedule: defaultSchedule, now: Date.now,
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
    if (change.mode === 'checkpoint' || this.data.pendingCheckpoint) {
      // A full document supersedes unsealed operations it already contains.
      this.data.pendingCheckpoint = change.document
      this.data.open = []
    } else {
      this.data.open.push(...change.operations)
    }
    this.touch()
    if (this.state.status === 'conflict' || this.state.status === 'error' || this.state.status === 'gone') return this.emit({})
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
    await this.persist()
    this.emit({ status: 'saved', message: undefined, revisionNumber: latest.revision.revisionNumber })
    return gate.document
  }

  /** Stops timers. Pending work stays persisted for the next open. */
  async dispose() {
    this.disposed = true
    this.cancelIdle?.(); this.cancelRetry?.(); this.cancelPersist?.()
    await this.persist()
  }

  private canSend() {
    return !this.disposed && this.state.status !== 'conflict' && this.state.status !== 'error' && this.state.status !== 'gone'
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
    if (CONFLICT_CODES.has(code)) { this.emit({ status: 'conflict', message: 'This note changed on another device or tab.' }); return false }
    if (STOP_CODES.has(code)) { this.emit({ status: 'error', message: 'Saving stopped to protect your changes. Choose “Save my version” to continue.' }); return false }
    if (code === 'NOTE_NOT_FOUND' || status === 404) { this.emit({ status: 'gone', message: 'This note was deleted.' }); return false }
    if (status === 401) return false // apiFetch already routes to sign-in; work stays persisted.
    if (code === 'INVALID_NOTE_TRANSACTION') {
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
