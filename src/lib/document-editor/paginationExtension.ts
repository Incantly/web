import type { DocumentMetadata, HeaderFooterLine } from '@incantly/canvas-core/document'
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import { headerFooterRowElements, metadataPageSetup, pageHeaderFooterLines, pageMetrics, type PageMetrics } from './pageChrome'

export interface WebPaginationSnapshot { blockCount: number; contentHeight: number; breakPositions: number[]; pageCount: number }
export interface WebPaginationOptions { pageHeight?: number; pageGap?: number; onLayout?: (snapshot: WebPaginationSnapshot) => void }

/** A top-level block's place in the text flow, in px from the top of the first page's text area. */
export interface BlockExtent { top: number; bottom: number }
export interface PagePlan {
  /** For each new page: the block it starts with and the empty space left at the bottom of the page before it. */
  breaks: { index: number; fill: number }[]
  /** Empty space left at the bottom of the last page. */
  trailingFill: number
  pageCount: number
}

/**
 * Splits blocks into pages of `pageHeight`. A block moves to the next page when it would cross the
 * bottom edge, unless it already starts its page (a block taller than a page stays and spills over,
 * since the editor can't split one).
 */
export function planPages(blocks: readonly BlockExtent[], pageHeight: number): PagePlan {
  const breaks: PagePlan['breaks'] = []
  let pageStart = 0
  let pageCount = 1
  let end = 0
  blocks.forEach((block, index) => {
    if (block.bottom > pageStart + pageHeight && block.top > pageStart) {
      breaks.push({ index, fill: Math.max(0, pageStart + pageHeight - block.top) })
      pageStart = block.top
      pageCount += 1
    }
    // An oversized block spans more than one page.
    while (block.bottom > pageStart + pageHeight && block.top <= pageStart) {
      pageStart += pageHeight
      pageCount += 1
    }
    end = Math.max(end, block.bottom)
  })
  return { breaks, trailingFill: Math.max(0, pageStart + pageHeight - end), pageCount }
}

const CHROME = 'incantly-page-chrome'

function lines(kind: 'header' | 'footer', items: HeaderFooterLine[]): HTMLElement {
  const box = document.createElement('div')
  box.className = `${CHROME}__${kind}`
  box.append(...headerFooterRowElements(items))
  return box
}

type Chrome = { fill: number; footer?: HeaderFooterLine[]; header?: HeaderFooterLine[]; gap: boolean }

/** The space between two pages (or before the first / after the last): page bottom, gap, page top. */
function chromeWidget(chrome: Chrome): HTMLElement {
  const element = document.createElement('div')
  element.className = CHROME
  element.contentEditable = 'false'
  element.setAttribute('aria-hidden', 'true')
  if (chrome.footer) {
    const bottom = document.createElement('div')
    bottom.className = `${CHROME}__bottom`
    bottom.style.paddingTop = `${chrome.fill}px`
    bottom.append(lines('footer', chrome.footer))
    element.append(bottom)
  }
  if (chrome.gap) {
    const gap = document.createElement('div')
    gap.className = `${CHROME}__gap`
    element.append(gap)
  }
  if (chrome.header) {
    const top = document.createElement('div')
    top.className = `${CHROME}__top`
    top.append(lines('header', chrome.header))
    element.append(top)
  }
  return element
}

function rootStyle(metrics: PageMetrics): string {
  return [
    `--incantly-page-width:${metrics.width}px`,
    `--incantly-page-height:${metrics.height}px`,
    `--incantly-page-margin-top:${metrics.margins.top}px`,
    `--incantly-page-margin-right:${metrics.margins.right}px`,
    `--incantly-page-margin-bottom:${metrics.margins.bottom}px`,
    `--incantly-page-margin-left:${metrics.margins.left}px`,
    `--incantly-page-header-distance:${metrics.headerDistance}px`,
    `--incantly-page-footer-distance:${metrics.footerDistance}px`,
  ].join(';')
}

