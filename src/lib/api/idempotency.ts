/**
 * Idempotency keys: one per logical user action, reused for every retry of that action.
 * A changed request body needs a new key (the backend rejects reuse with IDEMPOTENCY_KEY_REUSED).
 */
export function newIdempotencyKey(): string {
  return crypto.randomUUID()
}

/**
 * Binds one key to one user action so every retry of it sends the same key.
 *   const action = idempotentAction()
 *   await action.run((key) => apiFetch('/v1/notes', { method: 'POST', body, idempotencyKey: key }))
 */
export function idempotentAction(key = newIdempotencyKey()) {
  return { key, run: <T>(send: (key: string) => Promise<T>) => send(key) }
}

/** A command that must survive a reload (uploads, imports) with the key it was first sent with. */
export type PendingCommand<P = unknown> = {
  id: string
  userId: string
  kind: 'asset-upload' | 'file-import' | 'url-import'
  idempotencyKey: string
  payload: P
  createdAt: number
}

export interface PendingCommandStore {
  put(command: PendingCommand): Promise<void>
  get(id: string): Promise<PendingCommand | undefined>
  list(userId: string, kind?: PendingCommand['kind']): Promise<PendingCommand[]>
  remove(id: string): Promise<void>
}

export class MemoryPendingCommandStore implements PendingCommandStore {
  private readonly items = new Map<string, PendingCommand>()
  async put(command: PendingCommand) { this.items.set(command.id, structuredClone(command)) }
  async get(id: string) { const item = this.items.get(id); return item && structuredClone(item) }
  async list(userId: string, kind?: PendingCommand['kind']) {
    return [...this.items.values()].filter((item) => item.userId === userId && (!kind || item.kind === kind)).map((item) => structuredClone(item))
  }
  async remove(id: string) { this.items.delete(id) }
}

const DB_NAME = 'incantly-api'
const STORE = 'pending-commands'

/** IndexedDB store, scoped per user ID so one account never sees another's pending work. */
export class IndexedDbPendingCommandStore implements PendingCommandStore {
  private database?: Promise<IDBDatabase>

  private open() {
    this.database ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1)
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex('userId', 'userId')
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    return this.database
  }

  private async run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) {
    const database = await this.open()
    return new Promise<T>((resolve, reject) => {
      const request = action(database.transaction(STORE, mode).objectStore(STORE))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  async put(command: PendingCommand) { await this.run('readwrite', (store) => store.put(command)) }
  async get(id: string) { return this.run<PendingCommand | undefined>('readonly', (store) => store.get(id)) }
  async list(userId: string, kind?: PendingCommand['kind']) {
    const items = await this.run<PendingCommand[]>('readonly', (store) => store.index('userId').getAll(userId))
    return kind ? items.filter((item) => item.kind === kind) : items
  }
  async remove(id: string) { await this.run('readwrite', (store) => store.delete(id)) }
}
