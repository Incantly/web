import type { DocumentOperation, IncantlyDocument } from '@incantly/canvas-core/document'

/** A sealed transaction. Its ID and sequence never change, so a retry is byte-identical. */
export type PendingBatch = { transactionId: string; localSequence: string; operations: DocumentOperation[] }

/**
 * Durable sync state for one note on this device. Pending work survives reloads and is
 * removed only after the server acknowledges it. Keyed by user so accounts never mix.
 */
export type NoteSyncRecord = {
  key: string
  userId: string
  noteId: string
  /** Last revision the server acknowledged. */
  baseRevisionNumber: number
  /** Next local sequence to assign (monotonic per note and client). */
  nextSequence: number
  batches: PendingBatch[]
  /** Typed operations not yet sealed into a batch. */
  open: DocumentOperation[]
  /** A full document to save with `PUT …/checkpoint` once batches drain. */
  pendingCheckpoint: IncantlyDocument | null
  /** The note title the user last set; applied to every full-document save. */
  title: string | null
  /** Latest local document, for instant open and conflict recovery. */
  lastDocument: IncantlyDocument | null
  updatedAt: number
}

export const syncKey = (userId: string, noteId: string) => `${userId}:${noteId}`

export function hasPendingWork(record: Pick<NoteSyncRecord, 'batches' | 'open' | 'pendingCheckpoint'>) {
  return record.batches.length > 0 || record.open.length > 0 || record.pendingCheckpoint !== null
}

export interface NoteSyncStore {
  get(key: string): Promise<NoteSyncRecord | undefined>
  put(record: NoteSyncRecord): Promise<void>
  remove(key: string): Promise<void>
  listForUser(userId: string): Promise<NoteSyncRecord[]>
}

export class MemoryNoteSyncStore implements NoteSyncStore {
  readonly writes: NoteSyncRecord[] = []
  private readonly items = new Map<string, NoteSyncRecord>()
  async get(key: string) { const item = this.items.get(key); return item && structuredClone(item) }
  async put(record: NoteSyncRecord) { const copy = structuredClone(record); this.items.set(record.key, copy); this.writes.push(copy) }
  async remove(key: string) { this.items.delete(key) }
  async listForUser(userId: string) { return [...this.items.values()].filter((item) => item.userId === userId).map((item) => structuredClone(item)) }
}

/** The local note queue and cache database; sign-out deletes it. */
export const NOTE_SYNC_DB_NAME = 'incantly-notes'
const DB_NAME = NOTE_SYNC_DB_NAME
const STORE = 'sync'

export class IndexedDbNoteSyncStore implements NoteSyncStore {
  private database?: Promise<IDBDatabase>

  private open() {
    this.database ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1)
      request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'key' }).createIndex('userId', 'userId')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    return this.database
  }

  /** Closes the connection (sign-out deletes the database next); a later call reopens it. */
  close() {
    const database = this.database
    this.database = undefined
    void database?.then((open) => open.close(), () => undefined)
  }

  private async run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) {
    const database = await this.open()
    return new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE, mode)
      const request = action(transaction.objectStore(STORE))
      // Resolve on commit for writes so "persisted" really means durable.
      transaction.oncomplete = () => resolve(request.result)
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  }

  async get(key: string) { return this.run<NoteSyncRecord | undefined>('readonly', (store) => store.get(key)) }
  async put(record: NoteSyncRecord) { await this.run('readwrite', (store) => store.put(record)) }
  async remove(key: string) { await this.run('readwrite', (store) => store.delete(key)) }
  async listForUser(userId: string) { return this.run<NoteSyncRecord[]>('readonly', (store) => store.index('userId').getAll(userId)) }
}

const CLIENT_KEY = 'incantly-client-id'
let memoryClientId: string | null = null

/** One stable, non-secret installation ID (backend `clientId`, 8–128 of `[A-Za-z0-9_-]`). */
export function getClientId(): string {
  try {
    const stored = localStorage.getItem(CLIENT_KEY)
    if (stored && /^[A-Za-z0-9_-]{8,128}$/.test(stored)) return stored
    const created = `web_${crypto.randomUUID()}`
    localStorage.setItem(CLIENT_KEY, created)
    return created
  } catch {
    memoryClientId ??= `web_${crypto.randomUUID()}`
    return memoryClientId
  }
}

const TAB_KEY = 'incantly-tab-id'
let memoryTabId: string | null = null

/**
 * One ID per tab session (backend `tabSessionId`): same-browser tabs share a `clientId`, so
 * this lets the server scope conflict recovery to the tab that actually wrote the batch.
 */
export function getTabSessionId(): string {
  try {
    const stored = sessionStorage.getItem(TAB_KEY)
    if (stored && /^[A-Za-z0-9_-]{8,128}$/.test(stored)) return stored
    const created = `tab_${crypto.randomUUID()}`
    sessionStorage.setItem(TAB_KEY, created)
    return created
  } catch {
    memoryTabId ??= `tab_${crypto.randomUUID()}`
    return memoryTabId
  }
}
