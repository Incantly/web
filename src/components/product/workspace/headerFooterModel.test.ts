import { describe, expect, it } from 'vitest'
import { DEFAULT_PAGE_SETUP, setDifferentFirstPage, setDifferentOddEven, setHeaderFooter, type DocumentMetadata, type PageLayout } from '@incantly/canvas-core/document'
import { activeVariant, headerFooterPresets, layoutOf, numberStyleOf, previewPages, variantTabs, withNumberStyle } from './headerFooterModel'

const metadata = (layout?: PageLayout, startingPageNumber?: number): DocumentMetadata => ({
  title: 'Photosynthesis',
  language: 'en',
  authors: [],
  tags: [],
  pageSetup: { ...DEFAULT_PAGE_SETUP, margins: { ...DEFAULT_PAGE_SETUP.margins }, ...(startingPageNumber ? { startingPageNumber } : {}) },
  ...(layout ? { layout } : {}),
})
const preset = (kind: 'header' | 'footer', id: string) => headerFooterPresets[kind].find((item) => item.id === id)!.content()

describe('variantTabs', () => {
  it('offers one tab by default, and first/odd/even when switched on', () => {
    expect(variantTabs({ differentFirstPage: false, differentOddEven: false }).map((tab) => tab.label)).toEqual(['All pages'])
    expect(variantTabs({ differentFirstPage: true, differentOddEven: false }).map((tab) => tab.id)).toEqual(['first', 'default'])
    expect(variantTabs({ differentFirstPage: true, differentOddEven: true }).map((tab) => tab.id)).toEqual(['first', 'odd', 'even'])
  })
  it('falls back to the first tab when the selected one disappears', () => {
    expect(activeVariant('first', variantTabs({ differentFirstPage: false, differentOddEven: false }))).toBe('default')
  })
})

describe('previewPages', () => {
  it('shows nothing for a note without headers or footers', () => {
    expect(previewPages(metadata(), 2, '2026-11-02')).toEqual([{ page: 1, header: '', footer: '' }, { page: 2, header: '', footer: '' }])
  })

  it('prints "Page X of Y" and the title, with a blank first page', () => {
    let layout = layoutOf(metadata())
    const section = layout.defaultSection.id
    layout = setHeaderFooter(layout, section, 'footer', 'default', preset('footer', 'page-of'))
    layout = setHeaderFooter(layout, section, 'header', 'default', preset('header', 'title'))
    layout = setDifferentFirstPage(layout, section, true)
    const pages = previewPages(metadata(layout), 3, '2026-11-02')
    expect(pages[0]).toEqual({ page: 1, header: '', footer: '' })
    expect(pages[1]).toEqual({ page: 2, header: 'Photosynthesis', footer: 'Page 2 of 3' })
  })

  it('numbers from the starting page and picks odd/even by the printed number', () => {
    let layout = layoutOf(metadata())
    const section = layout.defaultSection.id
    layout = setDifferentOddEven(layout, section, true)
    layout = setHeaderFooter(layout, section, 'footer', 'odd', preset('footer', 'number'))
    layout = setHeaderFooter(layout, section, 'footer', 'even', preset('footer', 'none'))
    expect(previewPages(metadata(layout, 5), 2, '2026-11-02').map((page) => page.footer)).toEqual(['5', ''])
  })
})

describe('number style', () => {
  it('restyles every page number and count, and reads the style back', () => {
    let layout = layoutOf(metadata())
    layout = setHeaderFooter(layout, layout.defaultSection.id, 'footer', 'default', preset('footer', 'page-of'))
    expect(numberStyleOf(layout)).toBe('decimal')
    const roman = withNumberStyle(layout, 'lower-roman')
    expect(numberStyleOf(roman)).toBe('lower-roman')
    expect(previewPages(metadata(roman), 3, '2026-11-02')[2].footer).toBe('Page iii of iii')
    expect(numberStyleOf(withNumberStyle(roman, 'decimal'))).toBe('decimal')
  })
})
