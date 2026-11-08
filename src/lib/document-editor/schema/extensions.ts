import { Extension, type Extensions } from '@tiptap/core'
import { splitListItem } from '@tiptap/pm/schema-list'
import { TextSelection } from '@tiptap/pm/state'
import { search } from 'prosemirror-search'
import { addRowAfter, selectedRect } from '@tiptap/pm/tables'
import StarterKit from '@tiptap/starter-kit'
import { Collaboration } from '@tiptap/extension-collaboration'
import type * as Y from 'yjs'
import FileHandler from '@tiptap/extension-file-handler'
import Underline from '@tiptap/extension-underline'
import Placeholder from '@tiptap/extension-placeholder'
import TextAlign from '@tiptap/extension-text-align'
import { fileDropHub } from '../fileUploads'
import { IncantlyFigure } from '../figures'
import { FigureChange } from '../figureChange'
import { SimulationPlaceholder } from '../simulationPlaceholder'
import { incantlyDocumentMarks } from './marks'
import { IncantlyNodeIds } from './nodeIds'
import { IncantlyTableSchemaRoles, incantlyDocumentNodes } from './nodes'
import { RemotePresence } from '../remotePresence'
import { WebPagination, type WebPaginationOptions } from '../paginationExtension'
import { DocumentClipboard, type DocumentClipboardOptions } from '../clipboardExtension'
import { TableHandleExtension } from '@/components/tiptap-node/table-node/extensions/table-handle'

const restrictedStarterKit = StarterKit.configure({
  document: false,
  text: false,
  paragraph: false,
  heading: false,
  blockquote: false,
  bulletList: false,
  orderedList: false,
  listItem: false,
  horizontalRule: false,
  codeBlock: false,
  underline: false,
  trailingNode: false,
  link: {
    openOnClick: false,
    autolink: false,
    linkOnPaste: false,
    protocols: ['http', 'https', 'mailto', 'tel'],
  },
})

// Mirrors restrictedStarterKit minus the stock undo manager: on a Yjs-bound
// editor Collaboration owns history (its Yjs UndoManager), so the two never
// double-handle undo/redo. Kept as a separate literal so the legacy schema
// above stays untouched byte-for-byte.
const collaborationStarterKit = StarterKit.configure({
  document: false,
  text: false,
  paragraph: false,
  heading: false,
  blockquote: false,
  bulletList: false,
  orderedList: false,
  listItem: false,
  horizontalRule: false,
  codeBlock: false,
  underline: false,
  trailingNode: false,
  undoRedo: false,
  link: {
    openOnClick: false,
    autolink: false,
    linkOnPaste: false,
    protocols: ['http', 'https', 'mailto', 'tel'],
  },
})

/**
 * In-document find highlights. The plugin only decorates (transient view
 * state, never persisted); the find bar drives it through search queries.
 */
const IncantlySearch = Extension.create({
  name: 'incantlySearch',
  addProseMirrorPlugins() {
    return [search()]
  },
})

