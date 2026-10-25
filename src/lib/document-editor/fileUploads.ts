import type { Editor, JSONContent } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'
import type { AssetRecord } from '@incantly/canvas-core/document'

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

/** The canonical node for an uploaded asset. Local video files have no embed provider, so they stay file cards. */
function assetNode(record: AssetRecord, name: string, size: { width: number; height: number } | null): JSONContent {
  const mime = record.mimeType
  if (mime.startsWith('image/')) return { type: 'image', attrs: { assetId: record.id, alt: name, caption: null, width: size?.width ?? null, height: size?.height ?? null } }
  if (mime.startsWith('audio/')) return { type: 'audio', attrs: { assetId: record.id, title: name, caption: null } }
  if (mime === 'application/pdf') return { type: 'pdfEmbed', attrs: { assetId: record.id, display: 'card' } }
  return { type: 'fileAttachment', attrs: { assetId: record.id, filename: name, mimeType: mime } }
}

/**
 * Insert a stored asset as the matching asset node: at the drop position, or the document end
 * for pastes and stale positions. A selected block (often the previous upload) is never
 * replaced: the new node goes after it.
 */
export function insertUploadedAsset(editor: Editor, record: AssetRecord, filename: string, pos: number | null, size: { width: number; height: number } | null = null): boolean {
  let placed = false
  if (typeof pos === 'number') {
    try {
      placed = editor.commands.setTextSelection(pos)
    } catch {
      placed = false
    }
  }
  const content = assetNode(record, filename.trim() || 'Attachment', size)
  if (!placed) return editor.chain().focus().insertContentAt(editor.state.doc.content.size, content).run()
  const { selection } = editor.state
  if (selection instanceof NodeSelection) return editor.chain().focus().insertContentAt(selection.to, content).run()
  return editor.chain().focus().insertContent(content).run()
}

/** Intrinsic image size, stored on the node so the page reserves space before the image loads. */
export async function measureImage(file: Blob): Promise<{ width: number; height: number } | null> {
  try {
    const bitmap = await createImageBitmap(file)
    const size = { width: bitmap.width, height: bitmap.height }
    bitmap.close()
    return size.width > 0 && size.height > 0 && size.width <= 100_000 && size.height <= 100_000 ? size : null
  } catch {
    return null
  }
}

/**
 * Opens the system file picker and sends the chosen files through the same path as a paste,
 * so touch and keyboard users can add files without drag and drop.
 */
export function pickFilesForEditor(editor: Editor, accept?: string): boolean {
  if (!editor.isEditable || typeof document === 'undefined') return false
  const input = document.createElement('input')
  input.type = 'file'
  input.multiple = true
  if (accept) input.accept = accept
  input.addEventListener('change', () => {
    const files = [...(input.files ?? [])]
    if (files.length && !editor.isDestroyed) fileDropHub.options.onPaste(editor, files)
  }, { once: true })
  input.click()
  return true
}