/** Where each top-level block sits in the text flow, leaving out the page chrome drawn between them. */
function measureBlocks(view: EditorView): { extents: BlockExtent[]; positions: number[] } {
  const root = view.dom as HTMLElement
  const rootTop = root.getBoundingClientRect().top
  const shiftOf = new Map<Element, number>()
  let shift = 0
  for (const child of Array.from(root.children)) {
    if (child.classList.contains(CHROME)) shift += child.getBoundingClientRect().height
    else shiftOf.set(child, shift)
  }
  const extents: BlockExtent[] = []
  const positions: number[] = []
  view.state.doc.forEach((_node, offset) => {
    const dom = view.nodeDOM(offset)
    if (!(dom instanceof HTMLElement) || dom.parentElement !== root) return
    const rect = dom.getBoundingClientRect()
    const offsetTop = shiftOf.get(dom) ?? 0
    extents.push({ top: rect.top - rootTop - offsetTop, bottom: rect.bottom - rootTop - offsetTop })
    positions.push(offset)
  })
  return { extents, positions }
}

/**
 * Pages mode: draws the note as sheets of its paper size, with the header and footer of each page
 * in the space between sheets. Page breaks are decorations only: they never enter the document.
 * Continuous mode (the default, and notes with no page setup) draws nothing.
 */
export const WebPagination = Extension.create<WebPaginationOptions>({
  name: 'incantlyWebPagination',
  addOptions: () => ({ pageHeight: 1056, pageGap: 24 }),
  addProseMirrorPlugins() {
    const options = this.options
    const key = new PluginKey<DecorationSet>('incantlyWebPagination')
    const paginatedSetup = (metadata: unknown) => {
      const setup = metadataPageSetup(metadata)
      return setup?.mode === 'paginated' ? setup : null
    }
    return [new Plugin<DecorationSet>({
      key,
      state: {
        init: () => DecorationSet.empty,
        apply(transaction, decorations) {
          const replacement = transaction.getMeta(key) as DecorationSet | undefined
          return replacement ?? decorations.map(transaction.mapping, transaction.doc)
        },
      },
      props: {
        decorations: (state) => key.getState(state),
        attributes: (state): Record<string, string> => {
          const setup = paginatedSetup(state.doc.attrs.metadata)
          return setup ? { 'data-page-mode': 'paginated', style: rootStyle(pageMetrics(setup)) } : {}
        },
      },
      view(view) {
        let frame = 0
        let lastKey = ''
        const measure = () => {
          frame = 0
          if (view.isDestroyed) return
          const metadata = view.state.doc.attrs.metadata as DocumentMetadata | null
          const setup = paginatedSetup(metadata)
          const decorations: Decoration[] = []
          let snapshot: WebPaginationSnapshot = { blockCount: 0, contentHeight: (view.dom as HTMLElement).scrollHeight, breakPositions: [], pageCount: 1 }
          if (setup && metadata) {
            const metrics = pageMetrics(setup)
            const { extents, positions } = measureBlocks(view)
            const plan = planPages(extents, metrics.contentHeight)
            const text = (kind: 'header' | 'footer', page: number) => pageHeaderFooterLines(metadata, kind, page, plan.pageCount)
            const widget = (position: number, chrome: Chrome, side: number) => {
              // Whole pixels, so sub-pixel jitter in the measurement doesn't redraw.
              chrome = { ...chrome, fill: Math.round(chrome.fill) }
              decorations.push(Decoration.widget(position, () => chromeWidget(chrome), { side, key: `page:${position}:${side}:${JSON.stringify(chrome)}`, ignoreSelection: true }))
            }
            widget(0, { fill: 0, header: text('header', 0), gap: false }, -1)
            plan.breaks.forEach((pageBreak, index) => widget(positions[pageBreak.index], { fill: pageBreak.fill, footer: text('footer', index), header: text('header', index + 1), gap: true }, -1))
            widget(view.state.doc.content.size, { fill: plan.trailingFill, footer: text('footer', plan.pageCount - 1), gap: false }, 1)
            snapshot = { blockCount: extents.length, contentHeight: snapshot.contentHeight, breakPositions: plan.breaks.map((item) => positions[item.index]), pageCount: plan.pageCount }
          }
          options.onLayout?.(snapshot)
          // The decorations' keys carry everything drawn.
          const nextKey = decorations.map((item) => (item.spec as { key: string }).key).join('|')
          if (nextKey === lastKey) return
          lastKey = nextKey
          view.dispatch(view.state.tr.setMeta(key, DecorationSet.create(view.state.doc, decorations)).setMeta('addToHistory', false))
        }
        const schedule = () => { if (!frame) frame = requestAnimationFrame(measure) }
        schedule()
        document.fonts?.ready.then(schedule)
        const observer = new ResizeObserver(schedule)
        observer.observe(view.dom)
        return { update: schedule, destroy() { if (frame) cancelAnimationFrame(frame); observer.disconnect() } }
      },
    })]
  },
})
