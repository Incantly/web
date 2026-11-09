import { contentRef, sandboxAdapter, type FigureStyle } from '@incantly/core'
import {
  FigureNode as SdkFigureNode,
  type FigureErrorReport,
  type FigureFragments,
  type FigureStore,
  type SnapshotSource,
} from '@incantly/tiptap'
import type { Editor } from '@tiptap/core'
import { simulationsApi } from '../api/simulations'

/**
 * How every figure in a note looks. A preset and layout only, no tokens: raw colors are
 * banned outside `globals.css`, and `var(--ui-*)` references would not resolve inside the
 * sandboxed frame (only the SDK's own `--inc-*` tokens travel there). The `paper` preset
 * matches the light note canvas; figures always render `light` like the notes around them.
 *
 * The description never shows: the figure speaks for itself, and the host caption stays
 * available to screen readers (see document.css). The trusted CSS fills the screen in
 * fullscreen (panes side by side, no scrolling anywhere) and clears the frame wash so
 * no box edge shows against the note card. Sliders stay native (blue via the `lit`
 * token). CSS travels into the sandbox by hash, so plain selectors only: no URLs, no
 * imports, nothing that can reach the network.
 */
const NOTE_FIGURE_CSS = [
  '/* Fullscreen fills the screen: panes side by side, the drawing full height. The',
  '   frame is transparent in the note, but fullscreen needs its own wash: without one',
  '   the browser backdrop (black) shows around and through the figure. */',
  '.inc-figure:fullscreen { display: flex; flex-direction: column; width: 100%; height: 100%; overflow: hidden; background: var(--inc-bg); }',
  '.inc-figure::backdrop { background: var(--inc-bg); }',
  '.inc-figure:fullscreen .inc-body { flex: 1 1 auto; min-height: 0; }',
  '.inc-figure:fullscreen .inc-scene { flex: 1 1 auto; min-height: 0; }',
  '.inc-figure:fullscreen .inc-scene[data-panels] { display: flex; flex-direction: row; align-items: stretch; }',
  '.inc-figure:fullscreen .inc-scene[data-panels] > * { flex: 1 1 0%; min-width: 0; min-height: 0; }',
  '.inc-figure:fullscreen .inc-stage-host { height: 100%; }',
  '.inc-figure:fullscreen .inc-stage { max-height: none; height: 100%; }',
  '/* The figure never shows a scrollbar: the frame fits its content, and the drawing itself never scrolls. */',
  '.inc-figure { overflow: hidden; }',
  '.inc-stage { overflow: clip; }',
  '/* No figure wash: the paper preset paints the frame a solid box, which reads as a',
  '   border against the note card. The drawing and controls sit on the card directly. */',
  '.inc-figure { background: transparent; }',
  '/* Transport controls read as blue icons. The text stays in the DOM, so screen',
  '   readers and tooltips keep announcing Play, Restart, Undo and the rest. */',
  '.inc-transport button[data-action] { color: var(--inc-lit); }',
  ".inc-transport button[data-action='toggle'],",
  ".inc-transport button[data-action='restart'],",
  ".inc-transport button[data-action='reset'],",
  ".inc-transport button[data-action='undo'],",
  ".inc-transport button[data-action='redo'],",
  ".inc-transport button[data-action='compare'],",
  ".inc-transport button[data-action='frame'],",
  ".inc-transport button[data-action='sound'] {",
  '  font-size: 0;',
  '  line-height: 1;',
  '  min-width: max(var(--inc-target), var(--inc-control-height));',
  '}',
  ".inc-transport button[data-action='toggle']::before,",
  ".inc-transport button[data-action='restart']::before,",
  ".inc-transport button[data-action='reset']::before,",
  ".inc-transport button[data-action='undo']::before,",
  ".inc-transport button[data-action='redo']::before,",
  ".inc-transport button[data-action='compare']::before,",
  ".inc-transport button[data-action='frame']::before,",
  ".inc-transport button[data-action='sound']::before { font-size: 1.1rem; line-height: 1; }",
  ".inc-transport button[data-action='toggle']::before { content: '▶'; }",
  ".inc-transport button[data-action='toggle'][data-playing='true']::before { content: '❚❚'; }",
  ".inc-transport button[data-action='restart']::before { content: '↻'; }",
  ".inc-transport button[data-action='reset']::before { content: '↺'; }",
  ".inc-transport button[data-action='undo']::before { content: '↩'; }",
  ".inc-transport button[data-action='redo']::before { content: '↪'; }",
  ".inc-transport button[data-action='compare']::before { content: '◐'; }",
  ".inc-transport button[data-action='frame']::before { content: '▶|'; }",
  ".inc-transport button[data-action='sound']::before { content: '♪'; }",
  ".inc-transport button[data-action='sound'][aria-pressed='false']::before { opacity: 0.45; }",
  '/* Already glyphs in the SDK: settings, fullscreen, and the pane enlargers just turn blue. */',
  '.inc-transport button[data-action=\'settings\'],',
  '.inc-transport button[data-action=\'fullscreen\'],',
  '.inc-figure button.inc-pane-button { color: var(--inc-lit); }',
  '.inc-speed { color: var(--inc-lit); }',
  '.inc-speed select { color: var(--inc-lit); border-color: var(--inc-lit); }',
].join('\n')

