import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Editor } from '@tiptap/core'
import type { AssetRecord, AssetRepository } from '@incantly/core/document'
import { useDocumentEditor } from '../DocumentEditorContext'
import { repositoryAssetHost, useAssetHostOrLocal } from '../assetHost'
import { fileDropHub, insertUploadedAsset, measureImage } from '../fileUploads'
import { useAssetUploads } from '../useAssetUploads'

interface PendingInsert {
  uploadId: string
  pos: number | null
  filename: string
}

export interface DocumentFileUploadsProps {
  editor?: Editor | null
  /** Overrides the host from `DocumentAssetsProvider`. Without either, assets stay in this browser (IndexedDB). */
  repository?: AssetRepository
  /** Extra actions for a finished upload (e.g. "Also add to Library"). Uploads it doesn't apply to clear right away. */
  afterUpload?: UploadFollowUp
}

export interface UploadFollowUp {
  applies(record: AssetRecord): boolean
  render(record: AssetRecord, file: File, dismiss: () => void): ReactNode
}

const percent = (loaded = 0, total = 0) => (total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0)

/**
 * Bridges dropped/pasted/picked files into asset nodes. Binaries go to the asset host (never into
 * document JSON); on success the matching node is inserted at the drop position, or the selection
 * for pastes and stale positions. In-flight uploads show progress and can be cancelled; failures
 * stay visible with retry.
 */
export function DocumentFileUploads({ editor: suppliedEditor, repository, afterUpload }: DocumentFileUploadsProps) {
  const contextualEditor = useDocumentEditor()
  const editor = suppliedEditor ?? contextualEditor
  const contextHost = useAssetHostOrLocal()
  const host = useMemo(() => (repository ? repositoryAssetHost(repository) : contextHost), [repository, contextHost])
  const { uploads, add, retry, remove } = useAssetUploads(host)
  const editorRef = useRef(editor)
  useEffect(() => { editorRef.current = editor })
  const pendingRef = useRef<PendingInsert[]>([])
  const [offers, setOffers] = useState<string[]>([])

  useEffect(() => fileDropHub.subscribe((drop) => {
    const activeEditor = editorRef.current
    if (!activeEditor || activeEditor.isDestroyed || drop.editor !== activeEditor || !activeEditor.isEditable) return
    if (!drop.files.length) return
    const entries = add(drop.files)
    pendingRef.current.push(...entries.map((entry) => ({
      uploadId: entry.id,
      pos: drop.pos,
      filename: entry.file.name,
    })))
  }), [add])

  useEffect(() => {
    for (const upload of uploads) {
      if (upload.status !== 'ready' || !upload.record) continue
      const pending = pendingRef.current.find((item) => item.uploadId === upload.id)
      if (!pending) continue
      pendingRef.current = pendingRef.current.filter((item) => item.uploadId !== upload.id)
      const { record, file } = upload
      void (async () => {
        // Always leave the effect first: node views must not mount inside a React lifecycle (flushSync).
        await Promise.resolve()
        const size = record.mimeType.startsWith('image/') ? await measureImage(file) : null
        const activeEditor = editorRef.current
        if (!activeEditor || activeEditor.isDestroyed) return remove(upload.id)
        insertUploadedAsset(activeEditor, record, pending.filename, pending.pos, size)
        if (afterUpload?.applies(record)) setOffers((items) => [...items, upload.id])
        else remove(upload.id)
      })()
    }
  }, [uploads, remove, afterUpload])

  if (!editor) return null
  const dismiss = (id: string) => { setOffers((items) => items.filter((item) => item !== id)); remove(id) }
  const visible = uploads.flatMap((upload) => {
    if (upload.status !== 'ready') return [{ upload, extra: null as ReactNode }]
    if (!offers.includes(upload.id) || !upload.record || !afterUpload) return []
    return [{ upload, extra: afterUpload.render(upload.record, upload.file, () => dismiss(upload.id)) }]
  })
  if (!visible.length) return null
  return (
    <div className="incantly-upload-status" role="status" aria-label="File uploads">
      {visible.map(({ upload, extra }) => {
        const name = upload.file.name || 'Attachment'
        const value = percent(upload.progress?.loaded, upload.progress?.total)
        return (
          <div key={upload.id} className="incantly-upload-status__entry">
            <div className="incantly-upload-status__item">
              <span className="incantly-upload-status__name">{name}</span>
              <span className="incantly-upload-status__state">
                {upload.status === 'error' ? 'Failed' : upload.status === 'ready' ? 'Added' : upload.status === 'uploading' ? `${value}%` : 'Waiting…'}
              </span>
              {upload.status === 'error' ? <button type="button" onClick={() => retry(upload.id)}>Retry</button> : null}
              <button type="button" onClick={() => dismiss(upload.id)} aria-label={upload.status === 'uploading' || upload.status === 'pending' ? `Cancel uploading ${name}` : `Dismiss ${name}`}>✕</button>
            </div>
            {upload.status === 'uploading' ? (
              <div className="incantly-upload-status__bar" role="progressbar" aria-label={`Uploading ${name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
                <span style={{ width: `${value}%` }} />
              </div>
            ) : null}
            {upload.status === 'error' ? <p className="incantly-upload-status__error">{host.describeError?.(upload.error) ?? 'The upload didn’t finish. Please try again.'}</p> : null}
            {extra}
          </div>
        )
      })}
    </div>
  )
}
