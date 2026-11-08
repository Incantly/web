import { Extension, type Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

/**
 * The "change this figure" and "delete this figure" buttons on every approved figure in the
 * note. The figure node view itself is the SDK's and offers no action slot, so each figure
 * gets a widget decoration: a zero-height block above it holding small buttons that overlay
 * the figure's top-right corner. Widgets, not nodes, so they never enter the document —
 * autosave can never submit them, and they simply follow the figure through edits.
 *
 * The change button only announces; the popup and the change job live in React
 * (`FigureChangePopup`), which listens for this event and anchors under the clicked button.
 * The delete button removes the figure node directly as a normal edit (undoable, synced
 * like any deletion); the stored figure itself is immutable history and stays readable.
 */
export const FIGURE_CHANGE_EVENT = 'incantly:figure-change'
export type FigureChangeDetail = { figureId: string }

/** Static pencil glyph; no interpolated content ever reaches markup here. */
const PENCIL_SVG =
  '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11.5 2.5l2 2L5 13l-2.6.6L3 11l8.5-8.5z"/></svg>'

/** Static trash glyph; no interpolated content ever reaches markup here. */
const TRASH_SVG =
  '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 4h11M6.5 4V2.8c0-.4.4-.8.8-.8h1.4c.4 0 .8.4.8.8V4M4 4l.7 9.2c0 .5.4.8.9.8h4.8c.5 0 .9-.3.9-.8L12 4"/></svg>'

/** Deletes the figure node itself (matched by stable node id, else figure id). */
function deleteFigureNode(editor: Editor, nodeId: string | null, figureId: string): boolean {
  if (editor.isDestroyed || !editor.isEditable) return false
  let targetPos = -1
  let targetSize = 0
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'incantlyFigure') return true
    const matches = nodeId != null ? node.attrs.id === nodeId : node.attrs.figureId === figureId
    if (matches) {
      targetPos = pos
      targetSize = node.nodeSize
    }
    return false
  })
  if (targetPos < 0) return false
  editor.view.dispatch(editor.state.tr.delete(targetPos, targetPos + targetSize))
  editor.view.focus()
  return true
}

function buildAnchor(figureId: string, nodeId: string | null, editor: Editor): HTMLElement {
  const anchor = document.createElement('div')
  anchor.className = 'incantally-figure-change'
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'incantally-figure-change__button'
  button.title = 'Change this figure'
  button.setAttribute('aria-label', 'Change this figure')
  button.innerHTML = PENCIL_SVG
  button.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    // Dispatched on the button (not the window) so the popup can anchor under it via the
    // event target; bubbles so the React listener on the window still hears it.
    button.dispatchEvent(
      new CustomEvent<FigureChangeDetail>(FIGURE_CHANGE_EVENT, {
        detail: { figureId },
        bubbles: true,
      }),
    )
  })
  const remove = document.createElement('button')
  remove.type = 'button'
  remove.className = 'incantally-figure-change__button incantally-figure-change__button--delete'
  remove.title = 'Delete this figure'
  remove.setAttribute('aria-label', 'Delete this figure')
  remove.innerHTML = TRASH_SVG
  remove.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    deleteFigureNode(editor, nodeId, figureId)
  })
  anchor.append(remove, button)
  return anchor
}

function changeDecorations(doc: ProseMirrorNode, editor: Editor): DecorationSet | null {
  const widgets: Decoration[] = []
  doc.descendants((node, pos) => {
    if (node.type.name !== 'incantlyFigure') return true
    const figureId = node.attrs.figureId
    if (typeof figureId !== 'string' || !figureId) return false
    const nodeId = typeof node.attrs.id === 'string' && node.attrs.id ? node.attrs.id : null
    widgets.push(
      Decoration.widget(pos, () => buildAnchor(figureId, nodeId, editor), {
        // Keyed by node AND figure: ProseMirror reuses keyed widget DOM across rebuilds,
        // so the key must change when the figure swaps — otherwise the button keeps
        // announcing the old figureId after a swap (or a live-sync update) replaces it.
        key: `figure-change-${node.attrs.id ?? 'noid'}-${figureId}`,
        side: -1,
        stopEvent: () => true,
        ignoreSelection: true,
      }),
    )
    return false
  })
  return widgets.length ? DecorationSet.create(doc, widgets) : null
}

export const FigureChange = Extension.create({
  name: 'figureChange',

  addProseMirrorPlugins() {
    const { editor } = this
    return [
      new Plugin({
        props: {
          decorations: (state) => (editor.isEditable ? changeDecorations(state.doc, editor) : null),
        },
      }),
    ]
  },
})
