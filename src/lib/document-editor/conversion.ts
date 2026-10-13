import type { JSONContent } from '@tiptap/core'
import { fontSizeToCss, fontStackForKey, matchFontFamilyKey, parseFontSizeToPt } from './schema/fonts'
import {
  createDocument,
  createDocumentNodeId,
  recoverDocument,
  type DocumentNode,
  type IncantlyDocument,
  type InlineNode,
  type TextMark,
} from '@incantly/core/document'

export type DocumentAdapterIssueCode =
  | 'unsupported_node'
  | 'unsupported_mark'
  | 'invalid_content'
  | 'repaired_content'

export interface DocumentAdapterIssue {
  code: DocumentAdapterIssueCode
  path: string
  message: string
  action: 'omitted' | 'repaired' | 'defaulted'
}

export interface DocumentAdapterReport {
  issues: DocumentAdapterIssue[]
  repaired: boolean
  unsupported: boolean
}

export interface DocumentAdapterResult<T> {
  value: T
  report: DocumentAdapterReport
}

export interface ProseMirrorToIncantlyOptions {
  /** Supplies envelope fields when the ProseMirror document did not originate in Incantly. */
  fallbackDocument?: IncantlyDocument
}

type JsonRecord = Record<string, unknown>

const record = (value: unknown): JsonRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
const children = (node: JSONContent): JSONContent[] => Array.isArray(node.content) ? node.content : []
const attrs = (node: JSONContent): JsonRecord => record(node.attrs)
const compact = <T extends JsonRecord>(value: T): T => Object.fromEntries(
  Object.entries(value).filter(([, item]) => item !== undefined && item !== null),
) as T
const optionalAttrs = (value: JsonRecord): { attrs?: JsonRecord } =>
  Object.keys(value).length ? { attrs: value } : {}

function report(issues: DocumentAdapterIssue[]): DocumentAdapterReport {
  return {
    issues,
    repaired: issues.some((issue) => issue.action === 'repaired' || issue.action === 'defaulted'),
    unsupported: issues.some((issue) => issue.code === 'unsupported_node' || issue.code === 'unsupported_mark'),
  }
}

type ProseMirrorMark = NonNullable<JSONContent['marks']>[number]

function markToProseMirror(mark: TextMark): ProseMirrorMark {
  switch (mark.type) {
    case 'bold': case 'italic': case 'underline': case 'strike': case 'code': return { type: mark.type }
    case 'link': return { type: 'link', attrs: compact({ href: mark.href, title: mark.title }) }
    // Canonical textColor is edited through the stock textStyle mark (Color
    // extension); the persisted format is unchanged.
    case 'textColor': return { type: 'textStyle', attrs: compact({ color: mark.color }) }
    case 'fontFamily': return { type: 'textStyle', attrs: compact({ fontFamily: fontStackForKey(mark.family) }) }
    case 'fontSize': return { type: 'textStyle', attrs: compact({ fontSize: fontSizeToCss(mark.size) }) }
    case 'highlight': return { type: mark.type, attrs: { color: mark.color } }
    case 'citation': return { type: 'citation', attrs: { citationId: mark.citationId } }
    case 'inlineMath': return { type: 'inlineMathMark', attrs: { latex: mark.latex } }
  }
}

function inlineToProseMirror(node: InlineNode): JSONContent {
  if (node.type === 'hardBreak') return { type: 'hardBreak' }
  if (node.type === 'inlineMath') return { type: 'inlineMath', attrs: { latex: node.latex } }
  const mapped = (node.marks ?? []).map(markToProseMirror)
  // One textStyle mark can carry both color and family: merge duplicates so
  // the editor holds a single mark per run.
  const merged: ProseMirrorMark[] = []
  const styleAttrs: Record<string, unknown> = {}
  for (const mark of mapped) {
    if (mark.type === 'textStyle') Object.assign(styleAttrs, mark.attrs)
    else merged.push(mark)
  }
  if (Object.keys(styleAttrs).length) merged.push({ type: 'textStyle', attrs: styleAttrs })
  return {
    type: 'text',
    text: node.text,
    ...(merged.length ? { marks: merged } : {}),
  }
}

