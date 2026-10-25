import { useState, type HTMLAttributes } from 'react'
import type { ExportResult, IncantlyDocument } from '@incantly/canvas-core/document'
import { downloadExport, exportDocumentWeb, type WebExportFormat } from '../exporters'

export interface DocumentExportMenuProps extends HTMLAttributes<HTMLDivElement> {
  document: IncantlyDocument
  formats?: WebExportFormat[]
  onError?: (error: unknown) => void
  onExport?: (result: ExportResult) => void
  /** Download immediately after export. Hosts building a preview-first flow set this to false and call downloadExport themselves. */
  download?: boolean
}
export function DocumentExportMenu({ document, formats = ['inc', 'txt', 'md', 'html', 'pdf', 'docx'], onError, onExport, download = true, className, ...props }: DocumentExportMenuProps) {
  const [busy, setBusy] = useState<WebExportFormat | null>(null)
  const run = async (format: WebExportFormat) => {
    setBusy(format)
    try { const result = await exportDocumentWeb(document, format); onExport?.(result); if (download && format !== 'pdf') downloadExport(result) }
    catch (error) { onError?.(error) }
    finally { setBusy(null) }
  }
  return <div {...props} className={['incantly-document-export-menu', className].filter(Boolean).join(' ')} role="group" aria-label={props['aria-label'] ?? 'Export document'}>{formats.map((format) => <button key={format} type="button" className="incantly-export-button" data-format={format} disabled={busy !== null} onClick={() => void run(format)}>{busy === format ? 'Exporting…' : format.toUpperCase()}</button>)}</div>
}
