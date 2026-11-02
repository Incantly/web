import type { DocumentNode } from '@incantly/canvas-core/document'
import type { Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import { wordDiff } from '../notes/wordDiff'
import { incantlyNodeIdPluginKey } from './schema/nodeIds'
import { renderBlocksPreview } from './suggestionPreview'

/**
 * Suggested edits drawn over the note as decorations, never as document content, so autosave can
 * never submit them (docs/agent-note-edits.md, "Frontend contract"). Removed words are struck
 * through in red, added words shown in green, whole blocks outlined, and new rich content (lists,
 * tables, math, images) previewed read-only with the note's own rendering. Each change carries its
 * own Accept and Reject; deciding is the caller's job, and the note reloads from the server after.
 */

export type EditorSuggestion = {
  /** Unique across proposals, e.g. `proposalId:changeId`. */
  key: string
  /** `other`: a kind this app doesn't know yet, offered with Accept/Reject and its plain text only. */
  kind: 'editText' | 'insertBlocks' | 'replaceBlocks' | 'deleteBlock' | 'moveBlock' | 'other'
  nodeId?: string
  /** replaceBlocks: the adjacent blocks replaced, in document order, and their text when read. */
  nodeIds?: string[]
  baseTexts?: string[]
  /** insertBlocks / replaceBlocks: the new canonical blocks, already through the load gate. */
  blocks?: DocumentNode[]
  /** The block's text when the assistant read it (`\n` is a hard break). */
  baseText?: string
  /** editText: the proposed whole text. */
  text?: string
  /** insertBlocks / replaceBlocks: the plain text of each new top-level block (the fallback). */
  texts?: string[]
  position?: { afterNodeId?: string; beforeNodeId?: string }
  /** What the controls say, e.g. "Suggested edit". */
  label: string
  /** Shown as "includes web content". */
  fromWeb?: boolean
}

export type SuggestionHandlers = {
  accept: (key: string) => void
  reject: (key: string) => void
  /** ⌘Z / Ctrl+Z: return true when it undid an accepted suggestion instead of a local edit. */
  undo: () => boolean
  /** The user changed the note (after which ⌘Z is the editor's own undo again). */
  edited: () => void
  /** Short-lived URL for an image in a preview. */
  resolveImage?: (assetId: string) => Promise<string>
}

type SuggestionState = { suggestions: EditorSuggestion[]; handlers: SuggestionHandlers | null; busy: boolean; active: string | null; decorations: DecorationSet
  /** Counts the user's own edits (not ID repairs or other appended transactions). */
  edits: number }

export const suggestionsPluginKey = new PluginKey<SuggestionState>('incantlySuggestions')

type Meta = Partial<Pick<SuggestionState, 'suggestions' | 'handlers' | 'busy' | 'active'>>

/** A block's text as the server counts it: a hard break is `\n`; any other inline atom is one placeholder. */
export function blockText(node: ProseMirrorNode): string {
  let text = ''
  node.forEach((child) => {
    if (child.isText) text += child.text ?? ''
    else if (child.type.name === 'hardBreak') text += '\n'
    else text += '￼'
  })
  return text
}

type Located = { pos: number; node: ProseMirrorNode }

function blocksById(doc: ProseMirrorNode): Map<string, Located> {
  const blocks = new Map<string, Located>()
  doc.descendants((node, pos) => {
    const id = node.attrs?.id
    if (typeof id === 'string' && !blocks.has(id)) blocks.set(id, { pos, node })
    return !node.isTextblock
  })
  return blocks
}

/** Whether a change can be drawn, and whether its block changed since the assistant read it. */
export function suggestionTarget(doc: ProseMirrorNode, suggestion: EditorSuggestion, blocks = blocksById(doc)): { found: boolean; stale: boolean; pos: number } {
  if (suggestion.kind === 'other') return { found: true, stale: false, pos: doc.content.size }
  if (suggestion.kind === 'replaceBlocks') {
    const targets = (suggestion.nodeIds ?? []).map((id) => blocks.get(id))
    if (!targets.length || targets.some((target) => !target)) return { found: false, stale: true, pos: 0 }
    const stale = targets.some((target, index) => target!.node.isTextblock && suggestion.baseTexts?.[index] !== undefined && blockText(target!.node) !== suggestion.baseTexts[index])
    return { found: true, stale, pos: targets[0]!.pos }
  }
  if (suggestion.kind === 'insertBlocks') {
    const anchor = suggestion.position?.afterNodeId ?? suggestion.position?.beforeNodeId
    const block = anchor ? blocks.get(anchor) : undefined
    return { found: Boolean(block), stale: false, pos: block?.pos ?? 0 }
  }
  const block = suggestion.nodeId ? blocks.get(suggestion.nodeId) : undefined
  if (!block) return { found: false, stale: true, pos: 0 }
  const stale = suggestion.baseText !== undefined && block.node.isTextblock && blockText(block.node) !== suggestion.baseText
  return { found: true, stale, pos: block.pos }
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string) {
  const node = document.createElement(tag)
  node.className = className
  // Suggested text is the assistant's plain text: always set as text, never as HTML.
  if (text !== undefined) node.textContent = text
  return node
}

function controls(view: EditorView, suggestion: EditorSuggestion, note: string | null) {
  const bar = element('div', 'incantly-suggestion-actions')
  bar.contentEditable = 'false'
  bar.dataset.suggestion = suggestion.key
  const label = element('span', 'incantly-suggestion-label', suggestion.label)
  bar.append(label)
  if (suggestion.fromWeb) bar.append(element('span', 'incantly-suggestion-note', 'Includes web content'))
  if (note) bar.append(element('span', 'incantly-suggestion-note', note))
  const state = suggestionsPluginKey.getState(view.state)
  const button = (text: string, tone: string, run: (key: string) => void) => {
    const action = element('button', `incantly-suggestion-button ${tone}`, text)
    action.type = 'button'
    action.disabled = Boolean(state?.busy)
    action.setAttribute('aria-label', `${text} ${suggestion.label.toLowerCase()}`)
    // Keep the editor's selection and focus where they were.
    action.addEventListener('mousedown', (event) => event.preventDefault())
    action.addEventListener('click', () => run(suggestion.key))
    return action
  }
  bar.append(
    button('Reject', 'is-reject', (key) => suggestionsPluginKey.getState(view.state)?.handlers?.reject(key)),
    button('Accept', 'is-accept', (key) => suggestionsPluginKey.getState(view.state)?.handlers?.accept(key)),
  )
  return bar
}

/** Plain text only (no marks, inline math or breaks), so a word diff shows the whole change. */
function plainBlock(block: DocumentNode | undefined): boolean {
  if (!block || (block.type !== 'paragraph' && block.type !== 'heading')) return false
  return block.content.every((inline) => inline.type === 'text' && !inline.marks?.length)
}

/** Red removed and green added words over one text block, from `before` to `after`. */
function wordDiffDecorations(decorations: Decoration[], block: Located, before: string, after: string, spec: (extra: string) => object) {
  const start = block.pos + 1
  let offset = 0
  wordDiff(before, after).forEach((part, index) => {
    if (part.kind === 'same') { offset += part.text.length; return }
    if (part.kind === 'removed') {
      decorations.push(Decoration.inline(start + offset, start + offset + part.text.length, { class: 'incantly-suggest-removed' }))
      offset += part.text.length
      return
    }
    decorations.push(Decoration.widget(start + offset, () => element('span', 'incantly-suggest-added', part.text), { ...spec(`:${index}`), side: 1, marks: [] }))
  })
}

/** The green box with the new content (rich preview, or plain text) and its controls. */
function newContent(view: EditorView, suggestion: EditorSuggestion, className: string, note: string | null) {
  const box = element('div', className)
  box.contentEditable = 'false'
  box.dataset.suggestion = suggestion.key
  const resolveImage = suggestionsPluginKey.getState(view.state)?.handlers?.resolveImage
  box.append(renderBlocksPreview(view.state.schema, suggestion.blocks ?? [], suggestion.texts ?? [], { resolveImage }))
  box.append(controls(view, suggestion, note))
  return box
}

function build(doc: ProseMirrorNode, state: Omit<SuggestionState, 'decorations' | 'edits'>): DecorationSet {
  if (!state.suggestions.length) return DecorationSet.empty
  const blocks = blocksById(doc)
  const decorations: Decoration[] = []
  const spec = (suggestion: EditorSuggestion, extra = '') => ({ key: `${suggestion.key}:${state.busy}:${state.active === suggestion.key}${extra}`, ignoreSelection: true, stopEvent: () => true })
  const activeClass = (suggestion: EditorSuggestion) => (state.active === suggestion.key ? ' is-active' : '')

  for (const suggestion of state.suggestions) {
    const target = suggestionTarget(doc, suggestion, blocks)
    if (!target.found) continue
    if (suggestion.kind === 'other') {
      decorations.push(Decoration.widget(doc.content.size, (view) => newContent(view, suggestion, `incantly-suggestion-insert${activeClass(suggestion)}`, null), { ...spec(suggestion), side: 1 }))
      continue
    }
    if (suggestion.kind === 'insertBlocks') {
      const before = !suggestion.position?.afterNodeId
      const anchor = blocks.get((suggestion.position?.afterNodeId ?? suggestion.position?.beforeNodeId)!)!
      const at = before ? anchor.pos : anchor.pos + anchor.node.nodeSize
      decorations.push(Decoration.widget(at, (view) => newContent(view, suggestion, `incantly-suggestion-insert${activeClass(suggestion)}`, null), { ...spec(suggestion), side: before ? -1 : 1 }))
      continue
    }
    if (suggestion.kind === 'replaceBlocks') {
      const targets = suggestion.nodeIds!.map((id) => blocks.get(id)!)
      const last = targets.at(-1)!
      const end = last.pos + last.node.nodeSize
      const [only] = targets
      const [next] = suggestion.blocks ?? []
      // One text block becoming the same kind of block (same ID) is an in-place edit: when the new
      // text is plain, a word diff shows it exactly; otherwise the old block is struck and the new one previewed.
      const inPlace = targets.length === 1 && suggestion.blocks?.length === 1 && next?.id === only.node.attrs.id && only.node.isTextblock && next.type === only.node.type.name && plainBlock(next)
      if (inPlace && !target.stale) {
        decorations.push(Decoration.node(only.pos, end, { class: `incantly-suggestion-block is-edit${activeClass(suggestion)}`, 'data-suggestion': suggestion.key }))
        wordDiffDecorations(decorations, only, suggestion.baseTexts?.[0] ?? blockText(only.node), suggestion.texts?.[0] ?? '', (extra) => spec(suggestion, extra))
        decorations.push(Decoration.widget(end, (view) => controls(view, suggestion, null), { ...spec(suggestion, ':controls'), side: 1 }))
        continue
      }
      for (const replaced of targets) decorations.push(Decoration.node(replaced.pos, replaced.pos + replaced.node.nodeSize, { class: `incantly-suggestion-block is-replaced${target.stale ? ' is-stale' : ''}`, 'data-suggestion': suggestion.key }))
      const note = target.stale ? 'This text changed since. Accepting may not apply.' : null
      decorations.push(Decoration.widget(end, (view) => newContent(view, suggestion, `incantly-suggestion-insert is-replacement${activeClass(suggestion)}`, note), { ...spec(suggestion, `:replacement:${target.stale}`), side: 1 }))
      continue
    }

    const block = blocks.get(suggestion.nodeId!)!
    const end = block.pos + block.node.nodeSize
    const tone = suggestion.kind === 'deleteBlock' ? 'is-delete' : suggestion.kind === 'moveBlock' ? 'is-move' : 'is-edit'
    decorations.push(Decoration.node(block.pos, end, { class: `incantly-suggestion-block ${tone}${target.stale ? ' is-stale' : ''}${activeClass(suggestion)}`, 'data-suggestion': suggestion.key }))

    if (suggestion.kind === 'editText' && !target.stale && block.node.isTextblock) {
      wordDiffDecorations(decorations, block, suggestion.baseText ?? '', suggestion.text ?? '', (extra) => spec(suggestion, extra))
    }

    if (suggestion.kind === 'moveBlock') {
      const anchorId = suggestion.position?.afterNodeId ?? suggestion.position?.beforeNodeId
      const anchor = anchorId ? blocks.get(anchorId) : undefined
      if (anchor) {
        const before = !suggestion.position?.afterNodeId
        decorations.push(Decoration.widget(before ? anchor.pos : anchor.pos + anchor.node.nodeSize, () => {
          const marker = element('div', 'incantly-suggestion-move-target', 'Moves here')
          marker.contentEditable = 'false'
          return marker
        }, { ...spec(suggestion, ':target'), side: before ? -1 : 1 }))
      }
    }

    const note = target.stale ? 'This text changed since. Accepting may not apply.' : null
    decorations.push(Decoration.widget(end, (view) => controls(view, suggestion, note), { ...spec(suggestion, `:controls:${target.stale}`), side: 1 }))
  }
  return DecorationSet.create(doc, decorations)
}

function isUndoKey(event: KeyboardEvent) {
  return (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'z'
}

function suggestionsPlugin() {
  return new Plugin<SuggestionState>({
    key: suggestionsPluginKey,
    state: {
      init: () => ({ suggestions: [], handlers: null, busy: false, active: null, decorations: DecorationSet.empty, edits: 0 }),
      apply(transaction, previous, _old, next: EditorState) {
        const meta = transaction.getMeta(suggestionsPluginKey) as Meta | undefined
        if (!meta && !transaction.docChanged) return previous
        const userEdit = transaction.docChanged && !transaction.getMeta('appendedTransaction') && !transaction.getMeta(incantlyNodeIdPluginKey)
        const state = { ...previous, ...meta, edits: previous.edits + (userEdit ? 1 : 0) }
        return { ...state, decorations: build(next.doc, state) }
      },
    },
    props: {
      decorations: (state) => suggestionsPluginKey.getState(state)?.decorations,
      handleKeyDown(view, event) {
        if (!isUndoKey(event)) return false
        return suggestionsPluginKey.getState(view.state)?.handlers?.undo() ?? false
      },
    },
    view: () => ({
      update(view, previous) {
        const state = suggestionsPluginKey.getState(view.state)
        if (state && state.edits !== suggestionsPluginKey.getState(previous)?.edits) state.handlers?.edited()
      },
    }),
  })
}

/** Adds the suggestions layer to an editor. Returns the cleanup. */
export function registerSuggestions(editor: Editor): () => void {
  if (editor.isDestroyed) return () => {}
  if (!suggestionsPluginKey.getState(editor.state)) editor.registerPlugin(suggestionsPlugin())
  return () => { if (!editor.isDestroyed) editor.unregisterPlugin(suggestionsPluginKey) }
}

/** Replaces what the layer shows. `busy` disables every Accept and Reject while a decision is applied. */
export function setSuggestions(editor: Editor, meta: Meta) {
  if (editor.isDestroyed || !suggestionsPluginKey.getState(editor.state)) return
  editor.view.dispatch(editor.state.tr.setMeta(suggestionsPluginKey, meta).setMeta('addToHistory', false))
}

/** Scrolls a suggestion into view and highlights it. Returns false when it can't be shown. */
export function revealSuggestion(editor: Editor, key: string): boolean {
  if (editor.isDestroyed) return false
  setSuggestions(editor, { active: key })
  const element = editor.view.dom.querySelector(`[data-suggestion="${CSS.escape(key)}"]`)
  if (!(element instanceof HTMLElement)) return false
  element.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  return true
}
