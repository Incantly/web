'use client'

import { useCallback, useEffect, useState } from 'react'
import type { IncantlyDocument } from '@incantly/canvas-core/document'
import { outgoingAfterKeyChange } from '@/components/product/workspace/noteOpenModel'

/** An incoming editor that never reports ready stops hiding behind the outgoing one after this long. */
const HANDOFF_TIMEOUT_MS = 1_500

type Slot = { key: string; document: IncantlyDocument | null; bound: boolean; ready: boolean }

export type EditorHandoff = {
  /** The previous read-only editor, kept on screen (same key, same instance) until the next one is ready. */
  outgoing: { key: string; document: IncantlyDocument } | null
  /** Hide the incoming editor out of flow while `outgoing` holds its place. */
  hideIncoming: boolean
  /** The editor with `key` reported ready. */
  onReady: (key: string) => void
}

/**
 * Swaps a note's editor without a blank frame or a scroll jump: when the editor's key changes
 * (the cached head turning into the room's doc), the outgoing read-only editor stays mounted in
 * place while the incoming one renders hidden and out of flow, and both swap in the same commit
 * once it is ready. Only for read-only, unbound outgoing editors (`enabled`): a bound live
 * editor is never kept past its binding.
 */
export function useEditorHandoff(key: string, document: IncantlyDocument | null, options: { enabled: boolean; bound: boolean }): EditorHandoff {
  const [slot, setSlot] = useState<Slot>({ key, document, bound: options.bound, ready: false })
  const [outgoing, setOutgoing] = useState<Slot | null>(null)
  // Adjust state during render (idempotent): a new key hands over from the current editor only
  // (never an older one): kept when it was ready, read-only and unbound, else nothing is kept.
  if (slot.key !== key) {
    setSlot({ key, document, bound: options.bound, ready: false })
    setOutgoing(outgoingAfterKeyChange(slot, options.enabled))
  }
  const onReady = useCallback((readyKey: string) => {
    setSlot((current) => (current.key === readyKey && !current.ready ? { ...current, ready: true } : current))
    setOutgoing((current) => (current && current.key !== readyKey ? null : current))
  }, [])
  // Never strand the incoming editor behind a stale one.
  useEffect(() => {
    if (!outgoing) return
    const timer = setTimeout(() => setOutgoing(null), HANDOFF_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [outgoing])
  const shown = outgoing && outgoing.key !== key && outgoing.document ? { key: outgoing.key, document: outgoing.document } : null
  return { outgoing: shown, hideIncoming: shown != null, onReady }
}
