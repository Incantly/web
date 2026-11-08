import { Extension, type Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { startPixelShader, type PlaceholderEnergy } from './pixelShader'

export type { PlaceholderEnergy }

/**
 * The in-note placeholder while a simulation generates: a block-sized pixel shader that
 * breathes (zooming in and out) with its energy following the job's stage, then fades as
 * the finished figure reveals beneath it. A ProseMirror widget decoration, so it takes
 * real layout space at the anchor (no content jump on swap) yet never enters the document
 * — autosave can never submit it, and a reload simply drops it while the server-attached
 * figure arrives through normal sync.
 */

type PlaceholderHandlers = {
  onRetry: () => void
  onDismiss: () => void
}

type PlaceholderAction =
  | { type: 'show'; key: string; anchorNodeId: string | null; label: string; energy: PlaceholderEnergy; handlers: PlaceholderHandlers }
  | { type: 'update'; key: string; label: string; energy: PlaceholderEnergy }
  | { type: 'fail'; key: string; message: string; retryable: boolean }
  | { type: 'hide'; key: string }

type PlaceholderEntry = {
  anchorNodeId: string | null
  element: HTMLElement
  caption: HTMLElement
  errorBox: HTMLElement
  errorMessage: HTMLElement
  retryButton: HTMLButtonElement
  shader: { stop: () => void; setEnergy: (energy: PlaceholderEnergy) => void }
}

/**
 * One placeholder per key: the in-note generator owns one key, each assistant
 * run owns its simulation job's key. Actions for an unknown key are no-ops, so
 * concurrent generations never steal or kill each other's widget.
 */
type PlaceholderState = {
  entries: ReadonlyMap<string, PlaceholderEntry>
  decorations: DecorationSet
} | null

export const simulationPlaceholderPluginKey = new PluginKey<PlaceholderState>('simulationPlaceholder')

/** Top-level block positions by canonical node ID. */
function blocksById(doc: ProseMirrorNode): Map<string, { pos: number; node: ProseMirrorNode }> {
  const blocks = new Map<string, { pos: number; node: ProseMirrorNode }>()
  doc.descendants((node, pos) => {
    if (pos >= 0 && typeof node.attrs?.id === 'string' && node.attrs.id) blocks.set(node.attrs.id, { pos, node })
    return node.isTextblock ? false : true
  })
  return blocks
}

/** Where the placeholder sits: after the anchor block, or at the end without one. */
function anchorPos(doc: ProseMirrorNode, anchorNodeId: string | null): number {
  if (anchorNodeId) {
    const anchor = blocksById(doc).get(anchorNodeId)
    if (anchor) return anchor.pos + anchor.node.nodeSize
  }
  return doc.content.size
}

/**
 * Fallback anchor for failures before a selection exists: the block holding the cursor,
 * else the end of the document. Everything about a generation stays in the note.
 */
export function anchorNodeIdForSelection(editor: { state: { doc: ProseMirrorNode; selection: { $from: { pos: number } } } }, ranges: { nodeId?: string | null }[]): string | null {
  const fromRanges = ranges.find((range) => range.nodeId)?.nodeId
  if (fromRanges) return fromRanges
  const pos = editor.state.selection.$from.pos
  let found: string | null = null
  editor.state.doc.descendants((node, at) => {
    if (at <= pos && pos <= at + node.nodeSize && typeof node.attrs?.id === 'string' && node.attrs.id) {
      found = node.attrs.id
      return node.isTextblock ? false : true
    }
    return true
  })
  return found
}

function el(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag)
  node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function buildElement(key: string, label: string, energy: PlaceholderEnergy, handlers: PlaceholderHandlers): Pick<PlaceholderEntry, 'element' | 'caption' | 'errorBox' | 'errorMessage' | 'retryButton' | 'shader'> {
  const element = el('div', 'incantly-simulation-pending')
  element.dataset.simulationPlaceholder = 'true'
  element.dataset.simulationKey = key
  element.contentEditable = 'false'
  const canvas = document.createElement('canvas')
  canvas.className = 'incantly-simulation-pending__pixels'
  canvas.setAttribute('aria-hidden', 'true')
  const caption = el('p', 'incantly-simulation-pending__caption', label)
  caption.setAttribute('role', 'status')
  const errorBox = el('div', 'incantly-simulation-pending__error')
  errorBox.hidden = true
  const errorMessage = el('p', 'incantly-simulation-pending__message')
  const retryButton = document.createElement('button') as HTMLButtonElement
  retryButton.type = 'button'
  retryButton.className = 'incantly-simulation-pending__retry'
  retryButton.textContent = 'Retry'
  retryButton.addEventListener('click', handlers.onRetry)
  const dismissButton = document.createElement('button') as HTMLButtonElement
  dismissButton.type = 'button'
  dismissButton.className = 'incantly-simulation-pending__dismiss'
  dismissButton.textContent = 'Dismiss'
  dismissButton.setAttribute('aria-label', 'Dismiss')
  dismissButton.addEventListener('click', handlers.onDismiss)
  errorBox.append(errorMessage, retryButton, dismissButton)
  element.append(canvas, caption, errorBox)
  const shader = startPixelShader(canvas)
  shader.setEnergy(energy)
  return { element, caption, errorBox, errorMessage, retryButton, shader }
}

function placeAll(doc: ProseMirrorNode, entries: ReadonlyMap<string, PlaceholderEntry>): DecorationSet {
  // Anchors are stable node IDs (or the end without one), so positions are
  // recomputed from the current document on every structural change; ordinary
  // edits between them glide through the set mapping below.
  return DecorationSet.create(doc, [...entries].map(([key, entry]) =>
    Decoration.widget(anchorPos(doc, entry.anchorNodeId), () => entry.element, {
      key: `simulation-pending:${key}`,
      side: 1,
      stopEvent: () => true,
      ignoreSelection: true,
    }),
  ))
}

const placeholderPlugin = new Plugin<PlaceholderState>({
  key: simulationPlaceholderPluginKey,
  state: {
    init: () => null,
    apply(tr, previous) {
      const action = tr.getMeta(simulationPlaceholderPluginKey) as PlaceholderAction | undefined
      if (!action) {
        // Ordinary edits: keep every widget glued to its mapped position.
        return previous ? { entries: previous.entries, decorations: previous.decorations.map(tr.mapping, tr.doc) } : previous
      }
      const entries = new Map(previous?.entries ?? [])
      if (action.type === 'hide') {
        const entry = entries.get(action.key)
        if (!entry) return previous
        entry.shader.stop()
        entries.delete(action.key)
        if (!entries.size) return null
        return { entries, decorations: placeAll(tr.doc, entries) }
      }
      if (action.type === 'show') {
        // Show (or re-show): a previous widget under the same key is replaced.
        entries.get(action.key)?.shader.stop()
        const built = buildElement(action.key, action.label, action.energy, action.handlers)
        entries.set(action.key, { anchorNodeId: action.anchorNodeId, ...built })
        return { entries, decorations: placeAll(tr.doc, entries) }
      }
      // Updates against a fresh view (after the completion reload) or for a
      // foreign key are no-ops: only an explicit show may create the widget.
      const entry = entries.get(action.key)
      if (!entry || !previous) return previous
      if (action.type === 'update') {
        entry.caption.textContent = action.label
        entry.shader.setEnergy(action.energy)
        entry.errorBox.hidden = true
        entry.caption.hidden = false
        entry.element.classList.remove('is-failed')
      } else {
        entry.errorMessage.textContent = action.message
        entry.retryButton.hidden = !action.retryable
        entry.errorBox.hidden = false
        entry.caption.hidden = true
        entry.element.classList.add('is-failed')
      }
      return { entries, decorations: previous.decorations.map(tr.mapping, tr.doc) }
    },
  },
  props: {
    decorations(state) {
      return simulationPlaceholderPluginKey.getState(state)?.decorations ?? null
    },
  },
})

export const SimulationPlaceholder = Extension.create({
  name: 'simulationPlaceholder',
  addProseMirrorPlugins() {
    return [placeholderPlugin]
  },
})

function dispatch(editor: Editor, action: PlaceholderAction): void {
  if (editor.isDestroyed) return
  editor.view.dispatch(editor.view.state.tr.setMeta(simulationPlaceholderPluginKey, action))
}

/** The in-note generator's placeholder key: it runs one generation at a time. */
export const NOTE_SIMULATION_KEY = 'note'

export function showSimulationPlaceholder(
  editor: Editor,
  options: { key: string; anchorNodeId: string | null; label: string; energy: PlaceholderEnergy; onRetry: () => void; onDismiss: () => void },
): void {
  const { key, onRetry, onDismiss, ...rest } = options
  dispatch(editor, { type: 'show', key, ...rest, handlers: { onRetry, onDismiss } })
}

export function updateSimulationPlaceholder(editor: Editor, key: string, label: string, energy: PlaceholderEnergy): void {
  dispatch(editor, { type: 'update', key, label, energy })
}

export function failSimulationPlaceholder(editor: Editor, key: string, message: string, retryable: boolean): void {
  dispatch(editor, { type: 'fail', key, message, retryable })
}

/** Removes the placeholder, fading it first so the figure beneath reveals slowly. */
export function hideSimulationPlaceholder(editor: Editor, key: string, fade: boolean): void {
  if (editor.isDestroyed) return
  if (!fade) {
    dispatch(editor, { type: 'hide', key })
    return
  }
  const live = editor.view.dom.querySelector(`[data-simulation-placeholder][data-simulation-key="${CSS.escape(key)}"]`)
  if (!(live instanceof HTMLElement)) {
    dispatch(editor, { type: 'hide', key })
    return
  }
  live.classList.add('is-leaving')
  window.setTimeout(() => dispatch(editor, { type: 'hide', key }), 450)
}

/**
 * Assistant-thread generation progress for the open note: the chat dispatches (it knows the
 * simulation job and its stages) and the note screen renders into this placeholder. The chat
 * never touches the editor; the note never follows the job. Failures hide silently — the
 * chat thread itself reports them.
 */
export const CHAT_SIMULATION_EVENT = 'incantly:chat-simulation'
export type ChatSimulationDetail =
  | { noteId: string; jobId: string; phase: 'show' | 'update'; label: string; energy: PlaceholderEnergy }
  | { noteId: string; jobId: string; phase: 'hide' }
export function dispatchChatSimulation(detail: ChatSimulationDetail): void {
  window.dispatchEvent(new CustomEvent<ChatSimulationDetail>(CHAT_SIMULATION_EVENT, { detail }))
}

/** The finished figure fades and settles in over half a second. */
export function animateFigureReveal(editor: Editor, nodeId: string): void {
  if (editor.isDestroyed) return
  const dom = editor.view.dom.querySelector(`[data-node-id="${CSS.escape(nodeId)}"]`)
  if (!(dom instanceof HTMLElement)) return
  dom.classList.add('is-revealing')
  window.setTimeout(() => dom.classList.remove('is-revealing'), 700)
}
