'use client'

import type { DocumentMetadata, IncantlyDocument } from '@incantly/canvas-core/document'
import type { Editor } from '@tiptap/core'
import { useCallback, useEffect, useRef, useState } from 'react'
import { exportFormats, exportSummary, type NoteExportFormat } from '@/components/product/workspace/exportModel'
import { currentPageSetup } from '@/components/product/workspace/pageSetupModel'
import { proseMirrorToIncantlyDocument } from '@/lib/document-editor/conversion'
import { documentMetadata } from '@/lib/document-editor/documentMetadata'
import { downloadExport, exportDocumentWeb, printPagedPreview, renderPagedPreview } from '@/lib/document-editor/exporters'
import { hasHeaderFooter, pageMetrics } from '@/lib/document-editor/pageChrome'

type Preview = { status: 'idle' | 'rendering' | 'ready' | 'error'; pages: number; message?: string }

/**
 * Export for the open note: the format, whether headers and footers print, a page preview for
 * PDF, and the download or print itself. The document comes from the editor at the moment it is
 * needed, so the export always matches what is on screen. No provider (one note at a time).
 */
export function useNoteExport(editor: Editor | null, fallback: IncantlyDocument | null, title: string) {
  const [open, setOpen] = useState(false)
  const [format, setFormat] = useState<NoteExportFormat>('pdf')
  const [headerFooter, setHeaderFooter] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notes, setNotes] = useState<string[]>([])
  // Each opening of the dialog is a new session, so a reopened dialog draws fresh pages.
  const [session, setSession] = useState(0)
  const [preview, setPreview] = useState<Preview & { key: string }>({ key: '', status: 'idle', pages: 0 })
  const [target, setTarget] = useState<HTMLElement | null>(null)
  const [frameWidth, setFrameWidth] = useState(0)
  const [frame, setFrame] = useState<HTMLElement | null>(null)
  const queue = useRef<Promise<void>>(Promise.resolve())
  const metadata: DocumentMetadata | null = open ? documentMetadata(editor) : null
  const hasChrome = hasHeaderFooter(metadata)

  const snapshot = useCallback((): IncantlyDocument | null => {
    if (!editor || editor.isDestroyed) return fallback
    const { value } = proseMirrorToIncantlyDocument(editor.getJSON(), fallback ? { fallbackDocument: fallback } : {})
    const meta = documentMetadata(editor) ?? value.metadata
    return { ...value, metadata: { ...meta, title: title.trim() || meta.title || 'Untitled note' } }
  }, [editor, fallback, title])

  // The PDF preview renders while the dialog is open, and again when its options change.
  const previewKey = open && format === 'pdf' && target ? `${session}:${headerFooter}` : ''
  useEffect(() => {
    if (!previewKey || !target) return
    const document = snapshot()
    if (!document) return
    let cancelled = false
    // One render at a time: each draws into the same element.
    const render = queue.current.then(() => cancelled ? null : renderPagedPreview(target, document, { headerFooter }))
    queue.current = render.then(() => undefined, () => undefined)
    render
      .then((result) => { if (result && !cancelled) setPreview({ key: previewKey, status: 'ready', pages: result.totalPages }) })
      .catch((reason: unknown) => { if (!cancelled) setPreview({ key: previewKey, status: 'error', pages: 0, message: reason instanceof Error ? reason.message : 'The preview couldn’t be drawn.' }) })
    return () => { cancelled = true }
  }, [previewKey, target, headerFooter, snapshot])
  const shownPreview: Preview = !previewKey ? { status: 'idle', pages: 0 } : preview.key === previewKey ? preview : { status: 'rendering', pages: 0 }

  // Pages are drawn full size, then shrunk to fit the dialog.
  useEffect(() => {
    if (!frame) return
    const observer = new ResizeObserver(([entry]) => setFrameWidth(entry.contentRect.width))
    observer.observe(frame)
    return () => observer.disconnect()
  }, [frame])

  const show = useCallback(() => { setError(null); setNotes([]); setSession((value) => value + 1); setOpen(true) }, [])
  /** Closing clears the drawn pages; the next opening draws them again from the editor. */
  const close = useCallback(() => { target?.replaceChildren(); setOpen(false) }, [target])
  const choose = useCallback((next: NoteExportFormat) => { setFormat(next); setError(null); setNotes([]) }, [])

  /** PDF: opens the print dialog on the preview (choose Save as PDF). Other formats download. */
  const run = useCallback(async () => {
    setError(null)
    if (format === 'pdf') {
      if (!target || shownPreview.status !== 'ready') return
      printPagedPreview(target)
      return
    }
    const document = snapshot()
    if (!document) return
    setBusy(true)
    try {
      const result = await exportDocumentWeb(document, format, { headerFooter })
      downloadExport(result)
      setNotes(result.warnings.map((warning) => warning.message))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The export failed. Try again.')
    } finally {
      setBusy(false)
    }
  }, [format, target, shownPreview.status, snapshot, headerFooter])

  const setup = currentPageSetup(metadata?.pageSetup)
  return {
    open, show, close,
    formats: exportFormats,
    format, choose,
    headerFooter, setHeaderFooter,
    /** The note has a header or footer to print; the switch is shown only then. */
    hasHeaderFooter: hasChrome,
    keepsLayout: format === 'pdf' || format === 'docx',
    summary: exportSummary(setup, format),
    preview: shownPreview,
    /** Callback refs: where the pages are drawn, and the scroll box they shrink to fit. */
    attachPreview: setTarget,
    attachFrame: setFrame,
    /** How much the pages shrink to fit the preview's width. */
    previewScale: frameWidth > 0 ? Math.min(1, (frameWidth - 24) / pageMetrics(setup).width) : 0.5,
    busy, error, notes,
    canRun: Boolean(editor) && !busy && (format !== 'pdf' || shownPreview.status === 'ready'),
    run,
  }
}

export type NoteExportState = ReturnType<typeof useNoteExport>
