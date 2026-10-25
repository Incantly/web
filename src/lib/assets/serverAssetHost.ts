import { assetId as toAssetId, type AssetBinary, type AssetHash, type AssetId, type AssetMetadata, type AssetRecord, type AssetRepository } from '@incantly/canvas-core/document'
import { assetsApi, type AssetDto } from '../api/assets'
import { ApiError, apiErrorMessage } from '../api/errors'
import { IndexedDbPendingCommandStore, newIdempotencyKey, type PendingCommandStore } from '../api/idempotency'
import type { AssetUploadProgress, DocumentAssetHost } from '../document-editor/assetHost'
import { SINGLE_UPLOAD_MAX_BYTES, uploadAsset, uploadErrorMessage, type UploadOptions } from './upload'

/** Ask for a new download URL when the cached one has less than this left. */
const URL_MARGIN_MS = 30_000

type Api = Pick<typeof assetsApi, 'reserve' | 'complete' | 'abort' | 'download' | 'remove'>

/**
 * Offline preview copies of images this device uploaded, keyed by user and asset ID.
 * Assets are immutable, so a stored copy never goes stale. Only bytes are stored, never URLs.
 */
export interface AssetPreviewCache {
  get(key: string): Promise<{ blob: Blob; filename: string | null } | undefined>
  put(key: string, value: { blob: Blob; filename: string | null }): Promise<void>
}

