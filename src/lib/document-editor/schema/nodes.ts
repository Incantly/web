import { Node, mergeAttributes, type Extensions } from '@tiptap/core'
import { Blockquote } from '@tiptap/extension-blockquote'
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight'
import { Details, DetailsContent, DetailsSummary } from '@tiptap/extension-details'
import { BulletList, ListItem, OrderedList } from '@tiptap/extension-list'
import { BlockMath as TiptapBlockMath, InlineMath } from '@tiptap/extension-mathematics'
import { TableNode as TiptapTable } from '@/components/tiptap-node/table-node/extensions/table-node-extension'
import { incantlyLowlight } from './codeHighlight'

const nodeIdAttribute = {
  id: {
    default: null,
    parseHTML: (element: HTMLElement) => element.getAttribute('data-node-id'),
    renderHTML: (attributes: Record<string, unknown>) => attributes.id
      ? { 'data-node-id': String(attributes.id) }
      : {},
  },
}

const leaf = (name: string, tag: string, attributes: Record<string, { default: unknown }> = {}) => Node.create({
  name,
  group: 'block',
  atom: true,
  selectable: true,
  addAttributes: () => ({ ...nodeIdAttribute, ...attributes }),
  parseHTML: () => [{ tag: `${tag}[data-incantly-node="${name}"]` }],
  renderHTML: ({ HTMLAttributes }) => [tag, mergeAttributes(HTMLAttributes, {
    'data-incantly-node': name,
    'data-card-label': name.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase()),
    contenteditable: 'false',
  })],
})

const Document = Node.create({
  name: 'doc',
  topNode: true,
  content: 'block+',
  addAttributes: () => ({
    schemaVersion: { default: 1, rendered: false },
    documentId: { default: null, rendered: false },
    metadata: { default: null, rendered: false },
    createdAt: { default: null, rendered: false },
    updatedAt: { default: null, rendered: false },
  }),
})
const Text = Node.create({ name: 'text', group: 'inline' })

const Paragraph = Node.create({
  name: 'paragraph', group: 'block', content: 'inline*',
  // Alignment comes from the stock TextAlign extension's global `textAlign`
  // attribute (same pattern as the stock marks): no local twin.
  // lineHeight stays a local paragraph attribute per the canonical model
  // (Word-style block spacing, 0.5–10) and renders as an inline style.
  // Pasted `style` never reaches here — the clipboard sanitizer strips style
  // attributes first — so no parse rule is needed.
  addAttributes: () => ({ ...nodeIdAttribute, lineHeight: { default: null } }),
  parseHTML: () => [{ tag: 'p' }],
  renderHTML: ({ node, HTMLAttributes }) => {
    const rest = { ...(HTMLAttributes as Record<string, unknown>) }
    // Never leak the raw attribute into HTML; it only ever renders as style.
    delete rest.lineHeight
    const lineHeight = node.attrs.lineHeight as unknown
    const style = typeof lineHeight === 'number' && Number.isFinite(lineHeight) && lineHeight >= 0.5 && lineHeight <= 10
      ? { style: `line-height: ${lineHeight}` }
      : {}
    return ['p', mergeAttributes(rest, style), 0]
  },
})

const Heading = Node.create({
  name: 'heading', group: 'block', content: 'inline*', defining: true,
  addAttributes: () => ({ ...nodeIdAttribute, level: { default: 1 } }),
  parseHTML: () => [1, 2, 3, 4, 5, 6].map((level) => ({ tag: `h${level}`, attrs: { level } })),
  renderHTML: ({ node, HTMLAttributes }) => [`h${Math.min(6, Math.max(1, Number(node.attrs.level)))}`, HTMLAttributes, 0],
})

/**
 * Stock Tiptap nodes. Each is extended only with the canonical `id`
 * attribute (stable IDs are a canonical-model requirement) and, where our
 * checklist shares the same HTML tags, a parse guard. No behavioral fork:
 * content expressions, commands, and keymaps stay Tiptap's.
 */
const StockBlockquote = Blockquote.extend({
  addAttributes() {
    return { ...this.parent?.(), ...nodeIdAttribute }
  },
})

