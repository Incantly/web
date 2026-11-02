import {
  createDocumentNodeId, createPageLayout, headerFooterFor, headerFooterOptions, headerFooterPlainText,
  type DocumentMetadata, type HeaderFooterContent, type HeaderFooterFieldType, type HeaderFooterKind, type HeaderFooterParagraphNode, type HeaderFooterVariant, type PageLayout, type TextAlignment,
} from '@incantly/canvas-core/document'

/** The note's layout, or a fresh one-section layout from its page setup when it has none yet. */
export function layoutOf(metadata: DocumentMetadata): PageLayout {
  return metadata.layout ?? createPageLayout(metadata.pageSetup)
}

/** Which header/footer versions the user edits, given the two Word-style switches. */
export function variantTabs(options: { differentFirstPage: boolean; differentOddEven: boolean }): { id: HeaderFooterVariant; label: string }[] {
  const tabs: { id: HeaderFooterVariant; label: string }[] = []
  if (options.differentFirstPage) tabs.push({ id: 'first', label: 'First page' })
  if (options.differentOddEven) tabs.push({ id: 'odd', label: 'Odd pages' }, { id: 'even', label: 'Even pages' })
  else tabs.push({ id: 'default', label: options.differentFirstPage ? 'Other pages' : 'All pages' })
  return tabs
}

/** A tab that no longer exists after a switch changes falls back to the first one. */
export function activeVariant(selected: HeaderFooterVariant, tabs: { id: HeaderFooterVariant }[]): HeaderFooterVariant {
  return tabs.some((tab) => tab.id === selected) ? selected : tabs[0].id
}

type Piece = string | HeaderFooterFieldType
const FIELDS = new Set<string>(['pageNumber', 'pageCount', 'documentTitle', 'currentDate'])

function line(alignment: TextAlignment, ...pieces: Piece[]): HeaderFooterParagraphNode {
  return {
    id: createDocumentNodeId(),
    type: 'paragraph',
    ...(alignment === 'left' ? {} : { attrs: { alignment } }),
    content: pieces.map((piece) => (FIELDS.has(piece) ? { type: 'field' as const, field: piece as HeaderFooterFieldType } : { type: 'text' as const, text: piece })),
  }
}

/** Ready-made headers and footers, like Word's gallery. */
export const headerFooterPresets: Record<HeaderFooterKind, { id: string; label: string; content: () => HeaderFooterParagraphNode[] }[]> = {
  header: [
    { id: 'title', label: 'Title', content: () => [line('left', 'documentTitle')] },
    { id: 'title-date', label: 'Title and date', content: () => [line('left', 'documentTitle'), line('right', 'currentDate')] },
    { id: 'none', label: 'None', content: () => [] },
  ],
  footer: [
    { id: 'page', label: 'Page 1', content: () => [line('center', 'Page ', 'pageNumber')] },
    { id: 'page-of', label: 'Page 1 of 10', content: () => [line('center', 'Page ', 'pageNumber', ' of ', 'pageCount')] },
    { id: 'number', label: '1', content: () => [line('right', 'pageNumber')] },
    { id: 'none', label: 'None', content: () => [] },
  ],
}

export type NumberStyle = 'decimal' | 'lower-roman' | 'upper-roman'
export const numberStyles: { value: NumberStyle; label: string }[] = [
  { value: 'decimal', label: '1, 2, 3' },
  { value: 'lower-roman', label: 'i, ii, iii' },
  { value: 'upper-roman', label: 'I, II, III' },
]

function eachContent(layout: PageLayout, visit: (content: readonly HeaderFooterContent[]) => readonly HeaderFooterContent[]): PageLayout {
  const section = layout.defaultSection
  const map = (variants: typeof section.headers) => variants && Object.fromEntries(Object.entries(variants).map(([variant, content]) => [variant, content && visit(content)]))
  return { ...layout, defaultSection: { ...section, ...(section.headers ? { headers: map(section.headers) } : {}), ...(section.footers ? { footers: map(section.footers) } : {}) } }
}

const isNumberField = (field: HeaderFooterFieldType) => field === 'pageNumber' || field === 'pageCount'

/** The number style the page fields use (the first one found), decimal when there are none. */
export function numberStyleOf(layout: PageLayout): NumberStyle {
  let found: NumberStyle | null = null
  eachContent(layout, (content) => {
    for (const item of content) {
      const fields = item.type === 'field' ? [item] : item.content.filter((inline) => inline.type === 'field')
      for (const field of fields) if (!found && field.type === 'field' && isNumberField(field.field)) found = (field.format as NumberStyle | undefined) ?? 'decimal'
    }
    return content
  })
  return found ?? 'decimal'
}

/** Every page number and page count in every header and footer, set to one style. */
export function withNumberStyle(layout: PageLayout, style: NumberStyle): PageLayout {
  const restyle = <T extends { type: string; field?: HeaderFooterFieldType; format?: string }>(node: T): T => {
    if (node.type !== 'field' || !node.field || !isNumberField(node.field)) return node
    const rest = { ...node }
    delete rest.format
    return (style === 'decimal' ? rest : { ...rest, format: style }) as T
  }
  return eachContent(layout, (content) => content.map((item) => (item.type === 'field' ? restyle(item) : { ...item, content: item.content.map(restyle) })))
}

export type PagePreview = { page: number; header: string; footer: string }

/**
 * What the first `pages` pages print, for the panel's preview. The page count is the preview's
 * own page count, since the real one is only known once the note is laid out.
 */
export function previewPages(metadata: DocumentMetadata, pages = 3, date = new Date().toLocaleDateString('en-CA')): PagePreview[] {
  const layout = layoutOf(metadata)
  const start = metadata.pageSetup.startingPageNumber ?? 1
  const context = (pageNumber: number) => ({ pageNumber, pageCount: start + pages - 1, documentTitle: metadata.title || 'Untitled note', date })
  return Array.from({ length: pages }, (_, index) => {
    const printedPageNumber = start + index
    const text = (kind: HeaderFooterKind) => headerFooterPlainText(headerFooterFor(layout.defaultSection, { kind, pageIndexInSection: index, printedPageNumber }).content, context(printedPageNumber)).text
    return { page: printedPageNumber, header: text('header'), footer: text('footer') }
  })
}

export function layoutOptions(layout: PageLayout) {
  return headerFooterOptions(layout.defaultSection)
}
