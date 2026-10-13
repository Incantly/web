import { useEffect, useMemo, useRef } from 'react'
import type { Editor } from '@tiptap/core'
import type { AssetRepository } from '@incantly/core/document'
import { useDocumentEditor } from '../DocumentEditorContext'
import { fileDropHub, insertUploadedAsset } from '../fileUploads'
import { getSharedAssetRepository } from '../indexedDbAssetRepository'
import { useAssetUploads } from '../useAssetUploads'

interface PendingInsert {
  uploadId: string
  pos: number | null
  filename: string
}

export interface DocumentFileUploadsProps {
  editor?: Editor | null
  repository?: AssetRepository
}

/**
 * Bridges dropped/pasted files into asset-card nodes. Binaries upload to
 * the asset repository (never into document JSON); on success the matching
 * card is inserted at the drop position, or the document end for pastes and
 * stale positions. Failures stay visible with retry; successes clear away.
 */
export function DocumentFileUploads({ editor: suppliedEditor, repository }: DocumentFileUploadsProps) {
  const contextualEditor = useDocumentEditor()
  const editor = suppliedEditor ?? contextualEditor
  const repo = useMemo(() => repository ?? getSharedAssetRepository(), [repository])
  const { uploads, add, retry, remove } = useAssetUploads(repo)
  const editorRef = useRef(editor)
  editorRef.current = editor
  const pendingRef = useRef<PendingInsert[]>([])

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
    const activeEditor = editorRef.current
    if (!activeEditor || activeEditor.isDestroyed) return
    for (const upload of uploads) {
      if (upload.status !== 'ready' || !upload.record) continue
      const pending = pendingRef.current.find((item) => item.uploadId === upload.id)
      if (!pending) {
        // Orphaned by a remount mid-upload: nothing left to insert into.
        remove(upload.id)
        continue
      }
      pendingRef.current = pendingRef.current.filter((item) => item.uploadId !== upload.id)
      insertUploadedAsset(activeEditor, upload.record, pending.filename, pending.pos)
      remove(upload.id)
    }
  }, [uploads, remove])

  if (!editor) return null
  const visible = uploads.filter((upload) => upload.status !== 'ready')
  if (!visible.length) return null
  return (
    <div className="incantly-upload-status" role="status" aria-label="File uploads">
      {visible.map((upload) => (
        <div key={upload.id} className="incantly-upload-status__item">
          <span className="incantly-upload-status__name">{upload.file.name || 'Attachment'}</span>
          <span className="incantly-upload-status__state">
            {upload.status === 'error' ? 'Failed' : upload.status === 'uploading' ? 'Uploading…' : 'Waiting…'}
          </span>
          {upload.status === 'error' ? (
            <button type="button" onClick={() => retry(upload.id)}>Retry</button>
          ) : null}
          <button type="button" onClick={() => remove(upload.id)} aria-label={`Dismiss ${upload.file.name || 'attachment'}`}>✕</button>
        </div>
      ))}
    </div>
  )
}
