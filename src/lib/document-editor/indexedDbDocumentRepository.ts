import type { AppendDocumentUpdatesOptions, AppendDocumentUpdatesResult, DocumentCheckpoint, DocumentId, DocumentRepository } from '@incantly/canvas-core/document'

const request = <T,>(value: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => { value.onsuccess = () => resolve(value.result); value.onerror = () => reject(value.error) })
export class IndexedDbDocumentRepository implements DocumentRepository {
  private database: Promise<IDBDatabase>
  constructor(name = 'incantly-documents') {
    this.database = new Promise((resolve, reject) => {
      const open = indexedDB.open(name, 1)
      open.onupgradeneeded = () => { if (!open.result.objectStoreNames.contains('documents')) open.result.createObjectStore('documents') }
      open.onsuccess = () => resolve(open.result)
      open.onerror = () => reject(open.error)
    })
  }
  private async store(mode: IDBTransactionMode) { return (await this.database).transaction('documents', mode).objectStore('documents') }
  async loadDocument(id: DocumentId): Promise<DocumentCheckpoint | null> { return (await request((await this.store('readonly')).get(String(id)))) ?? null }
  async saveCheckpoint(checkpoint: DocumentCheckpoint): Promise<void> { await request((await this.store('readwrite')).put(checkpoint, String(checkpoint.document.id))) }
  async appendUpdates(id: DocumentId, updates: readonly Uint8Array[], options: AppendDocumentUpdatesOptions = {}): Promise<AppendDocumentUpdatesResult> {
    const checkpoint = await this.loadDocument(id)
    if (!checkpoint) throw new Error('Document checkpoint does not exist')
    if (options.expectedRevision && checkpoint.revision !== options.expectedRevision) throw new Error('Stale document revision')
    const revision = `${Date.now()}:${updates.length}`
    await this.saveCheckpoint({ ...checkpoint, revision, savedAt: new Date().toISOString(), collaborationState: updates.at(-1) ?? checkpoint.collaborationState })
    return { revision, appended: updates.length }
  }
}
