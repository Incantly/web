import { useCallback, useEffect, useRef } from 'react'
import type { IncantlyDocument } from '@incantly/canvas-core/document'

export interface DocumentSaveEnvelope { document: IncantlyDocument; revision: number; schemaVersion: number }
export interface UseDocumentAutosaveOptions { document: IncantlyDocument; save: (value: DocumentSaveEnvelope) => Promise<void>; delay?: number; onError?: (error: unknown) => void }
export function useDocumentAutosave({ document, save, delay = 750, onError }: UseDocumentAutosaveOptions) {
  const revision = useRef(0)
  const saved = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef(document)
  latest.current = document
  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const current = ++revision.current
    try { await save({ document: latest.current, revision: current, schemaVersion: latest.current.schemaVersion }); if (current > saved.current) saved.current = current }
    catch (error) { if (current >= saved.current) onError?.(error) }
  }, [onError, save])
  useEffect(() => { if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => void flush(), delay); return () => { if (timer.current) clearTimeout(timer.current) } }, [delay, document, flush])
  useEffect(() => {
    const lifecycle = () => { if (globalThis.document?.visibilityState === 'hidden') void flush() }
    const navigation = () => { void flush() }
    globalThis.document?.addEventListener('visibilitychange', lifecycle)
    globalThis.addEventListener?.('pagehide', navigation)
    return () => { globalThis.document?.removeEventListener('visibilitychange', lifecycle); globalThis.removeEventListener?.('pagehide', navigation); void flush() }
  }, [flush])
  return { flush, revision: revision.current, savedRevision: saved.current }
}
