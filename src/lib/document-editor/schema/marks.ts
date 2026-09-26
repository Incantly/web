import { Mark, mergeAttributes, type Extensions } from '@tiptap/core'

const TextColor = Mark.create({
  name: 'textColor',
  addAttributes: () => ({ color: { default: null } }),
  parseHTML: () => [{ tag: 'span[data-incantly-text-color]', getAttrs: (element) => ({ color: (element as HTMLElement).dataset.incantlyTextColor }) }],
  renderHTML: ({ HTMLAttributes }) => ['span', mergeAttributes(HTMLAttributes, { 'data-incantly-text-color': HTMLAttributes.color, style: `color: ${HTMLAttributes.color}` }), 0],
})

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

const InlineMath = Mark.create({
  name: 'inlineMath',
  addAttributes: () => ({ latex: { default: null } }),
  parseHTML: () => [{ tag: 'span[data-inline-math]', getAttrs: (element) => ({ latex: (element as HTMLElement).dataset.inlineMath }) }],
  renderHTML: ({ HTMLAttributes }) => ['span', mergeAttributes(HTMLAttributes, { 'data-inline-math': HTMLAttributes.latex }), 0],
})

/** Marks not supplied by the deliberately restricted StarterKit configuration. */
export const incantlyDocumentMarks: Extensions = [TextColor, Highlight, Citation, InlineMath]
