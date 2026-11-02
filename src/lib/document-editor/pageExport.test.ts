import { createDocument, createPageLayout, createParagraph, setDifferentFirstPage, setHeaderFooter, type IncantlyDocument } from '@incantly/canvas-core/document'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { headerFooterPresets } from '../../components/product/workspace/headerFooterModel'
import { exportDocumentWeb } from './exporters'
import { hasHeaderFooter, headerFooterRows, pageHeaderFooterLines, pageMetrics } from './pageChrome'
import { planPages } from './paginationExtension'

const preset = (kind: 'header' | 'footer', id: string) => headerFooterPresets[kind].find((item) => item.id === id)!.content()

function researchNote(): IncantlyDocument {
  const base = createDocument({ title: 'Photosynthesis' })
  const pageSetup = { ...base.metadata.pageSetup, mode: 'paginated' as const, size: 'a4' as const }
  let layout = createPageLayout(pageSetup)
  const section = layout.defaultSection.id
  layout = setHeaderFooter(layout, section, 'header', 'default', preset('header', 'title-date'))
  layout = setHeaderFooter(layout, section, 'footer', 'default', preset('footer', 'page-of'))
  return { ...base, metadata: { ...base.metadata, pageSetup, layout }, content: [createParagraph({ text: 'Light reactions happen first.' })] }
}

describe('planPages', () => {
  it('moves a block that crosses the bottom edge to the next page', () => {
    const plan = planPages([{ top: 0, bottom: 400 }, { top: 410, bottom: 900 }, { top: 910, bottom: 1000 }], 800)
    expect(plan.breaks).toEqual([{ index: 1, fill: 390 }])
    expect(plan.pageCount).toBe(2)
    expect(plan.trailingFill).toBe(410 + 800 - 1000)
  })

  it('never breaks before the first block of a page, even one taller than a page', () => {
    const plan = planPages([{ top: 0, bottom: 1700 }, { top: 1710, bottom: 1800 }], 800)
    expect(plan.breaks).toEqual([])
    expect(plan.pageCount).toBe(3)
  })

  it('keeps everything on one page when it fits', () => {
    expect(planPages([], 800)).toEqual({ breaks: [], trailingFill: 800, pageCount: 1 })
  })
})

describe('page chrome', () => {
  it('measures A4 in CSS pixels', () => {
    const metrics = pageMetrics({ ...createDocument().metadata.pageSetup, size: 'a4', orientation: 'portrait' })
    expect(Math.round(metrics.width)).toBe(794)
    expect(Math.round(metrics.height)).toBe(1123)
    expect(Math.round(metrics.contentHeight)).toBe(1123 - 192)
  })

  it('fills page fields for each page', () => {
    const { metadata } = researchNote()
    expect(hasHeaderFooter(metadata)).toBe(true)
    expect(pageHeaderFooterLines(metadata, 'footer', 1, 3).map((line) => line.text)).toEqual(['Page 2 of 3'])
    expect(pageHeaderFooterLines(metadata, 'header', 0, 3, '2026-11-02')).toEqual([
      { alignment: 'left', text: 'Photosynthesis' },
      { alignment: 'right', text: '2026-11-02' },
    ])
  })

  it('leaves a deliberately blank first page empty', () => {
    const note = researchNote()
    const layout = setDifferentFirstPage(note.metadata.layout!, note.metadata.layout!.defaultSection.id, true)
    const metadata = { ...note.metadata, layout }
    expect(pageHeaderFooterLines(metadata, 'footer', 0, 3)).toEqual([])
    expect(pageHeaderFooterLines(metadata, 'footer', 1, 3).map((line) => line.text)).toEqual(['Page 2 of 3'])
  })

  it('puts left, center and right lines on one row, like Word', () => {
    expect(headerFooterRows([
      { alignment: 'left', text: 'Title' },
      { alignment: 'right', text: 'Date' },
      { alignment: 'center', text: 'Draft' },
      { alignment: 'justify', text: 'Note' },
    ])).toEqual([{ left: 'Title', right: 'Date' }, { center: 'Draft' }, { left: 'Note' }])
  })
})

describe('Word export', () => {
  it('keeps A4, margins and headers and footers with live page fields', async () => {
    const result = await exportDocumentWeb(researchNote(), 'docx')
    if (result.output.kind !== 'bytes') throw new Error('expected bytes')
    const zip = await JSZip.loadAsync(result.output.bytes)
    const body = await zip.file('word/document.xml')!.async('string')
    expect(body).toMatch(/<w:pgSz w:w="11906" w:h="16838"/)
    expect(body).toMatch(/<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720"/)
    const parts = Object.keys(zip.files)
    const header = await zip.file(parts.find((name) => /word\/header\d+\.xml/.test(name))!)!.async('string')
    const footer = await zip.file(parts.find((name) => /word\/footer\d+\.xml/.test(name))!)!.async('string')
    expect(header).toContain('Photosynthesis')
    expect(footer).toContain('PAGE')
    expect(footer).toContain('NUMPAGES')
    expect(footer).toContain('w:jc w:val="center"')
  })

  it('leaves headers and footers out when asked', async () => {
    const result = await exportDocumentWeb(researchNote(), 'docx', { headerFooter: false })
    if (result.output.kind !== 'bytes') throw new Error('expected bytes')
    const zip = await JSZip.loadAsync(result.output.bytes)
    expect(Object.keys(zip.files).some((name) => /word\/(header|footer)\d+\.xml/.test(name))).toBe(false)
  })
})
