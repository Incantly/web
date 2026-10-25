import { useCallback, useEffect, useRef, useState } from 'react'
import type { AssetRecord } from '@incantly/canvas-core/document'
import type { AssetUploadProgress, DocumentAssetHost } from './assetHost'

export interface AssetUploadState {
  id: string
  file: File
  previewUrl?: string
  status: 'pending' | 'uploading' | 'ready' | 'error'
  progress?: AssetUploadProgress
  record?: AssetRecord
  error?: unknown
}

/** Transient upload state. It never enters document JSON; only the finished `assetId` does. */
export function useAssetUploads(host: DocumentAssetHost) {
  const [uploads, setUploads] = useState<AssetUploadState[]>([])
  const live = useRef<AssetUploadState[]>([])
  const controllers = useRef(new Map<string, AbortController>())
  useEffect(() => { live.current = uploads })
  const patch = useCallback((id: string, change: Partial<AssetUploadState>) => setUploads((items) => items.map((item) => item.id === id ? { ...item, ...change } : item)), [])
  const upload = useCallback(async (entry: AssetUploadState) => {
    const controller = new AbortController()
    controllers.current.set(entry.id, controller)
    patch(entry.id, { status: 'uploading', error: undefined, progress: { loaded: 0, total: entry.file.size } })
    try {
      const record = await host.upload(entry.file, { signal: controller.signal, onProgress: (progress) => patch(entry.id, { progress }) })
      if (!controller.signal.aborted) patch(entry.id, { status: 'ready', record })
    } catch (error) {
      if (!controller.signal.aborted) patch(entry.id, { status: 'error', error })
    } finally {
      controllers.current.delete(entry.id)
    }
  }, [host, patch])
  const add = useCallback((files: readonly File[]) => {
    const entries = files.map((file) => ({ id: crypto.randomUUID(), file, previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined, status: 'pending' as const }))
    setUploads((items) => [...items, ...entries])
    entries.forEach((entry) => void upload(entry))
    return entries
  }, [upload])
  /** Dismisses an entry; an upload still in flight is cancelled (the host aborts its reservation). */
  const remove = useCallback((id: string) => {
    controllers.current.get(id)?.abort()
    controllers.current.delete(id)
    setUploads((items) => { const item = items.find((value) => value.id === id); if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl); return items.filter((value) => value.id !== id) })
  }, [])
  const retry = useCallback((id: string) => { const entry = live.current.find((item) => item.id === id); if (entry) void upload(entry) }, [upload])
  useEffect(() => {
    const pending = controllers.current
    return () => {
      pending.forEach((controller) => controller.abort())
      live.current.forEach((item) => { if (item.previewUrl) URL.revokeObjectURL(item.previewUrl) })
    }
  }, [])
  return { uploads, add, retry, remove }
}