function nodeToProseMirror(node: DocumentNode, path: string, issues: DocumentAdapterIssue[]): JSONContent | null {
  const base = { type: node.type, attrs: { id: node.id } } satisfies JSONContent
  switch (node.type) {
    case 'paragraph':
      // Canonical `alignment` is edited through stock TextAlign's global
      // `textAlign` attribute; the persisted format is unchanged.
      return { ...base, attrs: compact({ id: node.id, textAlign: node.attrs?.alignment, lineHeight: node.attrs?.lineHeight }), content: node.content.map(inlineToProseMirror) }
    case 'heading':
      return { ...base, attrs: compact({ id: node.id, level: node.attrs.level, textAlign: node.attrs.alignment }), content: node.content.map(inlineToProseMirror) }
    case 'blockquote': {
      const content = nodesToProseMirror(node.content, `${path}.content`, issues)
      return { ...base, content }
    }
    case 'listItem': case 'checklistItem': case 'tableHeaderCell': case 'tableCell': {
      const content = nodesToProseMirror(node.content, `${path}.content`, issues)
      if (node.type === 'listItem' && content[0]?.type !== 'paragraph') {
        // Stock ListItem requires paragraph-first content; repair instead of
        // dropping the item so no canonical document can fail the schema.
        content.unshift({ type: 'paragraph', attrs: { id: createDocumentNodeId() }, content: [] })
        issues.push({ code: 'repaired_content', path: `${path}.content`, message: 'Prepended a paragraph to a list item', action: 'repaired' })
      }
      return { ...base, attrs: compact({ id: node.id, ...('attrs' in node ? node.attrs : {}) }), content }
    }
    case 'bulletList': case 'orderedList': case 'checklist': case 'table': case 'tableRow': {
      const content = nodesToProseMirror(node.content, `${path}.content`, issues)
      return { ...base, attrs: compact({ id: node.id, ...('attrs' in node ? node.attrs : {}) }), content }
    }
    case 'codeBlock':
      return { ...base, attrs: compact({ id: node.id, language: node.attrs?.language }), content: node.text ? [{ type: 'text', text: node.text }] : [] }
    case 'details': {
      const summary = node.attrs?.summary ?? ''
      return {
        ...base,
        attrs: compact({ id: node.id, open: node.attrs?.open === true ? true : undefined }),
        content: [
          { type: 'detailsSummary', content: summary ? [{ type: 'text', text: summary }] : [] },
          { type: 'detailsContent', content: nodesToProseMirror(node.content, `${path}.content`, issues) },
        ],
      }
    }
    case 'horizontalRule': case 'pageBreak':
      return base
    case 'mathBlock':
      return {
        type: 'blockMath',
        attrs: compact({ id: node.id, latex: node.attrs?.latex ?? '', numbered: node.attrs?.numbered === true ? true : undefined, label: node.attrs?.label }),
      }
    case 'image': case 'fileAttachment': case 'audio': case 'videoEmbed': case 'pdfEmbed': case 'canvasEmbed':
      return { ...base, attrs: compact({ id: node.id, ...node.attrs }) }
    default:
      issues.push({ code: 'unsupported_node', path, message: `Unsupported Incantly node "${String((node as { type?: unknown }).type)}"`, action: 'omitted' })
      return null
  }
}

function nodesToProseMirror(nodes: readonly DocumentNode[], path: string, issues: DocumentAdapterIssue[]): JSONContent[] {
  return nodes.flatMap((node, index) => {
    const converted = nodeToProseMirror(node, `${path}[${index}]`, issues)
    return converted ? [converted] : []
  })
}

export function incantlyDocumentToProseMirror(document: IncantlyDocument): DocumentAdapterResult<JSONContent> {
  const issues: DocumentAdapterIssue[] = []
  const content = nodesToProseMirror(document.content, '$.content', issues)
  if (!content.length) {
    content.push({ type: 'paragraph', attrs: { id: createDocumentNodeId() }, content: [] })
    issues.push({ code: 'repaired_content', path: '$.content', message: 'Inserted the required empty paragraph', action: 'defaulted' })
  }
  return {
    value: {
      type: 'doc',
      attrs: {
        schemaVersion: document.schemaVersion,
        documentId: document.id,
        metadata: document.metadata,
        createdAt: document.createdAt,
        updatedAt: document.updatedAt,
      },
      content,
    },
    report: report(issues),
  }
}

