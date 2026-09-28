import type { Editor, JSONContent } from '@tiptap/core'
import type { ResolvedPos } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'
import { addColumnAfter, addRowAfter, deleteColumn, deleteRow } from '@tiptap/pm/tables'

export interface InsertTableOptions {
  rows?: number
  columns?: number
  withHeaderRow?: boolean
}

export interface AssetCardOptions {
  assetId: string
  title?: string
  caption?: string
}

const paragraph = (): JSONContent => ({ type: 'paragraph' })

const inTable = ($pos: ResolvedPos): boolean => {
  for (let depth = $pos.depth; depth > 0; depth--) {
    if ($pos.node(depth).type.name === 'table') return true
  }
  return false
}

/**
 * pm table commands read the head end of the selection, but a drag or
 * Shift+Home can start on a block boundary outside the table while the
 * bubble is still open. Collapse to valid text inside the table first so
 * the buttons work for any selection touching a table.
 */
const focusTableSelection = (editor: Editor): boolean => {
  const { state } = editor
  for (const $pos of [state.selection.$head, state.selection.$anchor]) {
    if (!inTable($pos)) continue
    const near = TextSelection.findFrom($pos, 1) ?? TextSelection.findFrom($pos, -1)
    if (near && inTable(near.$from)) {
      editor.view.dispatch(state.tr.setSelection(near))
      return true
    }
  }
  return false
}

const runTableCommand = (editor: Editor, command: typeof addRowAfter): boolean => {
  if (!focusTableSelection(editor)) return false
  return command(editor.state, (transaction) => editor.view.dispatch(transaction))
}

/**
 * Canonical-schema commands for the initial rich-writing surface. They deliberately
 * emit only Incantly nodes/marks; renderers may later replace the safe card UI
 * without changing stored document JSON.
 */
export const documentRichCommands = {
  setLink: (editor: Editor, href: string, title?: string): boolean =>
    editor.chain().focus().setMark('link', { href, title: title ?? null }).run(),
  unsetLink: (editor: Editor): boolean => editor.chain().focus().unsetMark('link').run(),
  setHighlight: (editor: Editor, color = '#fef08a'): boolean =>
    editor.chain().focus().setMark('highlight', { color }).run(),
  setTextColor: (editor: Editor, color: string): boolean =>
    editor.chain().focus().setColor(color).run(),
  unsetTextColor: (editor: Editor): boolean =>
    editor.chain().focus().unsetColor().run(),
  toggleTextAlignment: (editor: Editor, alignment: 'left' | 'center' | 'right'): boolean =>
    editor.chain().focus().toggleTextAlign(alignment).run(),
  unsetTextAlignment: (editor: Editor): boolean =>
    editor.chain().focus().unsetTextAlign().run(),
  setInlineMath: (editor: Editor, latex: string): boolean =>
    editor.chain().focus().setMark('inlineMathMark', { latex }).run(),
  insertChecklist: (editor: Editor, checked = false): boolean => editor.chain().focus().insertContent({
    type: 'checklist',
    content: [{ type: 'checklistItem', attrs: { checked }, content: [paragraph()] }],
  }).run(),
  insertMathBlock: (editor: Editor, latex: string, numbered = false, label?: string): boolean =>
    editor.chain().focus().insertContent({
      type: 'blockMath',
      attrs: { latex, ...(numbered ? { numbered: true } : {}), ...(label ? { label } : {}) },
    }).run(),
  insertTable: (editor: Editor, options: InsertTableOptions = {}): boolean => {
    const { $from } = editor.state.selection
    for (let depth = $from.depth; depth > 0; depth--) {
      // Tables nest visually outward without bound; the slash menu hides
      // this item inside tables and the command refuses as backstop.
      if ($from.node(depth).type.name === 'table') return false
    }
    console.log('[slashdbg2] insertTable', JSON.stringify(options))
    const rows = Math.max(1, options.rows ?? 3)
    const columns = Math.max(1, options.columns ?? 3)
    const content: JSONContent[] = Array.from({ length: rows }, (_, rowIndex) => ({
      type: 'tableRow',
      content: Array.from({ length: columns }, () => ({
        type: options.withHeaderRow !== false && rowIndex === 0 ? 'tableHeaderCell' : 'tableCell',
        content: [paragraph()],
      })),
    }))
    return editor.chain().insertContent({ type: 'table', content }).run()
  },
  addTableRow: (editor: Editor): boolean => runTableCommand(editor, addRowAfter),
  addTableColumn: (editor: Editor): boolean => runTableCommand(editor, addColumnAfter),
  deleteTableRow: (editor: Editor): boolean => runTableCommand(editor, deleteRow),
  deleteTableColumn: (editor: Editor): boolean => runTableCommand(editor, deleteColumn),
  insertImage: (editor: Editor, options: AssetCardOptions & { alt?: string }): boolean => editor.chain().focus().insertContent({
    type: 'image', attrs: { assetId: options.assetId, alt: options.alt ?? null, caption: options.caption ?? null },
  }).run(),
  insertFileAttachment: (editor: Editor, options: AssetCardOptions & { filename?: string; mimeType?: string }): boolean => editor.chain().focus().insertContent({
    type: 'fileAttachment', attrs: { assetId: options.assetId, filename: options.filename ?? options.title ?? null, mimeType: options.mimeType ?? null },
  }).run(),
  insertAudio: (editor: Editor, options: AssetCardOptions): boolean => editor.chain().focus().insertContent({
    type: 'audio', attrs: { assetId: options.assetId, title: options.title ?? null, caption: options.caption ?? null },
  }).run(),
  insertVideo: (editor: Editor, videoId: string, title?: string): boolean => editor.chain().focus().insertContent({
    type: 'videoEmbed', attrs: { provider: 'youtube', videoId, title: title ?? null },
  }).run(),
  insertPdf: (editor: Editor, options: AssetCardOptions): boolean => editor.chain().focus().insertContent({
    type: 'pdfEmbed', attrs: { assetId: options.assetId, display: 'card' },
  }).run(),
  insertCanvas: (editor: Editor, canvasId: string, caption?: string): boolean => editor.chain().focus().insertContent({
    type: 'canvasEmbed', attrs: { canvasId, caption: caption ?? null, display: 'card' },
  }).run(),
  insertPageBreak: (editor: Editor): boolean => editor.chain().focus().insertContent({ type: 'pageBreak' }).run(),
}