const StockBulletList = BulletList.extend({
  addAttributes() {
    return { ...this.parent?.(), ...nodeIdAttribute }
  },
  parseHTML() {
    return [{ tag: 'ul:not([data-type="checklist"])' }]
  },
})

const StockOrderedList = OrderedList.extend({
  addAttributes() {
    return { ...this.parent?.(), ...nodeIdAttribute }
  },
})

const StockListItem = ListItem.extend({
  addAttributes() {
    return { ...this.parent?.(), ...nodeIdAttribute }
  },
  parseHTML() {
    return [{ tag: 'li:not([data-type="checklist-item"])' }]
  },
})

const StockBlockMath = TiptapBlockMath.extend({
  addInputRules() {
    return []
  },
  addAttributes() {
    return {
      ...this.parent?.(),
      ...nodeIdAttribute,
      numbered: {
        default: false,
        parseHTML: (element: HTMLElement) => element.hasAttribute('data-numbered'),
        renderHTML: ({ numbered }: Record<string, unknown>) => numbered ? { 'data-numbered': '' } : {},
      },
      label: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-label'),
        renderHTML: ({ label }: Record<string, unknown>) => label ? { 'data-label': String(label) } : {},
      },
    }
  },
})

/**
 * Stock inline math. Auto-conversion input rules are disabled on purpose:
 * `$20 and $30` must never become math uninvited. Conversion stays an
 * explicit user action via the bubble toolbar detector.
 */
const StockInlineMath = InlineMath.extend({
  addInputRules() {
    return []
  },
})

const Checklist = Node.create({
  name: 'checklist', group: 'block', content: 'checklistItem+',
  addAttributes: () => nodeIdAttribute,
  parseHTML: () => [{ tag: 'ul[data-type="checklist"]' }],
  renderHTML: ({ HTMLAttributes }) => ['ul', mergeAttributes(HTMLAttributes, { 'data-type': 'checklist' }), 0],
})

const ChecklistItem = Node.create({
  name: 'checklistItem', content: 'block+', defining: true,
  addAttributes: () => ({ ...nodeIdAttribute, checked: { default: false } }),
  parseHTML: () => [{ tag: 'li[data-type="checklist-item"]', getAttrs: (element) => ({ checked: (element as HTMLElement).dataset.checked === 'true' }) }],
  renderHTML: ({ node, HTMLAttributes }) => ['li', mergeAttributes(HTMLAttributes, { 'data-type': 'checklist-item', 'data-checked': String(node.attrs.checked === true) }), 0],
})

const HorizontalRule = leaf('horizontalRule', 'hr')

/**
 * Syntax-highlighted code. The canonical model already persists `language`;
 * lowlight only changes the Tiptap-side rendering via decorations, so no
 * canonical or migration change is required for highlighting.
 */
const HighlightedCodeBlock = CodeBlockLowlight.extend({
  addAttributes() {
    return { ...this.parent?.(), ...nodeIdAttribute }
  },
}).configure({ lowlight: incantlyLowlight })

const IncantlyDetails = Details.extend({
  addAttributes() {
    return { ...this.parent?.(), ...nodeIdAttribute }
  },
}).configure({
  persist: true,
  // The package ships a labelless toggle; render a chevron so the control
  // is visible, keeping the package's accessible label behavior.
  renderToggleButton: ({ element, isOpen }) => {
    element.setAttribute('aria-label', isOpen ? 'Collapse details content' : 'Expand details content')
    element.textContent = isOpen ? '▾' : '▸'
  },
})

/** TipTap's table node view supplies the resize and handle-control host. */
const Table = TiptapTable.extend({
  addAttributes() {
    return { ...this.parent?.(), ...nodeIdAttribute, caption: { default: null } }
  },
}).configure({ resizable: true })

const TableRow = Node.create({
  name: 'tableRow', content: '(tableHeaderCell|tableCell)+',
  addAttributes: () => nodeIdAttribute,
  parseHTML: () => [{ tag: 'tr' }],
  renderHTML: ({ HTMLAttributes }) => ['tr', HTMLAttributes, 0],
})

const cell = (name: 'tableHeaderCell' | 'tableCell', tag: 'th' | 'td') => Node.create({
  name, content: 'block+', isolating: true,
  addAttributes: () => ({ ...nodeIdAttribute, colspan: { default: 1 }, rowspan: { default: 1 }, alignment: { default: null } }),
  parseHTML: () => [{ tag }],
  renderHTML: ({ HTMLAttributes }) => [tag, HTMLAttributes, 0],
})

