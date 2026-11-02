import {
  PAGE_PRESETS, documentToHtml, exportMarkdown, exportText, formatHeaderFooterField, headerFooterDocumentTitle, normalizeHeaderFooterContent, normalizePageSetup, serializeIncantlyDocument,
  type ExportResult, type HeaderFooterLine, type HeaderFooterParagraphNode, type IncantlyDocument, type PageHeaderFooterVariants,
} from '@incantly/canvas-core/document'
import { planPages } from './paginationExtension'
import { headerFooterRowElements, pageHeaderFooterLines, pageMetrics, type PageMetrics } from './pageChrome'

export type WebExportFormat = 'inc' | 'txt' | 'md' | 'html' | 'pdf' | 'docx'

const safeName = (value: string, extension: string): string =>
  `${value.trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').slice(0, 120) || 'document'}.${extension}`

export function downloadExport(result: ExportResult): void {
  const body = result.output.kind === 'text' ? result.output.text : result.output.bytes
  const blob = new Blob([body as BlobPart], { type: result.mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = result.filename
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

export interface PagedPreviewResult {
  totalPages: number
  /** Removes the styles the renderer added to the page. Call it when the preview goes away. */
  cleanup: () => void
}

export interface WebExportOptions {
  /** Print the note's headers and footers (PDF and Word). Defaults to true. */
  headerFooter?: boolean
}

/**
 * The export HTML split into its stylesheet and body. The `@page` rule (with the SDK's default
 * title and "page / pages" boxes) is left out: print pages are laid out here, with the note's own
 * headers and footers.
 */
export function printableHtml(documentValue: IncantlyDocument): { css: string; body: string } {
  const parsed = new DOMParser().parseFromString(documentToHtml(documentValue), 'text/html')
  const css = Array.from(parsed.querySelectorAll('style')).map((style) => style.textContent ?? '').join('\n')
    .replace(/@page\{[^{}]*(\{[^{}]*\}[^{}]*)*\}/g, '')
    .replace(/h1\{string-set:[^}]*\}/g, '')
  return { css, body: parsed.body.innerHTML }
}

function chromeBox(lines: HeaderFooterLine[], edge: 'top' | 'bottom', metrics: PageMetrics): HTMLElement {
  const box = document.createElement('div')
  box.className = `incantly-print-chrome incantly-print-chrome--${edge}`
  box.style.cssText = `position:absolute;left:${metrics.margins.left}px;right:${metrics.margins.right}px;${edge}:${edge === 'top' ? metrics.headerDistance : metrics.footerDistance}px;font:10pt/1.4 Inter,ui-sans-serif,system-ui,sans-serif;color:#5b6068;`
  box.append(...headerFooterRowElements(lines))
  return box
}

/**
 * Lay the document out as print pages inside a visible element: the sanitized HTML export is
 * measured at the page's text width, split into pages by the same rule as the editor's Pages view
 * (`planPages`), and each page gets its header and footer by the SDK's first/odd/even rules. The
 * caller owns the element; `printPagedPreview` prints it.
 */
export async function renderPagedPreview(target: HTMLElement, documentValue: IncantlyDocument, options: WebExportOptions = {}): Promise<PagedPreviewResult> {
  const { css, body } = printableHtml(documentValue)
  const metrics = pageMetrics(documentValue.metadata.pageSetup)
  const textWidth = metrics.width - metrics.margins.left - metrics.margins.right
  const style = document.createElement('style')
  style.textContent = css
  const measure = document.createElement('div')
  measure.innerHTML = body
  const flow = measure.querySelector<HTMLElement>('.incantly-document') ?? measure
  flow.style.cssText = `width:${textWidth}px;display:flow-root;`
  measure.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden;'
  target.replaceChildren(style, measure)
  await document.fonts?.ready
  await Promise.all(Array.from(flow.querySelectorAll('img')).map((image) => image.complete ? undefined : new Promise<void>((resolve) => { image.onload = image.onerror = () => resolve() })))

  const blocks = Array.from(flow.children) as HTMLElement[]
  const origin = flow.getBoundingClientRect().top
  const extents = blocks.map((block) => {
    const rect = block.getBoundingClientRect()
    return { top: rect.top - origin, bottom: rect.bottom - origin }
  })
  const plan = planPages(extents, metrics.contentHeight)
  const starts = [0, ...plan.breaks.map((item) => item.index), blocks.length]
  const date = new Date().toLocaleDateString('en-CA')
  const pages = Array.from({ length: starts.length - 1 }, (_, index) => {
    const page = document.createElement('section')
    page.className = 'incantly-print-page'
    page.setAttribute('aria-label', `Page ${index + 1}`)
    page.style.cssText = `position:relative;box-sizing:border-box;width:${Math.floor(metrics.width)}px;height:${Math.floor(metrics.height) - 1}px;padding:${metrics.margins.top}px ${metrics.margins.right}px ${metrics.margins.bottom}px ${metrics.margins.left}px;overflow:hidden;background:#fff;`
    const content = document.createElement('div')
    content.className = 'incantly-document'
    content.style.cssText = 'display:flow-root;'
    const own = blocks.slice(starts[index], starts[index + 1])
    // A page's first block starts at the top of its text area, as in the editor.
    if (own[0]) own[0].style.marginTop = '0'
    content.append(...own)
    page.append(content)
    if (options.headerFooter !== false) {
      const header = pageHeaderFooterLines(documentValue.metadata, 'header', index, starts.length - 1, date)
      const footer = pageHeaderFooterLines(documentValue.metadata, 'footer', index, starts.length - 1, date)
      if (header.length) page.append(chromeBox(header, 'top', metrics))
      if (footer.length) page.append(chromeBox(footer, 'bottom', metrics))
    }
    return page
  })
  const sheet = document.createElement('div')
  sheet.className = 'incantly-print-pages'
  // The paper itself keeps its exact size; each sheet is drawn a pixel inside it, so rounding in
  // any browser's print engine never spills a sheet onto a blank extra page.
  sheet.dataset.pageWidth = String(metrics.width)
  sheet.dataset.pageHeight = String(metrics.height)
  sheet.append(...pages)
  target.replaceChildren(style, sheet)
  return { totalPages: pages.length, cleanup: () => target.replaceChildren() }
}

/**
 * Open the system print dialog for a rendered preview, so the user can save it as a PDF. Only the
 * preview's pages print, each on its own sheet of the note's paper size: the element moves to the
 * end of <body> while the dialog is open.
 */
export function printPagedPreview(target: HTMLElement): void {
  const sheet = target.querySelector<HTMLElement>('.incantly-print-pages')
  if (!sheet) return
  const parent = target.parentNode
  const next = target.nextSibling
  const root = document.createElement('div')
  root.className = 'incantly-print-root'
  const page = document.createElement('style')
  page.textContent = `@page{size:${sheet.dataset.pageWidth}px ${sheet.dataset.pageHeight}px;margin:0}`
  document.head.append(page)
  document.body.append(root)
  root.append(target)
  document.documentElement.classList.add('incantly-printing')
  let restored = false
  const restore = () => {
    if (restored) return
    restored = true
    window.removeEventListener('afterprint', restore)
    window.removeEventListener('pointerdown', restore, true)
    window.removeEventListener('keydown', restore, true)
    document.documentElement.classList.remove('incantly-printing')
    parent?.insertBefore(target, next)
    root.remove()
    page.remove()
  }
  // Chrome and Firefox return from print() once the dialog closes; Safari may return while its
  // print sheet is still reading the page. Restore on `afterprint`, or on the next click or key
  // press should a browser never send it.
  window.addEventListener('afterprint', restore)
  try {
    window.print()
  } catch {
    restore()
    return
  }
  if (restored) return
  window.addEventListener('pointerdown', restore, true)
  window.addEventListener('keydown', restore, true)
}

export async function exportDocumentWeb(documentValue: IncantlyDocument, format: WebExportFormat, options: WebExportOptions = {}): Promise<ExportResult> {
  if (format === 'txt') return exportText(documentValue)
  if (format === 'md') return exportMarkdown(documentValue, { includeMetadata: true })
  if (format === 'inc') return { format: 'inc', filename: safeName(documentValue.metadata.title, 'inc'), mimeType: 'application/vnd.incantly.document+json', output: { kind: 'text', text: serializeIncantlyDocument(documentValue, { space: 2 }) }, warnings: [] }
  if (format === 'html') return { format: 'html', filename: safeName(documentValue.metadata.title, 'html'), mimeType: 'text/html;charset=utf-8', output: { kind: 'text', text: documentToHtml(documentValue) }, warnings: [] }
  if (format === 'pdf') {
    // Side-effect free: the host lays out the pages with renderPagedPreview
    // and opens the system print dialog with printPagedPreview.
    return { format: 'pdf', filename: safeName(documentValue.metadata.title, 'pdf'), mimeType: 'application/pdf', output: { kind: 'bytes', bytes: new Uint8Array() }, warnings: [{ code: 'system-print', message: 'Preview the paginated pages, then use Print / Save as PDF in the system print dialog.' }] }
  }
  let docxApi: typeof import('docx')
  try {
    docxApi = await import('docx')
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`DOCX export needs the optional peer dependency "docx" to be installed by the host application. (${reason})`)
  }
  const { AlignmentType, Document, Footer, Header, HeadingLevel, NumberFormat, Packer, PageBreak, PageNumber, Paragraph, TextRun, Table, TableCell, TableRow } = docxApi
  const textRuns = (content: Extract<IncantlyDocument['content'][number], { type: 'paragraph' | 'heading' }>['content']) => content.map((item) => {
    if (item.type === 'inlineMath') return new TextRun({ text: `$${item.latex}$` })
    if (item.type !== 'text') return new TextRun({ break: 1 })
    const marks = new Set(item.marks?.map((mark) => mark.type))
    return new TextRun({ text: item.text, bold: marks.has('bold'), italics: marks.has('italic'), strike: marks.has('strike') })
  })
  const renderNodes = (nodes: IncantlyDocument['content'], depth = 0): InstanceType<typeof Paragraph>[] | Array<InstanceType<typeof Paragraph> | InstanceType<typeof Table>> => nodes.flatMap((node) => {
    if (node.type === 'pageBreak') return [new Paragraph({ children: [new PageBreak()] })]
    if (node.type === 'codeBlock') return [new Paragraph({ children: [new TextRun({ text: node.text, font: 'Courier New' })] })]
    if (node.type === 'heading') return [new Paragraph({ heading: HeadingLevel[`HEADING_${node.attrs.level}` as keyof typeof HeadingLevel], children: textRuns(node.content) })]
    if (node.type === 'paragraph') return [new Paragraph({ children: textRuns(node.content) })]
    if (node.type === 'bulletList' || node.type === 'orderedList') return node.content.flatMap((item, index) => [new Paragraph({ text: item.content.map((child) => 'content' in child ? child.content.map((inline) => 'text' in inline ? inline.text : '').join('') : '').join(' '), bullet: node.type === 'bulletList' ? { level: depth } : undefined, numbering: node.type === 'orderedList' ? { reference: 'incantly-numbering', level: depth, instance: index } : undefined })])
    if (node.type === 'checklist') return node.content.map((item) => new Paragraph({ text: `${item.attrs.checked ? '☒' : '☐'} ${item.content.map((child) => 'content' in child ? child.content.map((inline) => 'text' in inline ? inline.text : '').join('') : '').join(' ')}` }))
    if (node.type === 'details') return [new Paragraph({ children: [new TextRun({ text: node.attrs.summary || 'Details', bold: true })] }), ...(renderNodes(node.content, depth + 1) as Array<InstanceType<typeof Paragraph> | InstanceType<typeof Table>>)]
    if (node.type === 'table') return [new Table({ rows: node.content.map((row) => new TableRow({ children: row.content.map((cell) => new TableCell({ children: renderNodes(cell.content) as InstanceType<typeof Paragraph>[] })) })) })]
    if (node.type === 'mathBlock') return [new Paragraph({ text: node.attrs.latex })]
    if (node.type === 'image' || node.type === 'audio' || node.type === 'fileAttachment' || node.type === 'pdfEmbed') return [new Paragraph({ text: `[${node.type}: ${'assetId' in node.attrs ? node.attrs.assetId : ''}]` })]
    if ('content' in node && Array.isArray(node.content)) return renderNodes(node.content as IncantlyDocument['content'], depth + 1)
    return [new Paragraph({ text: `[${node.type}]` })]
  })
  const children = renderNodes(documentValue.content)
  const setup = normalizePageSetup(documentValue.metadata.pageSetup)
  // Word measures in twentieths of a point; sizes are given portrait and turned by `orientation`.
  const twips = (points: number) => Math.round(points * 20)
  const paper = setup.size === 'custom' ? { width: setup.width ?? 612, height: setup.height ?? 792 } : PAGE_PRESETS[setup.size]

  // Headers and footers: Word's default/first/even parts, with live page and page-count fields.
  const section = options.headerFooter === false ? undefined : documentValue.metadata.layout?.defaultSection
  const title = headerFooterDocumentTitle(documentValue)
  const date = new Date().toLocaleDateString('en-CA')
  const alignmentOf = { left: AlignmentType.LEFT, center: AlignmentType.CENTER, right: AlignmentType.RIGHT, justify: AlignmentType.JUSTIFIED }
  let numberFormat: string | undefined
  const chromeParagraphs = (value: unknown) => {
    const lines: HeaderFooterParagraphNode[] = normalizeHeaderFooterContent(value).content
    if (!lines.length) return [new Paragraph({})]
    return lines.map((line) => new Paragraph({
      alignment: alignmentOf[line.attrs?.alignment ?? 'left'],
      children: line.content.map((item) => {
        if (item.type === 'field') {
          if (item.field === 'pageNumber' || item.field === 'pageCount') {
            numberFormat ??= item.format
            return new TextRun({ children: [item.field === 'pageNumber' ? PageNumber.CURRENT : PageNumber.TOTAL_PAGES] })
          }
          return new TextRun({ text: item.field === 'documentTitle' ? title : formatHeaderFooterField(item, { pageNumber: 1, date }).text })
        }
        if (item.type === 'inlineMath') return new TextRun({ text: `$${item.latex}$` })
        if (item.type !== 'text') return new TextRun({ break: 1 })
        const marks = new Set(item.marks?.map((mark) => mark.type))
        return new TextRun({ text: item.text, bold: marks.has('bold'), italics: marks.has('italic'), underline: marks.has('underline') ? {} : undefined, strike: marks.has('strike') })
      }),
    }))
  }
  const parts = <T,>(variants: PageHeaderFooterVariants | undefined, make: (children: InstanceType<typeof Paragraph>[]) => T) => {
    if (!variants) return undefined
    const main = variants.odd ?? variants.default
    const result: { default?: T; first?: T; even?: T } = {}
    if (main) result.default = make(chromeParagraphs(main))
    if (variants.first) result.first = make(chromeParagraphs(variants.first))
    if (variants.even ?? (variants.odd && variants.default)) result.even = make(chromeParagraphs(variants.even ?? variants.default))
    return Object.keys(result).length ? result : undefined
  }
  const headers = parts(section?.headers, (children) => new Header({ children }))
  const footers = parts(section?.footers, (children) => new Footer({ children }))
  const formatType = numberFormat === 'lower-roman' ? NumberFormat.LOWER_ROMAN : numberFormat === 'upper-roman' ? NumberFormat.UPPER_ROMAN : NumberFormat.DECIMAL
  const docx = new Document({
    evenAndOddHeaderAndFooters: Boolean(headers?.even ?? footers?.even),
    numbering: { config: [{ reference: 'incantly-numbering', levels: [{ level: 0, format: 'decimal', text: '%1.', alignment: 'left' }] }] },
    sections: [{
      properties: {
        titlePage: Boolean(headers?.first ?? footers?.first),
        page: {
          size: { width: twips(paper.width), height: twips(paper.height), orientation: setup.orientation === 'landscape' ? 'landscape' : 'portrait' },
          margin: { top: twips(setup.margins.top), right: twips(setup.margins.right), bottom: twips(setup.margins.bottom), left: twips(setup.margins.left), header: twips(setup.headerDistance ?? 36), footer: twips(setup.footerDistance ?? 36) },
          pageNumbers: { start: setup.startingPageNumber ?? 1, formatType },
        },
      },
      headers,
      footers,
      children,
    }],
  })
  const blob = await Packer.toBlob(docx)
  return { format: 'docx', filename: safeName(documentValue.metadata.title, 'docx'), mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', output: { kind: 'bytes', bytes: new Uint8Array(await blob.arrayBuffer()) }, warnings: [] }
}
