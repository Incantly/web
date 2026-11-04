'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createFeatureContext, useFeatureContext } from '@/components/product/features/createFeatureContext'
import type { BlockRange, EvidenceTarget } from '@/components/product/workspace/ContextSearch'
import type { WorkspaceView } from '@/components/product/workspace/model'
import { threadParamFromSearch } from '@/components/product/workspace/notificationsModel'
import { searchForView, viewFromSearch, type UrlState } from '@/components/product/workspace/viewUrl'
import { useWorkspaceUI } from '@/hooks/use-workspace-ui'

type NoteContext = { noteId: string; spaceId: string } | null
export type FocusBlock = BlockRange & { noteId: string; nonce: number }
/** A comment thread to open the panel on and highlight. The nonce repeats a jump to the same thread. */
export type FocusThread = { noteId: string; threadId: string; nonce: number }

export type NavigationValue = {
  view: WorkspaceView
  activeNoteId: string | null
  activeSpaceId: string | null
  /** The Space a note was opened from (the notes list has no Space field, gap G1). */
  noteSpaceId: (noteId: string) => string | null
  navigate: (destination: WorkspaceView) => void
  openNote: (noteId: string, spaceId?: string) => void
  /** Opens the Library with a Source's drawer; `null` closes the drawer. */
  openSource: (sourceId: string | null) => void
  openSourceId: string | null
  /** A passage to scroll to once the note is open. */
  focusBlock: FocusBlock | null
  /** A comment thread to highlight in the comments panel (`?thread=` deep links). */
  focusThread: FocusThread | null
  /** Opens a note on one comment thread: the panel opens and the thread highlights. */
  openThread: (noteId: string, threadId: string, spaceId?: string) => void
  /** Where search results and citations open: a note at its block, or a Source. */
  evidenceTarget: EvidenceTarget
}

export const NavigationContext = createFeatureContext<NavigationValue>('Navigation')

function noteContextFor({ view, noteSpaceId }: UrlState): NoteContext {
  return view.startsWith('note:') && noteSpaceId ? { noteId: view.slice(5), spaceId: noteSpaceId } : null
}

/** The `?thread=` deep link on a note URL, if the URL carries one. */
function threadFor(search: string, view: WorkspaceView): FocusThread | null {
  if (!view.startsWith('note:')) return null
  const threadId = threadParamFromSearch(search)
  return threadId ? { noteId: view.slice(5), threadId, nonce: 0 } : null
}

/**
 * Which page is showing. Mirrored in the URL (`?note=`, `?space=`, `?view=`), one history entry per
 * navigation, so a refresh or link reopens it and back/forward move between pages. Runs once, in
 * `NavigationProvider`.
 */
export function useNavigationState(): NavigationValue {
  const { closeMobileSidebar } = useWorkspaceUI()
  // The workspace renders only on the client (behind the session gate), so the URL is readable here.
  const [initial] = useState(() => viewFromSearch(window.location.search))
  const [view, setView] = useState<WorkspaceView>(initial.view)
  const [noteContext, setNoteContext] = useState<NoteContext>(() => noteContextFor(initial))
  const [openSourceId, setOpenSourceId] = useState<string | null>(null)
  const [focusBlock, setFocusBlock] = useState<FocusBlock | null>(null)
  const [focusThread, setFocusThread] = useState<FocusThread | null>(() => threadFor(window.location.search, initial.view))
  const activeNoteId = view.startsWith('note:') ? view.slice(5) : null
  const activeSpaceId = view.startsWith('space:') ? view.slice(6) : null

  const urlSpaceId = activeNoteId && noteContext?.noteId === activeNoteId ? noteContext.spaceId : null
  useEffect(() => {
    const current = viewFromSearch(window.location.search)
    if (current.view === view && current.noteSpaceId === urlSpaceId) return
    window.history.pushState(null, '', `${window.location.pathname}${searchForView(view, urlSpaceId)}`)
  }, [view, urlSpaceId])
  useEffect(() => {
    const onPopState = () => {
      const next = viewFromSearch(window.location.search)
      setNoteContext(noteContextFor(next))
      setFocusThread(threadFor(window.location.search, next.view))
      setView(next.view)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const navigate = useCallback((destination: WorkspaceView) => { setView(destination); closeMobileSidebar() }, [closeMobileSidebar])
  const openNote = useCallback((noteId: string, spaceId?: string) => {
    setNoteContext(spaceId ? { noteId, spaceId } : null)
    navigate(`note:${noteId}`)
  }, [navigate])
  const openSource = useCallback((sourceId: string | null) => {
    setOpenSourceId(sourceId)
    if (sourceId && view !== 'library') navigate('library')
  }, [navigate, view])
  const openThread = useCallback((noteId: string, threadId: string, spaceId?: string) => {
    if (spaceId) setNoteContext({ noteId, spaceId })
    navigate(`note:${noteId}`)
    setFocusThread({ noteId, threadId, nonce: Date.now() })
  }, [navigate])

  return useMemo<NavigationValue>(() => ({
    view,
    activeNoteId,
    activeSpaceId,
    noteSpaceId: (noteId) => (noteContext?.noteId === noteId ? noteContext.spaceId : null),
    navigate,
    openNote,
    openSource,
    openSourceId,
    focusBlock,
    focusThread,
    openThread,
    evidenceTarget: {
      openNote: (noteId, range) => {
        if (activeNoteId !== noteId) openNote(noteId, noteContext?.noteId === noteId ? noteContext.spaceId : undefined)
        setFocusBlock(range ? { ...range, noteId, nonce: Date.now() } : null)
      },
      openSource: (sourceId) => openSource(sourceId),
    },
  }), [view, activeNoteId, activeSpaceId, noteContext, navigate, openNote, openSource, openSourceId, focusBlock, focusThread, openThread])
}

/** The current page, URL sync, and opening notes and Sources. Must be used inside `WorkspaceProviders`. */
export function useNavigation(): NavigationValue {
  return useFeatureContext(NavigationContext)
}