function markFromProseMirror(mark: JSONContent, path: string, issues: DocumentAdapterIssue[]): unknown[] {
  const value = attrs(mark)
  switch (mark.type) {
    case 'bold': case 'italic': case 'underline': case 'strike': case 'code': return [{ type: mark.type }]
    case 'link': return [compact({ type: 'link', href: value.href, title: value.title })]
    case 'textStyle': {
      const marks: unknown[] = []
      const color = typeof value.color === 'string' ? value.color.trim() : ''
      if (color) marks.push({ type: 'textColor', color })
      // ProseMirror holds full CSS stacks; storage holds short keys.
      // Unknown families are omitted (same silent rule as bare textStyle).
      const family = typeof value.fontFamily === 'string' ? matchFontFamilyKey(value.fontFamily) : null
      if (family) marks.push({ type: 'fontFamily', family })
      const size = typeof value.fontSize === 'string' ? parseFontSizeToPt(value.fontSize) : null
      if (size !== null) marks.push({ type: 'fontSize', size })
      // A bare textStyle is an empty styling span (stock prunes these via
      // removeEmptyTextStyle); omit it without an adapter issue.
      return marks
    }
    // Legacy editor mark name; anything still carrying it loads as canonical
    // textColor exactly like the stock mark above.
    case 'textColor': {
      const color = typeof value.color === 'string' ? value.color.trim() : ''
      return color ? [{ type: 'textColor', color }] : []
    }
    case 'highlight': return [{ type: mark.type, color: value.color }]
    case 'citation': return [{ type: 'citation', citationId: value.citationId }]
    case 'inlineMathMark': return [{ type: 'inlineMath', latex: value.latex }]
    default:
      issues.push({ code: 'unsupported_mark', path, message: `Unsupported ProseMirror mark "${String(mark.type)}"`, action: 'omitted' })
      return []
  }
}

function inlineFromProseMirror(node: JSONContent, path: string, issues: DocumentAdapterIssue[]): unknown | null {
  if (node.type === 'hardBreak') return { type: 'hardBreak' }
  if (node.type === 'inlineMath') {
    return typeof attrs(node).latex === 'string' && attrs(node).latex
      ? { type: 'inlineMath', latex: attrs(node).latex }
      : null
  }
  if (node.type !== 'text' || typeof node.text !== 'string') {
    issues.push({ code: 'unsupported_node', path, message: `Unsupported inline node "${String(node.type)}"`, action: 'omitted' })
    return null
  }
  const marks = (node.marks ?? []).flatMap((mark, index) => markFromProseMirror(mark, `${path}.marks[${index}]`, issues))
  return { type: 'text', text: node.text, ...(marks.length ? { marks } : {}) }
}