export const NOTE_FIGURE_STYLE: FigureStyle = {
  preset: 'paper',
  // Brand blue (landing `--palette-blue`), so icons, sliders, and accents match.
  tokens: { lit: '#2b62d9' },
  layout: { controls: 'below', density: 'comfortable', size: 'md' },
  show: { description: false },
  css: NOTE_FIGURE_CSS,
}

/**
 * The SDK store contract (`FigureStore`) backed by the figures API. Canonical figure nodes
 * carry only the stable reference (`figureId`, `sdkVersion`, title, caption); fragment bodies
 * and snapshots live here, outside the document, keyed by content reference. Memory-only on
 * purpose: nothing the store holds survives a reload (the references are not canonical), so
 * there is nothing an IndexedDB cache could reattach to — hydration re-resolves per session.
 */
class SimulationFigureStore implements FigureStore {
  private readonly snapshots = new Map<string, string>()
  private readonly fragments = new Map<string, FigureFragments>()

  async putSnapshot(png: string): Promise<string> {
    const ref = contentRef(png)
    this.snapshots.set(ref, png)
    return ref
  }

  async getSnapshot(ref: string): Promise<string | undefined> {
    return this.snapshots.get(ref)
  }

  async putFragments(fragments: FigureFragments): Promise<string> {
    const ref = contentRef(`${fragments.html}\n${fragments.css}\n${fragments.js}`)
    this.fragments.set(ref, fragments)
    return ref
  }

  async getFragments(ref: string): Promise<FigureFragments | undefined> {
    return this.fragments.get(ref)
  }

  peekSnapshot(ref: string): string | undefined {
    return this.snapshots.get(ref)
  }
}

let sharedStore: SimulationFigureStore | null = null
/** The process-wide figure store, created lazily so importing this module stays SSR-safe. */
export function figureStore(): SimulationFigureStore {
  sharedStore ??= new SimulationFigureStore()
  return sharedStore
}

class StoreSnapshots implements SnapshotSource {
  url(ref: string): string | undefined {
    return figureStore().peekSnapshot(ref)
  }
}

let sharedSnapshots: SnapshotSource | null = null
export function figureSnapshots(): SnapshotSource {
  sharedSnapshots ??= new StoreSnapshots()
  return sharedSnapshots
}

function reportFigureError(report: FigureErrorReport): void {
  // The report carries no note content by SDK contract (ids and the failure only).
  console.error('[figure] live figure error', {
    figureId: report.figureId,
    fatal: report.fatal,
    phase: report.error.phase,
    message: report.error.message,
  })
}

/**
 * The SDK figure node, registered in the note editor. Extended only with the canonical `id`
 * attribute every block carries (stable IDs are a canonical-model requirement); behavior,
 * commands, and the node view stay the SDK's. Figures mount through the sandboxed execution
 * adapter — fragments are validated and run in an isolated frame, never in the page.
 *
 * Pin note: this extension and the editor must resolve to the SAME `@tiptap/core` and
 * `@tiptap/pm` copies (see `overrides` in package.json). A nested copy under `@incantly/tiptap`
 * would break `instanceof` checks where SDK selections meet editor transactions.
 */
export const IncantlyFigure = SdkFigureNode.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      id: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-node-id'),
        renderHTML: (attributes: Record<string, unknown>) =>
          attributes.id ? { 'data-node-id': String(attributes.id) } : {},
      },
    }
  },
}).configure({
  adapter: sandboxAdapter,
  store: figureStore(),
  snapshots: figureSnapshots(),
  scheduler: {},
  theme: 'light',
  style: NOTE_FIGURE_STYLE,
  onError: reportFigureError,
})

/** A figure's mountable source: its fragments plus the plan's teaching idea for the text alternative. */
export type FigureSource = { fragments: FigureFragments; idea: string | null }

