import {
  contentRegion, headerFooterDocumentTitle, headerFooterFor, headerFooterLines, normalizePageSetup,
  type DocumentMetadata, type HeaderFooterKind, type HeaderFooterLine, type IncantlyDocument, type PageSetup,
} from '@incantly/canvas-core/document'
import { POINTS_TO_CSS_PX, resolvePageDimensionsInPx } from './components/DocumentPageView'

/** One page's size and margins in CSS px, for drawing pages in the editor and in print previews. */
export interface PageMetrics {
  width: number
  height: number
  /** Height of the text area: page height minus top and bottom margins. */
  contentHeight: number
  margins: { top: number; right: number; bottom: number; left: number }
  headerDistance: number
  footerDistance: number
}

export function pageMetrics(setup: PageSetup): PageMetrics {
  const normalized = normalizePageSetup(setup)
  const { widthPx, heightPx } = resolvePageDimensionsInPx(normalized)
  const px = (points: number) => points * POINTS_TO_CSS_PX
  let contentHeight: number
  try {
    contentHeight = px(contentRegion(normalized).height)
  } catch {
    contentHeight = heightPx - px(normalized.margins.top + normalized.margins.bottom)
  }
  return {
    width: widthPx,
    height: heightPx,
    contentHeight,
    margins: { top: px(normalized.margins.top), right: px(normalized.margins.right), bottom: px(normalized.margins.bottom), left: px(normalized.margins.left) },
    headerDistance: px(normalized.headerDistance ?? 36),
    footerDistance: px(normalized.footerDistance ?? 36),
  }
}

/** The page setup a note's metadata holds, or null when it has none (an older or foreign note). */
export function metadataPageSetup(metadata: unknown): PageSetup | null {
  const setup = (metadata as { pageSetup?: PageSetup } | null | undefined)?.pageSetup
  return setup && typeof setup === 'object' ? setup : null
}

/** True when the note has at least one header or footer with something in it. */
export function hasHeaderFooter(metadata: DocumentMetadata | null | undefined): boolean {
  const section = metadata?.layout?.defaultSection
  if (!section) return false
  return [section.headers, section.footers].some((variants) => Object.values(variants ?? {}).some((content) => Array.isArray(content) && content.length > 0))
}

/**
 * The header or footer lines printed on one page, with fields filled in, using the SDK's rules for
 * the first page, odd and even pages, the starting page number and number styles. `pageIndex` is
 * 0-based; `pageCount` is left out while it isn't known yet.
 */
export function pageHeaderFooterLines(metadata: DocumentMetadata, kind: HeaderFooterKind, pageIndex: number, pageCount: number | undefined, date = new Date().toLocaleDateString('en-CA')): HeaderFooterLine[] {
  const section = metadata.layout?.defaultSection
  if (!section) return []
  const start = metadata.pageSetup?.startingPageNumber ?? 1
  const printedPageNumber = start + pageIndex
  const { content } = headerFooterFor(section, { kind, pageIndexInSection: pageIndex, printedPageNumber })
  if (!content.length) return []
  const documentTitle = headerFooterDocumentTitle({ metadata } as IncantlyDocument) || 'Untitled note'
  return headerFooterLines(content, { pageNumber: printedPageNumber, pageCount, documentTitle, date })
    .lines.filter((line) => line.text.trim().length > 0)
}

export type HeaderFooterRow = { left?: string; center?: string; right?: string }
const slotOrder = { left: 0, center: 1, right: 2 } as const

/**
 * Lays lines out like a Word header: lines in a row that go left, then center, then right share
 * one row ("Title" on the left, the date on the right); anything else starts a new row.
 */
export function headerFooterRows(lines: readonly HeaderFooterLine[]): HeaderFooterRow[] {
  const rows: HeaderFooterRow[] = []
  let last = -1
  for (const line of lines) {
    const slot = line.alignment === 'center' || line.alignment === 'right' ? line.alignment : 'left'
    if (!rows.length || slotOrder[slot] <= last) rows.push({})
    rows[rows.length - 1][slot] = line.text
    last = slotOrder[slot]
  }
  return rows
}

/** Draws header/footer rows: three columns (left, center, right), like Word's tab stops. */
export function headerFooterRowElements(lines: readonly HeaderFooterLine[]): HTMLElement[] {
  return headerFooterRows(lines).map((row) => {
    const element = document.createElement('div')
    element.style.cssText = 'display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);column-gap:1em;'
    for (const slot of ['left', 'center', 'right'] as const) {
      const cell = document.createElement('span')
      cell.style.textAlign = slot
      cell.style.overflowWrap = 'anywhere'
      cell.textContent = row[slot] ?? ''
      element.append(cell)
    }
    return element
  })
}