function nodeFromProseMirror(node: JSONContent, path: string, issues: DocumentAdapterIssue[]): unknown | null {
  const value = attrs(node)
  const id = value.id
  const blockContent = () => children(node).flatMap((child, index) => {
    const converted = nodeFromProseMirror(child, `${path}.content[${index}]`, issues)
    return converted ? [converted] : []
  })
  const inlineContent = () => children(node).flatMap((child, index) => {
    const converted = inlineFromProseMirror(child, `${path}.content[${index}]`, issues)
    return converted ? [converted] : []
  })
  switch (node.type) {
    // Stock TextAlign stores `textAlign`; the legacy `alignment` key is still
    // accepted so older in-flight content loads instead of dropping alignment.
    case 'paragraph': return { id, type: 'paragraph', ...optionalAttrs(compact({ alignment: value.textAlign ?? value.alignment, lineHeight: value.lineHeight })), content: inlineContent() }
    case 'heading': return { id, type: 'heading', attrs: compact({ level: value.level, alignment: value.textAlign ?? value.alignment }), content: inlineContent() }
    case 'blockquote': case 'listItem': return { id, type: node.type, content: blockContent() }
    case 'bulletList': case 'checklist': case 'tableRow': return { id, type: node.type, content: blockContent() }
    case 'table': return { id, type: 'table', ...optionalAttrs(compact({ caption: value.caption })), content: blockContent() }
    case 'orderedList': return { id, type: 'orderedList', ...optionalAttrs(compact({ start: value.start === 1 ? undefined : value.start })), content: blockContent() }
    case 'checklistItem': return { id, type: 'checklistItem', attrs: { checked: value.checked === true }, content: blockContent() }
    case 'tableHeaderCell': case 'tableCell': return {
      id,
      type: node.type,
      ...optionalAttrs(compact({
        colspan: value.colspan === 1 ? undefined : value.colspan,
        rowspan: value.rowspan === 1 ? undefined : value.rowspan,
        alignment: value.alignment,
      })),
      content: blockContent(),
    }
    case 'horizontalRule': case 'pageBreak': return { id, type: node.type }
    case 'codeBlock': return { id, type: 'codeBlock', ...optionalAttrs(compact({ language: value.language })), text: children(node).map((child) => typeof child.text === 'string' ? child.text : '').join('') }
    case 'details': {
      const summaryNode = children(node).find((child) => child.type === 'detailsSummary')
      const contentNode = children(node).find((child) => child.type === 'detailsContent')
      const summary = summaryNode ? children(summaryNode).map((child) => typeof child.text === 'string' ? child.text : '').join('') : ''
      const content = contentNode ? children(contentNode).flatMap((child, index) => {
        const converted = nodeFromProseMirror(child, `${path}.content[${index}]`, issues)
        return converted ? [converted] : []
      }) : []
      return { id, type: 'details', attrs: { summary, ...(value.open === true ? { open: true } : {}) }, content }
    }
    case 'blockMath': return {
      id,
      type: 'mathBlock',
      attrs: compact({ latex: typeof value.latex === 'string' ? value.latex : '', numbered: value.numbered === true ? true : undefined, label: typeof value.label === 'string' ? value.label : undefined }),
    }
    case 'image': return { id, type: 'image', attrs: compact({ assetId: value.assetId, alt: value.alt, caption: value.caption, width: value.width, height: value.height, display: value.display, alignment: value.alignment }) }
    case 'fileAttachment': return { id, type: 'fileAttachment', attrs: compact({ assetId: value.assetId, filename: value.filename, mimeType: value.mimeType, display: value.display }) }
    case 'audio': return { id, type: 'audio', attrs: compact({ assetId: value.assetId, title: value.title, caption: value.caption }) }
    case 'videoEmbed': return { id, type: 'videoEmbed', attrs: compact({ provider: value.provider, videoId: value.videoId, title: value.title, caption: value.caption }) }
    case 'pdfEmbed': return { id, type: 'pdfEmbed', attrs: compact({ assetId: value.assetId, page: value.page, display: value.display, extractedDocumentId: value.extractedDocumentId }) }
    case 'canvasEmbed': return { id, type: 'canvasEmbed', attrs: compact({ canvasId: value.canvasId, previewAssetId: value.previewAssetId, caption: value.caption, display: value.display }) }
    default:
      issues.push({ code: 'unsupported_node', path, message: `Unsupported ProseMirror node "${String(node.type)}"`, action: 'omitted' })
      return null
  }
}

export function proseMirrorToIncantlyDocument(
  proseMirror: JSONContent,
  options: ProseMirrorToIncantlyOptions = {},
): DocumentAdapterResult<IncantlyDocument> {
  const issues: DocumentAdapterIssue[] = []
  const envelope = attrs(proseMirror)
  const fallback = options.fallbackDocument ?? createDocument()
  const content = children(proseMirror).flatMap((node, index) => {
    const converted = nodeFromProseMirror(node, `$.content[${index}]`, issues)
    return converted ? [converted] : []
  })
  const candidate = {
    schemaVersion: envelope.schemaVersion ?? fallback.schemaVersion,
    id: envelope.documentId ?? fallback.id,
    type: 'document',
    metadata: record(envelope.metadata).title ? envelope.metadata : fallback.metadata,
    content,
    createdAt: envelope.createdAt ?? fallback.createdAt,
    updatedAt: envelope.updatedAt ?? fallback.updatedAt,
  }
  const recovered = recoverDocument(candidate)
  for (const issue of recovered.issues) {
    issues.push({ code: 'repaired_content', path: issue.path, message: issue.message, action: 'repaired' })
  }
  for (const unsupported of recovered.unsupportedContent) {
    issues.push({
      code: 'unsupported_node',
      path: unsupported.path,
      message: `Canonical recovery ${unsupported.action.replaceAll('_', ' ')}`,
      action: unsupported.action === 'omitted' ? 'omitted' : 'repaired',
    })
  }
  return { value: recovered.document, report: report(issues) }
}
