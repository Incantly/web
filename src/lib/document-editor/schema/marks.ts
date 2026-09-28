import { Mark, mergeAttributes, type Extensions } from '@tiptap/core'
import { Color, FontFamily, FontSize, TextStyle } from '@tiptap/extension-text-style'

const Highlight = Mark.create({
  name: 'highlight',
  addAttributes: () => ({ color: { default: null } }),
  parseHTML: () => [{ tag: 'mark[data-incantly-highlight]', getAttrs: (element) => ({ color: (element as HTMLElement).dataset.incantlyHighlight }) }],
  renderHTML: ({ HTMLAttributes }) => ['mark', mergeAttributes(HTMLAttributes, { 'data-incantly-highlight': HTMLAttributes.color, style: `background-color: ${HTMLAttributes.color}` }), 0],
})

const Citation = Mark.create({
  name: 'citation',
  addAttributes: () => ({ citationId: { default: null } }),
  parseHTML: () => [{ tag: 'cite[data-citation-id]', getAttrs: (element) => ({ citationId: (element as HTMLElement).dataset.citationId }) }],
  renderHTML: ({ HTMLAttributes }) => ['cite', mergeAttributes(HTMLAttributes, { 'data-citation-id': HTMLAttributes.citationId }), 0],
})

/**
 * Legacy inline-math mark. The stock InlineMath *node* owns the
 * `inlineMath` name now (ProseMirror forbids a node and a mark sharing one),
 * so this mark is registered under an alias. Canonical `inlineMath` marks in
 * older documents still load and round-trip through it.
 */
const InlineMathMark = Mark.create({
  name: 'inlineMathMark',
  addAttributes: () => ({ latex: { default: null } }),
  parseHTML: () => [{ tag: 'span[data-inline-math]', getAttrs: (element) => ({ latex: (element as HTMLElement).dataset.inlineMath }) }],
  renderHTML: ({ HTMLAttributes }) => ['span', mergeAttributes(HTMLAttributes, { 'data-inline-math': HTMLAttributes.latex }), 0],
})

/**
 * Stock TextStyle + Color replace the former custom `textColor` mark (same
 * pattern as the stock block nodes: no behavioral fork). Canonical
 * `textColor` marks map to the stock `textStyle` mark in conversion.ts; the
 * persisted format is unchanged.
 */
export const incantlyDocumentMarks: Extensions = [TextStyle, Color, FontFamily, FontSize, Highlight, Citation, InlineMathMark]