const FormattingShortcuts = Extension.create({
  name: 'incantlyFormattingShortcuts',
  addKeyboardShortcuts() {
    return {
      'Mod-Alt-0': () => this.editor.commands.setNode('paragraph'),
      'Mod-Alt-1': () => this.editor.commands.setNode('heading', { level: 1 }),
      'Mod-Alt-2': () => this.editor.commands.setNode('heading', { level: 2 }),
      'Mod-Shift-7': () => this.editor.commands.toggleList('orderedList', 'listItem'),
      'Mod-Shift-8': () => this.editor.commands.toggleList('bulletList', 'listItem'),
      'Mod-Shift-B': () => this.editor.commands.toggleWrap('blockquote'),
      // Image-align shortcuts live in the official useImageAlign hook
      // (react-hotkeys); registering them here too would double-fire.
      Enter: () => {
        const listItem = this.editor.state.schema.nodes.listItem
        if (!listItem) return false
        return splitListItem(listItem)(this.editor.state, (transaction) => this.editor.view.dispatch(transaction))
      },
      Tab: () => {
        // Spreadsheet behavior: Tab in the last cell of the last row appends
        // a row and lands in its first cell. Anywhere else Tab keeps its
        // default (focus moves on), so keyboard users are never trapped.
        const { state } = this.editor
        const { $from } = state.selection
        let inTable = false
        for (let depth = $from.depth; depth > 0; depth--) {
          if ($from.node(depth).type.name === 'table') { inTable = true; break }
        }
        if (!inTable) return false
        let rect: ReturnType<typeof selectedRect>
        try {
          rect = selectedRect(state)
        } catch {
          return false
        }
        if (rect.bottom - 1 !== rect.map.height - 1 || rect.right - 1 !== rect.map.width - 1) return false
        const tablePos = rect.tableStart
        const newRowIndex = rect.map.height
        addRowAfter(state, (transaction) => this.editor.view.dispatch(transaction))
        // tableStart is the table *content* start (before the first row),
        // so the table node itself starts one position earlier.
        const table = this.editor.state.doc.nodeAt(tablePos - 1)
        if (!table || table.type.name !== 'table') return true
        let caret = tablePos + 1
        for (let index = 0; index < newRowIndex; index++) caret += table.child(index).nodeSize
        caret += 3
        const $caret = this.editor.state.doc.resolve(Math.min(caret, this.editor.state.doc.content.size))
        const selection = TextSelection.findFrom($caret, 1) ?? TextSelection.findFrom($caret, -1)
        if (selection) this.editor.view.dispatch(this.editor.state.tr.setSelection(selection).scrollIntoView())
        return true
      },
    }
  },
})

/**
 * The complete v1 editing schema. Keep this list explicit: adding an extension is
 * a persisted-format decision and must be paired with core schema support.
 */
export interface IncantlyDocumentExtensionOptions {
  placeholder?: string | (() => string)
  pagination?: false | WebPaginationOptions
  clipboard?: false | DocumentClipboardOptions
  /**
   * Yjs realtime (migration Phase 1): binds the editor to the note's Yjs doc.
   * Absent on the legacy path. Stable Incantly node IDs round-trip as Yjs
   * attributes, so the fold back to canonical JSON is exact.
   */
  collaboration?: { document: Y.Doc; field?: string }
}

export function createIncantlyDocumentExtensions(
  options: IncantlyDocumentExtensionOptions = {},
): Extensions {
  const placeholder = options.placeholder
  const collaboration = options.collaboration
  return [
    collaboration ? collaborationStarterKit : restrictedStarterKit,
    Underline,
    Placeholder.configure({
      placeholder: typeof placeholder === 'function' ? () => placeholder() : placeholder ?? 'Start writing…',
      showOnlyCurrent: true,
      showOnlyWhenEditable: true,
      includeChildren: false,
    }),
    ...incantlyDocumentNodes,
    IncantlyFigure,
    FigureChange,
    SimulationPlaceholder,
    IncantlyTableSchemaRoles,
    TableHandleExtension,
    ...incantlyDocumentMarks,
    IncantlyNodeIds,
    // Realtime convergence for `yjs`-flagged notes only; legacy editors never
    // see this extension. y-prosemirror awareness stays off: the custom
    // selection-presence caret is unchanged by the migration.
    ...(collaboration ? [Collaboration.configure({ document: collaboration.document, field: collaboration.field ?? 'default' })] : []),
    // Word-style text alignment (left/center/right only — justify is
    // deliberately unconfigured so no command, shortcut, or paste can set it).
    TextAlign.configure({ types: ['heading', 'paragraph'], alignments: ['left', 'center', 'right'] }),
    // Dropped/pasted files route to the asset pipeline via the file-drop
    // hub (inert with no mounted upload component listening).
    FileHandler.configure(fileDropHub.options),
    IncantlySearch,
    FormattingShortcuts,
    RemotePresence,
    ...(options.pagination === false ? [] : [WebPagination.configure(options.pagination ?? {})]),
    ...(options.clipboard === false ? [] : [DocumentClipboard.configure(options.clipboard ?? {})]),
  ]
}

export const incantlyDocumentExtensions: Extensions = createIncantlyDocumentExtensions()
