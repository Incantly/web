import { Extension } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'

export interface DocumentImportIssue { code: 'removed-element' | 'removed-attribute' | 'unsafe-url'; message: string }
export interface DocumentImportReport { issues: DocumentImportIssue[] }
export interface DocumentClipboardOptions { onImportReport?: (report: DocumentImportReport) => void; onFiles?: (files: readonly File[]) => void }

const tags = new Set(['P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'CODE', 'PRE', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'A', 'IMG', 'HR'])
export function sanitizeDocumentHtml(html: string): { html: string; report: DocumentImportReport } {
  const documentValue = new DOMParser().parseFromString(html, 'text/html')
  const issues: DocumentImportIssue[] = []
  for (const element of Array.from(documentValue.body.querySelectorAll('*'))) {
    if (!tags.has(element.tagName)) { issues.push({ code: 'removed-element', message: `Removed ${element.tagName.toLowerCase()}` }); element.replaceWith(...Array.from(element.childNodes)); continue }
    for (const attribute of Array.from(element.attributes)) {
      const allowed = (element.tagName === 'A' && ['href', 'title'].includes(attribute.name)) || (element.tagName === 'IMG' && ['src', 'alt', 'width', 'height'].includes(attribute.name)) || ['colspan', 'rowspan', 'start'].includes(attribute.name)
      if (!allowed) { element.removeAttribute(attribute.name); issues.push({ code: 'removed-attribute', message: `Removed ${attribute.name}` }) }
    }
    for (const name of ['href', 'src']) {
      const value = element.getAttribute(name)
      if (value && !/^(?:https?:|mailto:|tel:|data:image\/)/i.test(value)) { element.removeAttribute(name); issues.push({ code: 'unsafe-url', message: `Removed unsafe ${name}` }) }
    }
  }
  return { html: documentValue.body.innerHTML, report: { issues } }
}

export const DocumentClipboard = Extension.create<DocumentClipboardOptions>({
  name: 'incantlyDocumentClipboard',
  addOptions: () => ({}),
  addProseMirrorPlugins() { return [new Plugin({ props: { transformPastedHTML: (html) => { const result = sanitizeDocumentHtml(html); this.options.onImportReport?.(result.report); return result.html } } })] },
  addStorage() { return {} },
  addKeyboardShortcuts() { return {} },
  onCreate() {
    const view = this.editor.view
    const paste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files ?? [])
      if (files.length) this.options.onFiles?.(files)
    }
    const drop = (event: DragEvent) => {
      const files = Array.from(event.dataTransfer?.files ?? [])
      if (files.length) this.options.onFiles?.(files)
    }
    view.dom.addEventListener('paste', paste)
    view.dom.addEventListener('drop', drop)
    ;(this.storage as { cleanup?: () => void }).cleanup = () => { view.dom.removeEventListener('paste', paste); view.dom.removeEventListener('drop', drop) }
  },
  onDestroy() { (this.storage as { cleanup?: () => void }).cleanup?.() },
})
