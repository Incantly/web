import type { DocumentMetadata } from '@incantly/canvas-core/document'
import type { Editor } from '@tiptap/core'

/**
 * Document metadata (title, page setup, layout) lives on the editor's top node, and every full
 * save rebuilds the canonical document from it. So metadata is changed here, through the editor,
 * as one document-attribute step: the change saves like any other edit, and a later edit can't
 * write the old values back.
 */

export function documentMetadata(editor: Editor | null): DocumentMetadata | null {
  if (!editor || editor.isDestroyed) return null
  const metadata = editor.state.doc.attrs.metadata as DocumentMetadata | null | undefined
  return metadata ?? null
}

/** Replaces the document's metadata with `update(current)`. Not added to the undo history. Returns false when nothing changed. */
export function setDocumentMetadata(editor: Editor | null, update: (current: DocumentMetadata) => DocumentMetadata): boolean {
  const current = documentMetadata(editor)
  if (!editor || !current) return false
  const next = update(current)
  if (next === current || JSON.stringify(next) === JSON.stringify(current)) return false
  editor.view.dispatch(editor.state.tr.setDocAttribute('metadata', next).setMeta('addToHistory', false))
  return true
}
