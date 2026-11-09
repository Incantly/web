'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState, type FocusEvent, type PointerEvent } from 'react'
import { useCurrentUser } from '@/components/product/SessionGate'
import { commitLiveAuthPrefetch, prefetchLiveAuth } from '@/components/product/workspace/liveblocksClient'
import { createNoteIntent, preloadCandidates, shouldPreload, type ConnectionHint } from '@/components/product/workspace/noteOpenModel'
import { collabModeOf, type CollabMode } from '@/lib/api/live'
import { freshLiveStatus, prefetchNoteForOpen, readLiveStatusForIntent } from '@/lib/notes/noteOpenCache'

/** Props a note link spreads to prepare its note on hover or keyboard focus. */
export type NoteIntentProps = {
  onPointerEnter: (event: PointerEvent<HTMLElement>) => void
  onPointerLeave: () => void
  onFocus: (event: FocusEvent<HTMLElement>) => void
  onBlur: () => void
  /** Claims the note's token prefetch for the open, so leaving the list never aborts it. */
  onClickCapture: () => void
}

/**
 * Prepares a note before its link is clicked. Its checkpoint and metadata warm after the pointer
 * rests on it ~150 ms, or at once on keyboard focus. After ~300 ms of hover (or of focus), its
 * live-status is read and, when it says the note is live, one room token is minted: one note at
 * a time, at most 5 per minute per tab, never again while a prefetched token is valid. Leaving
 * first cancels; a click commits what is in flight; nothing enters a room.
 * No shared state, so no provider: list views call it directly.
 */
export function useNoteIntent(): (noteId: string) => NoteIntentProps {
  const client = useQueryClient()
  const user = useCurrentUser()
  const intent = useMemo(() => createNoteIntent({
    prefetchNote: (noteId) => { void prefetchNoteForOpen(client, user.id, noteId).catch(() => undefined) },
    prefetchLive: async (noteId, signal) => {
      const status = await readLiveStatusForIntent(client, user.id, noteId).catch(() => null)
      if (!status || signal.aborted || status.mode !== 'live') return
      await prefetchLiveAuth(noteId, signal)
    },
    commitLive: commitLiveAuthPrefetch,
  }), [client, user.id])
  useEffect(() => () => intent.cancelAll(), [intent])
  return useCallback((noteId: string): NoteIntentProps => ({
    // Touch has no hover: a tap is the click itself.
    onPointerEnter: (event) => { if (event.pointerType !== 'touch') intent.hover(noteId) },
    onPointerLeave: () => intent.leave(noteId),
    onFocus: (event) => { if (event.currentTarget.matches(':focus-visible')) intent.focus(noteId) },
    onBlur: () => intent.leave(noteId),
    onClickCapture: () => intent.commit(noteId),
  }), [intent])
}

function connectionHint(): ConnectionHint {
  if (typeof navigator === 'undefined') return null
  return (navigator as Navigator & { connection?: ConnectionHint }).connection ?? null
}

/** Runs `fn` once the browser is idle (or after a short delay where idle callbacks are missing). */
function whenIdle(fn: () => void): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const handle = window.requestIdleCallback(fn, { timeout: 3_000 })
    return () => window.cancelIdleCallback(handle)
  }
  const timer = setTimeout(fn, 1_500)
  return () => clearTimeout(timer)
}

/**
 * Once the notes list has loaded, warms the checkpoint and metadata of the few most recent
 * notes at low priority (after idle), so opening them shows text at once. Skipped on Save-Data
 * and 2G-class connections. Never live-status or room tokens: those wait for intent.
 */
export function useNotePreload(notes: readonly { id: string; updatedAt: number }[], activeNoteId: string | null) {
  const client = useQueryClient()
  const user = useCurrentUser()
  const ids = preloadCandidates(notes, { exclude: activeNoteId }).join(',')
  useEffect(() => {
    if (!ids || !shouldPreload(connectionHint())) return
    return whenIdle(() => {
      for (const noteId of ids.split(',')) void prefetchNoteForOpen(client, user.id, noteId).catch(() => undefined)
    })
  }, [ids, client, user.id])
}

/**
 * The write path from a live-status read moments ago (hover or focus), so a live note opens in
 * live mode from its first frame. Only `yjs` counts: a hint never starts the legacy writer.
 * Read once per note mount; the join's own live-status still decides from then on.
 */
export function useLiveVerdictHint(noteId: string): CollabMode | undefined {
  const client = useQueryClient()
  const user = useCurrentUser()
  const [hint] = useState(() => {
    const status = freshLiveStatus(client, user.id, noteId)
    return status && collabModeOf(status) === 'yjs' ? 'yjs' as const : undefined
  })
  return hint
}
