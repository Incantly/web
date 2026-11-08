import { useEffect, useRef } from 'react'
import type { YjsNoteBinding } from '@/lib/document-editor/yjsBinding'
import { canAcquireNoteWriter, createYjsFoldWriter, foldYjsToCanonical } from '@/lib/document-editor/yjsFold'
import type { NoteSession } from '@/components/product/workspace/useNoteSession'

/**
 * Owns persistence for a Yjs-bound note (migration Phase 2): every Yjs doc
 * update schedules a canonical fold, and the fold submits through the
 * session's existing transaction/checkpoint pipeline. Returns whether the
 * fold writer is live — the screen records legacy editor transactions only
 * while this is false, so a keystroke is never submitted twice.
 *
 * Liveness is render-derived (binding + editable + slot peek), never effect
 * state: the writer cannot fail to construct when the peek passes (one keyed
 * scope per note, so no racing acquirer exists), and a degraded yjs-flagged
 * note (session holding `legacy-sync`) simply reports not-live so legacy
 * recording continues exactly as today.
 */
export function useYjsFoldWriter({ noteId, binding, session, editable }: {
  noteId: string
  binding: YjsNoteBinding | null
  session: NoteSession
  editable: boolean
}): boolean {
  const sessionRef = useRef(session)
  // Latest loaded head; never regresses to null (gone/denied mid-open keeps
  // folding against the last good envelope instead of crashing the writer).
  const headRef = useRef(session.document)
  useEffect(() => {
    sessionRef.current = session
    if (session.document) headRef.current = session.document
  })
  useEffect(() => {
    if (!binding || !editable || !canAcquireNoteWriter(noteId, 'yjs-fold')) return
    let writer: ReturnType<typeof createYjsFoldWriter>
    try {
      writer = createYjsFoldWriter({
      noteId,
      fold: () => {
        const head = headRef.current
        if (!head) throw new Error('[yjs-fold] no head document to fold against')
        return foldYjsToCanonical(binding.fragment, head)
      },
      record: (change) => { sessionRef.current.record(change) },
      flushPipeline: async () => { await sessionRef.current.flush() },
      })
    } catch {
      // Unreachable by construction (the peek above passed and one keyed scope
      // owns this note): fail without a writer rather than crash the screen.
      return
    }
    const onUpdate = () => { writer.scheduleFold() }
    binding.doc.on('update', onUpdate)
    return () => {
      binding.doc.off('update', onUpdate)
      writer.dispose()
    }
  }, [binding, editable, noteId])
  return binding != null && editable && canAcquireNoteWriter(noteId, 'yjs-fold')
}
