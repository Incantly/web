import type { Editor } from '@tiptap/core'

const NODE_ID = /^[A-Za-z0-9][A-Za-z0-9:_.-]{0,127}$/

/** Canonical IDs of the text blocks the current selection touches (empty when nothing is selected). */
export function selectedBlockIds(editor: Editor | null, limit = 50): string[] {
  if (!editor || editor.isDestroyed) return []
  const { from, to, empty } = editor.state.selection
  if (empty) return []
  const ids: string[] = []
  editor.state.doc.nodesBetween(from, to, (node) => {
    if (ids.length >= limit) return false
    const id = node.attrs?.id
    if (node.isTextblock && typeof id === 'string' && NODE_ID.test(id)) ids.push(id)
    return !node.isTextblock
  })
  return ids
}

/**
 * Selects and scrolls to a cited range of blocks, from `startId` to `endId` (canonical node IDs).
 * A start at the document's title (`…:title`) starts at the top. Returns false when neither block
 * is in the document any more.
 */
export function revealBlockRange(editor: Editor | null, startId: string, endId: string = startId): boolean {
  if (!editor || editor.isDestroyed) return false
  const found = new Map<string, { from: number; to: number }>()
  editor.state.doc.descendants((node, pos) => {
    const id = node.attrs?.id
    if (typeof id === 'string' && (id === startId || id === endId)) found.set(id, { from: pos, to: pos + node.nodeSize })
    return true
  })
  const atTitle = startId.endsWith(':title')
  const start = atTitle ? { from: 0, to: 0 } : found.get(startId)
  const end = found.get(endId) ?? (atTitle ? undefined : start)
  if (!start || !end) return false
  const from = Math.min(start.from + 1, editor.state.doc.content.size)
  const to = Math.max(from, end.to - 1)
  editor.chain().focus(undefined, { scrollIntoView: false }).setTextSelection({ from, to }).run()
  const element = editor.view.nodeDOM(atTitle ? end.from : start.from)
  if (element instanceof HTMLElement) element.scrollIntoView({ block: 'center' })
  return true
}
