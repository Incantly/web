import { useCallback, useEffect, useRef, useState } from 'react'
import type { AssetRecord, AssetRepository } from '@incantly/core/document'

export interface AssetUploadState { id: string; file: File; previewUrl?: string; status: 'pending' | 'uploading' | 'ready' | 'error'; record?: AssetRecord; error?: unknown }
export function useAssetUploads(repository: AssetRepository) {
  const [uploads, setUploads] = useState<AssetUploadState[]>([])
  const live = useRef<AssetUploadState[]>([])
  live.current = uploads
  const upload = useCallback(async (entry: AssetUploadState) => {
    setUploads((items) => items.map((item) => item.id === entry.id ? { ...item, status: 'uploading', error: undefined } : item))
    try {
      const record = await repository.put(await entry.file.arrayBuffer(), { filename: entry.file.name, mimeType: entry.file.type || 'application/octet-stream', byteLength: entry.file.size })
      setUploads((items) => items.map((item) => item.id === entry.id ? { ...item, status: 'ready', record } : item))
    } catch (error) { setUploads((items) => items.map((item) => item.id === entry.id ? { ...item, status: 'error', error } : item)) }
  }, [repository])
  const add = useCallback((files: readonly File[]) => {
    const entries = files.map((file) => ({ id: crypto.randomUUID(), file, previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined, status: 'pending' as const }))
    setUploads((items) => [...items, ...entries])
    entries.forEach((entry) => void upload(entry))
    return entries
  }, [upload])
  const remove = useCallback((id: string) => setUploads((items) => { const item = items.find((value) => value.id === id); if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl); return items.filter((value) => value.id !== id) }), [])
  const retry = useCallback((id: string) => { const entry = live.current.find((item) => item.id === id); if (entry) void upload(entry) }, [upload])
  useEffect(() => () => { live.current.forEach((item) => { if (item.previewUrl) URL.revokeObjectURL(item.previewUrl) }) }, [])
  return { uploads, add, retry, remove }
}
