import type { Editor } from '@tiptap/core'
import type { AssetRecord } from '@incantly/core/document'
import { documentRichCommands } from './richCommands'

export interface PendingFileDrop {
  editor: Editor
  files: File[]
  /** Drop position, or null for pastes (insert at the selection). */
  pos: number | null
}

type FileDropListener = (drop: PendingFileDrop) => void

function createFileDropHub() {
  const listeners = new Set<FileDropListener>()
  const emit = (drop: PendingFileDrop): void => {
    for (const listener of [...listeners]) {
      try {
        listener(drop)
      } catch {
        // One bad subscriber must never break the drop for the rest.
      }
    }
  }
  return {
    options: {
      onDrop: (editor: Editor, files: File[], pos: number) => emit({ editor, files, pos }),
      onPaste: (editor: Editor, files: File[]) => emit({ editor, files, pos: null }),
    },
    subscribe: (listener: FileDropListener): (() => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
}

/**
 * Module hub between the statically-registered FileHandler extension and
 * the mounted upload components. Subscribers ignore drops aimed at other
 * editor instances, so multiple editors never double-insert.
 */
export const fileDropHub = createFileDropHub()

/**
 * Insert a stored asset as the matching asset-card node. A stale drop
 * position falls back to the document end instead of failing the upload.
 */
export function insertUploadedAsset(editor: Editor, record: AssetRecord, filename: string, pos: number | null): boolean {
  let placed = false
  if (typeof pos === 'number') {
    try {
      placed = editor.commands.setTextSelection(pos)
    } catch {
      placed = false
    }
  }
  if (!placed) editor.commands.focus('end')
  const name = filename.trim() || 'Attachment'
  const mime = record.mimeType
  if (mime.startsWith('image/')) return documentRichCommands.insertImage(editor, { assetId: record.id, alt: name })
  if (mime.startsWith('audio/')) return documentRichCommands.insertAudio(editor, { assetId: record.id, title: name })
  if (mime === 'application/pdf') return documentRichCommands.insertPdf(editor, { assetId: record.id })
  // Local video files have no embed provider; keep them as file cards.
  return documentRichCommands.insertFileAttachment(editor, { assetId: record.id, filename: name, mimeType: mime })
}