/** Fetches already running, by figure ID, so concurrent resolutions share one request. */
const inflightSources = new Map<string, Promise<FigureSource | null>>()

function loadSource(figureId: string): Promise<FigureSource | null> {
  const running = inflightSources.get(figureId)
  if (running) return running
  const request = simulationsApi
    .fragments(figureId)
    .then((document) => {
      const idea = (document.plan as Record<string, unknown> | null)?.idea
      return {
        fragments: document.fragments as FigureFragments,
        idea: typeof idea === 'string' && idea ? idea : null,
      } satisfies FigureSource
    })
    .catch(() => null)
    .finally(() => {
      if (inflightSources.get(figureId) === request) inflightSources.delete(figureId)
    })
  inflightSources.set(figureId, request)
  return request
}

/**
 * Resolves figure references to fragment bodies. Canonical nodes hold only the reference,
 * which the node view cannot mount from — so after every document load, each figure with a
 * `figureId` but no source gets its fragments from the API, stored by content reference (the
 * store contract), and linked in one transaction. A figure whose fragments are gone stays a
 * placeholder with its text alternative; that is a valid state, not an error to surface.
 */
export async function hydrateFigures(editor: Editor): Promise<void> {
  if (editor.isDestroyed) return
  const missing: { pos: number; figureId: string }[] = []
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'incantlyFigure') return true
    const figureId = node.attrs.figureId
    if (typeof figureId === 'string' && figureId && !node.attrs.fragments && !node.attrs.fragmentsRef) {
      missing.push({ pos, figureId })
    }
    return false
  })
  if (!missing.length) return
  const resolved = await Promise.all(missing.map(async (item) => ({ ...item, source: await loadSource(item.figureId) })))
  if (editor.isDestroyed) return
  const store = figureStore()
  const transaction = editor.state.tr
  for (const item of resolved) {
    if (!item.source) continue
    const node = transaction.doc.nodeAt(item.pos)
    if (!node || node.type.name !== 'incantlyFigure' || node.attrs.fragments || node.attrs.fragmentsRef) continue
    transaction.setNodeMarkup(item.pos, undefined, { ...node.attrs, fragmentsRef: await store.putFragments(item.source.fragments) })
  }
  if (transaction.docChanged) editor.view.dispatch(transaction)
}

/**
 * Live notes: loads every figure's fragments into this tab's memory store without touching
 * the document. Hydration links a device-local `fragmentsRef` by writing the node, which on a
 * live note would write into the shared room on every mount; the references are content
 * hashes, so a figure whose node already carries one mounts from the warmed store.
 */
export async function warmFigureSources(document: { content: readonly unknown[] }): Promise<void> {
  const figureIds = new Set<string>()
  const stack: unknown[] = [...document.content]
  while (stack.length) {
    const node = stack.pop() as { type?: unknown; attrs?: { figureId?: unknown }; content?: unknown } | null
    if (!node || typeof node !== 'object') continue
    if (node.type === 'figure' || node.type === 'incantlyFigure') {
      const figureId = node.attrs?.figureId ?? (node as { figureId?: unknown }).figureId
      if (typeof figureId === 'string' && figureId) figureIds.add(figureId)
    }
    if (Array.isArray(node.content)) stack.push(...node.content)
  }
  const store = figureStore()
  await Promise.all([...figureIds].map(async (figureId) => {
    const source = await loadSource(figureId)
    if (source) await store.putFragments(source.fragments)
  }))
}

/** The canonical block ID of the figure showing `figureId`, if it is in the document. */
export function findFigureNodeId(editor: Editor | null, figureId: string): string | null {
  if (!editor || editor.isDestroyed) return null
  let found: string | null = null
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'incantlyFigure' && node.attrs.figureId === figureId) {
      found = typeof node.attrs.id === 'string' && node.attrs.id ? node.attrs.id : null
      return false
    }
    return true
  })
  return found
}

function findNodePos(editor: Editor, nodeId: string): number | null {
  let found: number | null = null
  editor.state.doc.descendants((node, pos) => {
    if (node.attrs?.id === nodeId) {
      found = pos
      return false
    }
    return true
  })
  return found
}

/**
 * Selects a block and scrolls it into view. Returns false when the block is gone (positions
 * are resolved fresh, so a concurrent edit fails clean instead of landing somewhere random).
 */
export function revealFigureNode(editor: Editor, nodeId: string): boolean {
  if (editor.isDestroyed) return false
  const pos = findNodePos(editor, nodeId)
  if (pos === null) return false
  return editor.chain().focus().setNodeSelection(pos).scrollIntoView().run()
}