/**
 * Image asset card, broken out of the shared leaf helper so it can carry
 * alignment. The canonical model owns `alignment` (left/center/right);
 * the editor renders it as `data-align`, following the official
 * ImageAlignButton convention. Parse accepts our own output only.
 */
const Image = Node.create({
  name: 'image',
  group: 'block',
  atom: true,
  selectable: true,
  addAttributes: () => ({
    ...nodeIdAttribute,
    assetId: { default: null }, alt: { default: null }, caption: { default: null },
    width: { default: null }, height: { default: null }, display: { default: 'block' },
    alignment: { default: null },
  }),
  parseHTML: () => [{
    tag: 'figure[data-incantly-node="image"]',
    getAttrs: (element) => {
      const alignment = (element as HTMLElement).dataset.align
      return alignment === 'left' || alignment === 'center' || alignment === 'right' ? { alignment } : {}
    },
  }],
  renderHTML: ({ node, HTMLAttributes }) => {
    const rest = { ...(HTMLAttributes as Record<string, unknown>) }
    delete rest.alignment
    const alignment = node.attrs.alignment as unknown
    return ['figure', mergeAttributes(rest, {
      'data-incantly-node': 'image',
      'data-card-label': 'Image',
      contenteditable: 'false',
      ...(alignment === 'left' || alignment === 'center' || alignment === 'right'
        ? { 'data-align': String(alignment) }
        : {}),
    })]
  },
})
const FileAttachment = leaf('fileAttachment', 'aside', {
  assetId: { default: null }, filename: { default: null }, mimeType: { default: null }, display: { default: 'card' },
})
const Audio = leaf('audio', 'figure', {
  assetId: { default: null }, title: { default: null }, caption: { default: null },
})
const VideoEmbed = leaf('videoEmbed', 'figure', {
  provider: { default: 'youtube' }, videoId: { default: null }, title: { default: null }, caption: { default: null },
})
const PdfEmbed = leaf('pdfEmbed', 'figure', {
  assetId: { default: null }, page: { default: null }, display: { default: 'card' }, extractedDocumentId: { default: null },
})
const CanvasEmbed = leaf('canvasEmbed', 'figure', {
  canvasId: { default: null }, previewAssetId: { default: null }, caption: { default: null }, display: { default: 'card' },
})
const PageBreak = leaf('pageBreak', 'div')

/** Explicit v1 node schema. Container expressions intentionally mirror core's nesting rules. */
export const incantlyDocumentNodes: Extensions = [
  Document, Text, Paragraph, Heading, StockBlockquote, StockBulletList, StockOrderedList, StockListItem,
  Checklist, ChecklistItem, HorizontalRule, HighlightedCodeBlock, IncantlyDetails, DetailsSummary, DetailsContent, StockBlockMath, StockInlineMath, Table, TableRow,
  cell('tableHeaderCell', 'th'), cell('tableCell', 'td'), Image, FileAttachment,
  Audio, VideoEmbed, PdfEmbed, CanvasEmbed, PageBreak,
]

/** ProseMirror table utilities require these schema roles; they are behavior, not persisted attributes. */
export const IncantlyTableSchemaRoles = Node.create({
  name: 'incantlyTableSchemaRoles',
  extendNodeSchema(extension) {
    const tableRoles: Record<string, string> = {
      table: 'table',
      tableRow: 'row',
      tableHeaderCell: 'header_cell',
      tableCell: 'cell',
    }
    return tableRoles[extension.name] ? { tableRole: tableRoles[extension.name] } : {}
  },
})

export const INCANTLY_NODE_ID_TYPES = new Set([
  'paragraph', 'heading', 'blockquote', 'bulletList', 'orderedList', 'listItem',
  'checklist', 'checklistItem', 'horizontalRule', 'details', 'codeBlock', 'blockMath', 'table',
  'tableRow', 'tableHeaderCell', 'tableCell', 'image', 'fileAttachment', 'audio',
  'videoEmbed', 'pdfEmbed', 'canvasEmbed', 'pageBreak',
])
