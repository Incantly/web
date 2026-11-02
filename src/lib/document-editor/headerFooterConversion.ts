import { createDocumentNodeId, documentNodeId, normalizeHeaderFooterContent, type HeaderFooterContent, type HeaderFooterFieldType, type HeaderFooterParagraphNode, type TextAlignment, type TextMark } from '@incantly/canvas-core/document'
import type { JSONContent } from '@tiptap/core'

/**
 * Header/footer content (canonical `HeaderFooterParagraphNode[]`, one paragraph per line, with
 * inline page fields) to and from the small header/footer editor's ProseMirror JSON. Only what a
 * header can hold survives: text with bold, italic and underline, hard breaks, and fields. The
 * older top-level-field form is converted by the SDK's normalizer first.
 */

export const FIELD_NODE = 'headerFooterField'

const KEPT_MARKS = new Set(['bold', 'italic', 'underline'])
const ALIGNMENTS = new Set<TextAlignment>(['left', 'center', 'right', 'justify'])

export function headerFooterToProseMirror(content: readonly HeaderFooterContent[] | undefined): JSONContent {
  const { content: paragraphs } = normalizeHeaderFooterContent(content ?? [])
  const blocks: JSONContent[] = paragraphs.map((paragraph) => ({
    type: 'paragraph',
    attrs: { id: paragraph.id, alignment: paragraph.attrs?.alignment ?? null },
    content: paragraph.content.flatMap((inline): JSONContent[] => {
      if (inline.type === 'field') return [{ type: FIELD_NODE, attrs: { field: inline.field, format: inline.format ?? null } }]
      if (inline.type === 'hardBreak') return [{ type: 'hardBreak' }]
      if (inline.type !== 'text' || !inline.text) return []
      const marks = (inline.marks ?? []).filter((mark) => KEPT_MARKS.has(mark.type)).map((mark) => ({ type: mark.type }))
      return [{ type: 'text', text: inline.text, ...(marks.length ? { marks } : {}) }]
    }),
  }))
  return { type: 'doc', content: blocks.length ? blocks : [{ type: 'paragraph', attrs: { id: null, alignment: null } }] }
}

const FIELD_TYPES = new Set<HeaderFooterFieldType>(['pageNumber', 'pageCount', 'documentTitle', 'currentDate'])

/** Editor JSON back to canonical paragraphs. Empty lines at the end are dropped; an all-empty editor is `[]`. */
export function proseMirrorToHeaderFooter(json: JSONContent): HeaderFooterParagraphNode[] {
  const paragraphs = (json.content ?? []).filter((block) => block.type === 'paragraph').map((block): HeaderFooterParagraphNode => {
    const alignment = block.attrs?.alignment as TextAlignment | null | undefined
    const id = typeof block.attrs?.id === 'string' && block.attrs.id ? documentNodeId(block.attrs.id) : createDocumentNodeId()
    const content = (block.content ?? []).flatMap((inline): HeaderFooterParagraphNode['content'] => {
      if (inline.type === FIELD_NODE) {
        const field = inline.attrs?.field as HeaderFooterFieldType
        if (!FIELD_TYPES.has(field)) return []
        const format = typeof inline.attrs?.format === 'string' && inline.attrs.format ? inline.attrs.format : undefined
        return [{ type: 'field', field, ...(format ? { format } : {}) }]
      }
      if (inline.type === 'hardBreak') return [{ type: 'hardBreak' }]
      if (inline.type !== 'text' || !inline.text) return []
      const marks = (inline.marks ?? []).filter((mark) => KEPT_MARKS.has(mark.type)).map((mark) => ({ type: mark.type }) as TextMark)
      return [{ type: 'text', text: inline.text, ...(marks.length ? { marks } : {}) }]
    })
    return { id, type: 'paragraph', ...(alignment && ALIGNMENTS.has(alignment) ? { attrs: { alignment } } : {}), content }
  })
  while (paragraphs.length && !paragraphs.at(-1)!.content.length) paragraphs.pop()
  return paragraphs
}
