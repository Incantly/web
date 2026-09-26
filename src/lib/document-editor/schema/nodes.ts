import { Node, mergeAttributes, type Extensions } from '@tiptap/core'

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
  addAttributes: () => ({ ...nodeIdAttribute, alignment: { default: null }, lineHeight: { default: null } }),
  parseHTML: () => [{ tag: 'p' }],
  renderHTML: ({ HTMLAttributes }) => ['p', HTMLAttributes, 0],
})

const Heading = Node.create({
  name: 'heading', group: 'block', content: 'inline*', defining: true,
  addAttributes: () => ({ ...nodeIdAttribute, level: { default: 1 }, alignment: { default: null } }),
  parseHTML: () => [1, 2, 3, 4, 5, 6].map((level) => ({ tag: `h${level}`, attrs: { level } })),
  renderHTML: ({ node, HTMLAttributes }) => [`h${Math.min(6, Math.max(1, Number(node.attrs.level)))}`, HTMLAttributes, 0],
})

const Blockquote = Node.create({
  name: 'blockquote', group: 'block', content: 'block+', defining: true,
  addAttributes: () => nodeIdAttribute,
  parseHTML: () => [{ tag: 'blockquote' }],
  renderHTML: ({ HTMLAttributes }) => ['blockquote', HTMLAttributes, 0],
})

const BulletList = Node.create({
  name: 'bulletList', group: 'block', content: 'listItem+',
  addAttributes: () => nodeIdAttribute,
  parseHTML: () => [{ tag: 'ul:not([data-type="checklist"])' }],
  renderHTML: ({ HTMLAttributes }) => ['ul', HTMLAttributes, 0],
})

const OrderedList = Node.create({
  name: 'orderedList', group: 'block', content: 'listItem+',
  addAttributes: () => ({ ...nodeIdAttribute, start: { default: 1 } }),
  parseHTML: () => [{ tag: 'ol', getAttrs: (element) => ({ start: Number((element as HTMLOListElement).getAttribute('start') ?? 1) }) }],
  renderHTML: ({ node, HTMLAttributes }) => ['ol', mergeAttributes(HTMLAttributes, node.attrs.start === 1 ? {} : { start: node.attrs.start }), 0],
})

const ListItem = Node.create({
  name: 'listItem', content: 'block+', defining: true,
  addAttributes: () => nodeIdAttribute,
  parseHTML: () => [{ tag: 'li:not([data-type="checklist-item"])' }],
  renderHTML: ({ HTMLAttributes }) => ['li', HTMLAttributes, 0],
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

const CodeBlock = Node.create({
  name: 'codeBlock', group: 'block', content: 'text*', marks: '', code: true, defining: true,
  addAttributes: () => ({ ...nodeIdAttribute, language: { default: null } }),
  parseHTML: () => [{ tag: 'pre', preserveWhitespace: 'full' }],
  renderHTML: ({ HTMLAttributes }) => ['pre', HTMLAttributes, ['code', {}, 0]],
})

const MathBlock = leaf('mathBlock', 'div', {
  latex: { default: '' }, numbered: { default: false }, label: { default: null },
})

const Table = Node.create({
  name: 'table', group: 'block', content: 'tableRow+', isolating: true,
  addAttributes: () => ({ ...nodeIdAttribute, caption: { default: null } }),
  parseHTML: () => [{ tag: 'table' }],
  renderHTML: ({ HTMLAttributes }) => ['table', HTMLAttributes, ['tbody', {}, 0]],
})

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

const Image = leaf('image', 'figure', {
  assetId: { default: null }, alt: { default: null }, caption: { default: null },
  width: { default: null }, height: { default: null }, display: { default: 'block' },
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
  Document, Text, Paragraph, Heading, Blockquote, BulletList, OrderedList, ListItem,
  Checklist, ChecklistItem, HorizontalRule, CodeBlock, MathBlock, Table, TableRow,
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
  'checklist', 'checklistItem', 'horizontalRule', 'codeBlock', 'mathBlock', 'table',
  'tableRow', 'tableHeaderCell', 'tableCell', 'image', 'fileAttachment', 'audio',
  'videoEmbed', 'pdfEmbed', 'canvasEmbed', 'pageBreak',
])
