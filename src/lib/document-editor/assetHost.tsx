import { createContext, useContext, type ReactNode } from 'react'
import type { AssetRecord, AssetRepository } from '@incantly/core/document'
import { getSharedAssetRepository } from './indexedDbAssetRepository'

export interface AssetUploadProgress {
  loaded: number
  total: number
}

/**
 * What the editor needs from an asset backend: uploads with progress and cancel, and a
 * short-lived URL to show an asset. Documents keep `assetId` only; URLs are never persisted.
 * The app injects the backend (server, IndexedDB); this module never names one.
 */
export interface DocumentAssetHost {
  upload(file: File, options: { signal: AbortSignal; onProgress: (progress: AssetUploadProgress) => void }): Promise<AssetRecord>
  /** `refresh` skips any cached URL, e.g. after the previous one expired. */
  resolveUrl(assetId: string, options?: { refresh?: boolean }): Promise<string>
  /** Friendly copy for a failed upload or lookup. */
  describeError?(error: unknown): string
  /** A display name remembered from the upload, for nodes that store none (PDF embeds). */
  assetName?(assetId: string): string | null
}

/** Adapts any core `AssetRepository` (e.g. IndexedDB) to the host interface, using object URLs. */
export function repositoryAssetHost(repository: AssetRepository): DocumentAssetHost {
  const urls = new Map<string, string>()
  return {
    async upload(file, { signal, onProgress }) {
      const bytes = await file.arrayBuffer()
      if (signal.aborted) throw new DOMException('Upload cancelled', 'AbortError')
      const record = await repository.put(bytes, { filename: file.name, mimeType: file.type || 'application/octet-stream', byteLength: file.size })
      onProgress({ loaded: file.size, total: file.size })
      return record
    },
    async resolveUrl(assetId) {
      const existing = urls.get(assetId)
      if (existing) return existing
      const [record, binary] = await Promise.all([repository.getRecord(assetId as AssetRecord['id']), repository.get(assetId as AssetRecord['id'])])
      if (!binary) throw new Error('ASSET_NOT_FOUND')
      const url = URL.createObjectURL(new Blob([binary as BlobPart], { type: record?.mimeType }))
      urls.set(assetId, url)
      return url
    },
  }
}

const AssetHostContext = createContext<DocumentAssetHost | null>(null)

let localHost: DocumentAssetHost | null = null
const fallbackHost = () => (localHost ??= repositoryAssetHost(getSharedAssetRepository()))

export function DocumentAssetsProvider({ host, children }: { host: DocumentAssetHost; children: ReactNode }) {
  return <AssetHostContext.Provider value={host}>{children}</AssetHostContext.Provider>
}

export function useDocumentAssetHost(): DocumentAssetHost | null {
  return useContext(AssetHostContext)
}

/** The provided host, or this browser's IndexedDB store when no provider is mounted. */
export function useAssetHostOrLocal(): DocumentAssetHost {
  return useContext(AssetHostContext) ?? fallbackHost()
}