export type SimulationPlacement = {
  /** Stable figure reference (the job ID) and canonical node ID for the inserted node. */
  jobId: string
  nodeId: string
  concept: string
  sdkVersion: string
  /** Canonical ID of the selected block the figure follows; null appends at the end. */
  anchorNodeId: string | null
}

/**
 * Places a completed job's figure: reveals it when the server-attached node is already in
 * the document, otherwise inserts the node with its stable ID after the anchor block (at the
 * end when the anchor is nested or gone, mirroring the server). Inserted nodes carry their
 * resolved fragments by content reference, so they mount without waiting for hydration.
 */
export async function placeSimulationFigure(editor: Editor, placement: SimulationPlacement): Promise<{ nodeId: string; inserted: boolean } | null> {
  if (editor.isDestroyed) return null
  const existing = findFigureNodeId(editor, placement.jobId)
  if (existing && revealFigureNode(editor, existing)) return { nodeId: existing, inserted: false }
  if (editor.isDestroyed) return null
  const source = await loadSource(placement.jobId)
  if (editor.isDestroyed) return null
  // Recheck after the fetch: a concurrent reload may have delivered the server's node.
  const raced = findFigureNodeId(editor, placement.jobId)
  if (raced && revealFigureNode(editor, raced)) return { nodeId: raced, inserted: false }
  const store = figureStore()
  const fragmentsRef = source ? await store.putFragments(source.fragments) : null
  const description = source?.idea ?? placement.concept
  const { doc } = editor.state
  let pos = doc.content.size
  if (placement.anchorNodeId) {
    const anchor = findNodePos(editor, placement.anchorNodeId)
    if (anchor !== null) {
      const $anchor = doc.resolve(anchor)
      pos = $anchor.depth === 0 ? anchor + ($anchor.nodeAfter?.nodeSize ?? 0) : $anchor.after(1)
    }
  }
  const inserted = editor.commands.insertContentAt(Math.min(pos, doc.content.size), {
    type: 'incantlyFigure',
    attrs: {
      id: placement.nodeId,
      figureId: placement.jobId,
      concept: placement.concept,
      sdkVersion: placement.sdkVersion,
      description,
      meta: { generationId: placement.jobId },
      ...(fragmentsRef ? { fragmentsRef } : {}),
    },
  })
  if (!inserted) return null
  const nodeId = findFigureNodeId(editor, placement.jobId)
  if (nodeId) revealFigureNode(editor, nodeId)
  return nodeId ? { nodeId, inserted: true } : null
}

/**
 * Swaps a completed change job's figure into the note: the node that showed `oldFigureId` is
 * re-pointed at the new figure and its freshly resolved fragments, keeping its stable ID, title,
 * and caption. Positions resolve fresh, so a concurrent edit fails clean instead of swapping the
 * wrong node. Returns false when the node is gone or the new fragments cannot be read.
 */
export async function swapFigureSource(editor: Editor, oldFigureId: string, newFigureId: string, sdkVersion: string): Promise<boolean> {
  if (editor.isDestroyed) return false
  const source = await loadSource(newFigureId)
  if (editor.isDestroyed) return false
  if (!source) return false
  let pos: number | null = null
  editor.state.doc.descendants((node, at) => {
    if (node.type.name === 'incantlyFigure' && node.attrs.figureId === oldFigureId) {
      pos = at
      return false
    }
    return true
  })
  if (pos === null) return false
  const node = editor.state.doc.nodeAt(pos)
  if (!node || node.type.name !== 'incantlyFigure') return false
  const fragmentsRef = await figureStore().putFragments(source.fragments)
  if (editor.isDestroyed) return false
  const still = editor.state.doc.nodeAt(pos)
  if (!still || still.type.name !== 'incantlyFigure' || still.attrs.figureId !== oldFigureId) return false
  const transaction = editor.state.tr.setNodeMarkup(pos, undefined, {
    ...node.attrs,
    figureId: newFigureId,
    sdkVersion,
    fragmentsRef,
    fragments: undefined,
    meta: { ...(typeof node.attrs.meta === 'object' && node.attrs.meta !== null ? (node.attrs.meta as Record<string, unknown>) : {}), generationId: newFigureId },
  })
  editor.view.dispatch(transaction)
  const nodeId = findFigureNodeId(editor, newFigureId)
  if (nodeId) revealFigureNode(editor, nodeId)
  return true
}