export class IndexedDbAssetPreviewCache implements AssetPreviewCache {
  private database?: Promise<IDBDatabase>
  private open() {
    this.database ??= new Promise((resolve, reject) => {
      const request = indexedDB.open('incantly-asset-previews', 1)
      request.onupgradeneeded = () => request.result.createObjectStore('previews')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    return this.database
  }
  private async run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) {
    const database = await this.open()
    return new Promise<T>((resolve, reject) => {
      const request = action(database.transaction('previews', mode).objectStore('previews'))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }
  get(key: string) { return this.run<{ blob: Blob; filename: string | null } | undefined>('readonly', (store) => store.get(key)) }
  async put(key: string, value: { blob: Blob; filename: string | null }) { await this.run('readwrite', (store) => store.put(value, key)) }
}

const lockName = (uploadId: string) => `incantly-asset-upload:${uploadId}`

/** Holds a Web Lock for an upload in flight, so other tabs can tell it is not abandoned. */
function holdUploadLock(uploadId: string): () => void {
  let release = () => {}
  const held = new Promise<void>((resolve) => { release = resolve })
  void navigator.locks?.request(lockName(uploadId), () => held).catch(() => {})
  return release
}

function toRecord(asset: AssetDto, file: { name: string; type: string; size: number }): AssetRecord {
  return {
    id: toAssetId(asset.id),
    // The server's checksum when it has one (single uploads). Content addressing is the server's job.
    hash: (asset.checksumSha256 ?? 'sha256:') as AssetHash,
    // Opaque: the server chooses object keys and never exposes them.
    storageKey: asset.id,
    filename: asset.filename ?? file.name,
    mimeType: asset.contentType ?? file.type,
    byteLength: asset.byteLength ?? file.size,
    createdAt: asset.readyAt ?? new Date().toISOString(),
  }
}

export interface ServerAssetHostOptions {
  userId: string
  api?: Api
  previews?: AssetPreviewCache
  pending?: PendingCommandStore
  upload?: typeof uploadAsset
  now?: () => number
}

/**
 * Server assets (`/v1/assets/*`) behind both the editor's host interface and core's
 * `AssetRepository`. Uploads go straight to storage; display URLs are fetched just in time,
 * kept in memory only until shortly before they expire, and never persisted.
 */
export class ServerAssetHost implements DocumentAssetHost, AssetRepository {
  private readonly api: Api
  private readonly previews: AssetPreviewCache
  private readonly pending: PendingCommandStore
  private readonly send: typeof uploadAsset
  private readonly now: () => number
  private readonly urls = new Map<string, { url: string; expiresAt: number }>()
  private readonly objectUrls = new Map<string, string>()
  private readonly records = new Map<string, AssetRecord>()

  constructor(private readonly options: ServerAssetHostOptions) {
    this.api = options.api ?? assetsApi
    this.previews = options.previews ?? new IndexedDbAssetPreviewCache()
    this.pending = options.pending ?? new IndexedDbPendingCommandStore()
    this.send = options.upload ?? uploadAsset
    this.now = options.now ?? Date.now
  }

  private key(id: string) { return `${this.options.userId}:${id}` }

  async upload(file: File, { signal, onProgress }: { signal: AbortSignal; onProgress: (progress: AssetUploadProgress) => void }): Promise<AssetRecord> {
    const tracked: { id: string; release: () => void }[] = []
    const onReserved: UploadOptions['onReserved'] = (reservation) => {
      const id = `asset-upload:${reservation.uploadId}`
      tracked.push({ id, release: holdUploadLock(reservation.uploadId) })
      void this.pending.put({ id, userId: this.options.userId, kind: 'asset-upload', idempotencyKey: newIdempotencyKey(), payload: { uploadId: reservation.uploadId, expiresAt: reservation.expiresAt }, createdAt: this.now() }).catch(() => {})
    }
    try {
      const asset = await this.send(file, { signal, onProgress, onReserved, api: this.api })
      const record = toRecord(asset, file)
      this.records.set(asset.id, record)
      if (record.mimeType.startsWith('image/') && file.size <= SINGLE_UPLOAD_MAX_BYTES) {
        await this.previews.put(this.key(asset.id), { blob: file, filename: record.filename ?? null }).catch(() => {})
      }
      return record
    } finally {
      for (const item of tracked) { item.release(); void this.pending.remove(item.id).catch(() => {}) }
    }
  }

  async resolveUrl(assetId: string, options: { refresh?: boolean } = {}): Promise<string> {
    const local = this.objectUrls.get(assetId)
    // A refresh means the last URL failed to load, so it skips the local preview too.
    if (local && options.refresh) { URL.revokeObjectURL(local); this.objectUrls.delete(assetId) } else if (local) return local
    const preview = options.refresh ? undefined : await this.previews.get(this.key(assetId)).catch(() => undefined)
    if (preview) {
      const url = URL.createObjectURL(preview.blob)
      this.objectUrls.set(assetId, url)
      return url
    }
    const cached = this.urls.get(assetId)
    if (!options.refresh && cached && cached.expiresAt - this.now() > URL_MARGIN_MS) return cached.url
    const download = await this.api.download(assetId)
    this.urls.set(assetId, { url: download.url, expiresAt: Date.parse(download.expiresAt) || this.now() + 60_000 })
    return download.url
  }

  describeError(error: unknown) {
    return uploadErrorMessage(error) ?? apiErrorMessage(error)
  }

  assetName(assetId: string) {
    return this.records.get(assetId)?.filename ?? null
  }

  // Core AssetRepository: used by non-editor code (exports, imports).
  async put(data: AssetBinary, metadata: AssetMetadata): Promise<AssetRecord> {
    const file = new File([data as BlobPart], metadata.filename ?? 'file', { type: metadata.mimeType })
    return this.upload(file, { signal: new AbortController().signal, onProgress: () => {} })
  }
  async get(id: AssetId): Promise<AssetBinary | null> {
    try {
      const response = await fetch(await this.resolveUrl(id), { credentials: 'omit' })
      return response.ok ? new Uint8Array(await response.arrayBuffer()) : null
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null
      throw error
    }
  }
  async getRecord(id: AssetId) { return this.records.get(id) ?? null }
  async findByHash(hash: AssetRecord['hash']) { return [...this.records.values()].find((record) => record.hash === hash) ?? null }
  async remove(id: AssetId) { await this.api.remove(id) }

  dispose() {
    this.objectUrls.forEach((url) => URL.revokeObjectURL(url))
    this.objectUrls.clear()
    this.urls.clear()
  }
}

/**
 * After a reload, aborts reservations whose tab is gone (no Web Lock held), so a half-finished
 * upload never lingers. Uploads in other open tabs keep their lock and are left alone.
 */
export async function abortAbandonedUploads(userId: string, options: { api?: Pick<Api, 'abort'>; pending?: PendingCommandStore; now?: () => number } = {}) {
  const api = options.api ?? assetsApi
  const pending = options.pending ?? new IndexedDbPendingCommandStore()
  const now = options.now ?? Date.now
  const commands = await pending.list(userId, 'asset-upload').catch(() => [])
  for (const command of commands) {
    const { uploadId, expiresAt } = command.payload as { uploadId: string; expiresAt: string }
    const abandoned = navigator.locks
      ? await navigator.locks.request(lockName(uploadId), { ifAvailable: true }, (lock) => lock !== null)
      : Date.parse(expiresAt) < now()
    if (!abandoned) continue
    if (Date.parse(expiresAt) > now()) {
      try { await api.abort(uploadId) } catch (error) {
        // Already finished, expired or gone: nothing to free.
        if (!(error instanceof ApiError && (error.status === 404 || error.status === 409))) continue
      }
    }
    await pending.remove(command.id).catch(() => {})
  }
}
