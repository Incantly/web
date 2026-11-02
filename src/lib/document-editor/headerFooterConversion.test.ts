import { describe, expect, it } from 'vitest'
import type { HeaderFooterContent } from '@incantly/canvas-core/document'
import { FIELD_NODE, headerFooterToProseMirror, proseMirrorToHeaderFooter } from './headerFooterConversion'

const pageOfTotal = [{
  id: 'node:footer-1', type: 'paragraph', attrs: { alignment: 'center' },
  content: [{ type: 'text', text: 'Page ' }, { type: 'field', field: 'pageNumber' }, { type: 'text', text: ' of ' }, { type: 'field', field: 'pageCount', format: 'lower-roman' }],
}] as unknown as HeaderFooterContent[]

describe('header/footer conversion', () => {
  it('round-trips a centred "Page X of Y" line with its fields and id', () => {
    const json = headerFooterToProseMirror(pageOfTotal)
    expect(json.content?.[0]).toMatchObject({ type: 'paragraph', attrs: { id: 'node:footer-1', alignment: 'center' } })
    expect(json.content?.[0].content?.map((node) => node.type)).toEqual(['text', FIELD_NODE, 'text', FIELD_NODE])
    expect(proseMirrorToHeaderFooter(json)).toEqual(pageOfTotal)
  })

  it('keeps bold, italic and underline and drops marks a header can’t hold', () => {
    const json = { type: 'doc', content: [{ type: 'paragraph', attrs: { id: 'node:h', alignment: null }, content: [{ type: 'text', text: 'Draft', marks: [{ type: 'bold' }, { type: 'link', attrs: { href: 'https://x.y' } }] }] }] }
    expect(proseMirrorToHeaderFooter(json)).toEqual([{ id: 'node:h', type: 'paragraph', content: [{ type: 'text', text: 'Draft', marks: [{ type: 'bold' }] }] }])
  })

  it('gives new lines an id, drops trailing empty lines and unknown fields', () => {
    const json = { type: 'doc', content: [
      { type: 'paragraph', attrs: { id: null, alignment: 'right' }, content: [{ type: FIELD_NODE, attrs: { field: 'documentTitle', format: null } }, { type: FIELD_NODE, attrs: { field: 'wordCount' } }] },
      { type: 'paragraph', attrs: { id: null, alignment: null } },
    ] }
    const [line, ...rest] = proseMirrorToHeaderFooter(json)
    expect(rest).toEqual([])
    expect(line.id).toMatch(/\S/)
    expect(line).toMatchObject({ type: 'paragraph', attrs: { alignment: 'right' }, content: [{ type: 'field', field: 'documentTitle' }] })
  })

  it('treats an empty editor as no content, and no content as one empty line', () => {
    expect(proseMirrorToHeaderFooter({ type: 'doc', content: [{ type: 'paragraph', attrs: { id: null } }] })).toEqual([])
    expect(headerFooterToProseMirror(undefined).content).toHaveLength(1)
  })

  it('reads the older form with fields between paragraphs as one line', () => {
    const old = [
      { id: 'node:a', type: 'paragraph', content: [{ type: 'text', text: 'Page ' }] },
      { type: 'field', field: 'pageNumber' },
    ] as unknown as HeaderFooterContent[]
    const json = headerFooterToProseMirror(old)
    expect(json.content).toHaveLength(1)
    expect(json.content?.[0].content?.map((node) => node.type)).toEqual(['text', FIELD_NODE])
  })
})
