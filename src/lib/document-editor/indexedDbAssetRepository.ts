import {
  assetId,
  contentAddressedAssetKey,
  type AssetBinary,
  type AssetHash,
  type AssetId,
  type AssetMetadata,
  type AssetRecord,
  type AssetRepository,
} from '@incantly/core/document'

const request = <T,>(value: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => {
  value.onsuccess = () => resolve(value.result)
  value.onerror = () => reject(value.error)
})

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, '0')).join('')
}

const toBytes = (data: AssetBinary): Uint8Array =>
  data instanceof Uint8Array ? data : new Uint8Array(data)

/**
 * Content-addressed asset storage in IndexedDB. Binaries live here — never
 * in document JSON, which carries only `assetId` references. Identical
 * content deduplicates to a single record.
 */
export class IndexedDbAssetRepository implements AssetRepository {
  private database: Promise<IDBDatabase>
  constructor(name = 'incantly-assets') {
    this.database = new Promise((resolve, reject) => {
      const open = indexedDB.open(name, 1)
      open.onupgradeneeded = () => {
        if (!open.result.objectStoreNames.contains('records')) {
          const records = open.result.createObjectStore('records', { keyPath: 'id' })
          records.createIndex('by-hash', 'hash', { unique: false })
        }
        if (!open.result.objectStoreNames.contains('binaries')) open.result.createObjectStore('binaries')
      }
      open.onsuccess = () => resolve(open.result)
      open.onerror = () => reject(open.error)
    })
  }
  private async store(name: 'records' | 'binaries', mode: IDBTransactionMode) {
    return (await this.database).transaction(name, mode).objectStore(name)
  }
  async put(data: AssetBinary, metadata: AssetMetadata): Promise<AssetRecord> {
    const bytes = toBytes(data)
    const hash = `sha256:${await sha256Hex(bytes)}` as AssetHash
    const existing = await this.findByHash(hash)
    if (existing && existing.byteLength === bytes.byteLength) return existing
    const id: AssetId = assetId(`asset_${crypto.randomUUID()}`)
    const record: AssetRecord = {
      ...metadata,
      id,
      hash,
      storageKey: contentAddressedAssetKey(hash),
      byteLength: bytes.byteLength,
      createdAt: metadata.createdAt ?? new Date().toISOString(),
    }
    await request((await this.store('binaries', 'readwrite')).put(bytes, record.storageKey))
    await request((await this.store('records', 'readwrite')).put(record))
    return record
  }
  async get(id: AssetId): Promise<AssetBinary | null> {
    const record = await this.getRecord(id)
    if (!record) return null
    const binary = await request((await this.store('binaries', 'readonly')).get(record.storageKey))
    if (!binary) return null
    return toBytes(binary as AssetBinary)
  }
  async getRecord(id: AssetId): Promise<AssetRecord | null> {
    return (await request((await this.store('records', 'readonly')).get(String(id)))) ?? null
  }
  async findByHash(hash: AssetRecord['hash']): Promise<AssetRecord | null> {
    const index = (await this.store('records', 'readonly')).index('by-hash')
    return (await request(index.get(String(hash)))) ?? null
  }
  async remove(id: AssetId): Promise<void> {
    const record = await this.getRecord(id)
    if (!record) return
    await request((await this.store('binaries', 'readwrite')).delete(record.storageKey))
    await request((await this.store('records', 'readwrite')).delete(String(id)))
  }
}

let shared: IndexedDbAssetRepository | null = null

/** App-wide asset backend. Documents reference assets by ID only. */
export function getSharedAssetRepository(): IndexedDbAssetRepository {
  if (!shared) shared = new IndexedDbAssetRepository()
  return shared
}
