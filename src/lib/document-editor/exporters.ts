import { documentToHtml, exportMarkdown, exportText, serializeIncantlyDocument, type ExportResult, type IncantlyDocument } from '@incantly/canvas-core/document'

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

export interface PagedPreviewResult { totalPages: number }

async function loadPagedJs(): Promise<typeof import('pagedjs')> {
  try {
    return await import('pagedjs')
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`PDF export needs the optional peer dependency "pagedjs" to be installed by the host application. (${reason})`)
  }
}

/**
 * Render the document's paginated print preview into a visible element using
 * the sanitized HTML export and an isolated Paged.js renderer. The caller owns
 * the element: clear it before re-rendering a changed document.
 */
export async function renderPagedPreview(target: HTMLElement, documentValue: IncantlyDocument): Promise<PagedPreviewResult> {
  const { Previewer } = await loadPagedJs()
  const html = documentToHtml(documentValue)
  target.replaceChildren()
  const flow = await new Previewer().preview(html, [], target)
  return { totalPages: flow.total }
}

/**
 * Render the print preview off-screen and open the system print dialog so the
 * user can save as PDF. Never runs over the live editor tree.
 */
export async function printDocumentPdf(documentValue: IncantlyDocument): Promise<PagedPreviewResult> {
  const frame = document.createElement('iframe')
  // Paged.js measures real layout, so the isolated renderer must stay in the
  // render tree. `hidden` (display:none) yields null rects; park it off-screen.
  frame.setAttribute('aria-hidden', 'true')
  frame.tabIndex = -1
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:1000px;height:100%;border:0;'
  frame.srcdoc = documentToHtml(documentValue)
  document.body.append(frame)
  try {
    await new Promise<void>((resolve) => frame.addEventListener('load', () => resolve(), { once: true }))
    const frameDocument = frame.contentDocument
    if (!frameDocument) throw new Error('Print preview could not be created')
    await frameDocument.fonts?.ready
    await Promise.all(Array.from(frameDocument.images).map((image) => image.complete ? undefined : new Promise<void>((resolve) => { image.onload = image.onerror = () => resolve() })))
    const target = frameDocument.createElement('div')
    frameDocument.body.replaceChildren(target)
    const result = await renderPagedPreview(target, documentValue)
    frame.contentWindow?.print()
    return result
  } finally {
    frame.remove()
  }
}
export async function exportDocumentWeb(documentValue: IncantlyDocument, format: WebExportFormat): Promise<ExportResult> {
  if (format === 'txt') return exportText(documentValue)
  if (format === 'md') return exportMarkdown(documentValue, { includeMetadata: true })
  if (format === 'inc') return { format: 'inc', filename: safeName(documentValue.metadata.title, 'inc'), mimeType: 'application/vnd.incantly.document+json', output: { kind: 'text', text: serializeIncantlyDocument(documentValue, { space: 2 }) }, warnings: [] }
  if (format === 'html') return { format: 'html', filename: safeName(documentValue.metadata.title, 'html'), mimeType: 'text/html;charset=utf-8', output: { kind: 'text', text: documentToHtml(documentValue) }, warnings: [] }
  if (format === 'pdf') {
    // Side-effect free: the host renders the visual preview with
    // renderPagedPreview and opens the system dialog with printDocumentPdf.
    return { format: 'pdf', filename: safeName(documentValue.metadata.title, 'pdf'), mimeType: 'application/pdf', output: { kind: 'bytes', bytes: new Uint8Array() }, warnings: [{ code: 'system-print', message: 'Preview the paginated pages, then use Print / Save as PDF in the system print dialog.' }] }
  }
  let docxApi: typeof import('docx')
  try {
    docxApi = await import('docx')
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`DOCX export needs the optional peer dependency "docx" to be installed by the host application. (${reason})`)
  }
  const { Document, HeadingLevel, Packer, PageBreak, Paragraph, TextRun, Table, TableCell, TableRow } = docxApi
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
  const setup = documentValue.metadata.pageSetup
  const docx = new Document({ numbering: { config: [{ reference: 'incantly-numbering', levels: [{ level: 0, format: 'decimal', text: '%1.', alignment: 'left' }] }] }, sections: [{ properties: { page: { margin: setup.margins, size: setup.size === 'custom' ? { width: setup.width, height: setup.height, orientation: setup.orientation } : { orientation: setup.orientation } } }, children }] })
  const blob = await Packer.toBlob(docx)
  return { format: 'docx', filename: safeName(documentValue.metadata.title, 'docx'), mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', output: { kind: 'bytes', bytes: new Uint8Array(await blob.arrayBuffer()) }, warnings: [] }
}
