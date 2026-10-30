'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { BlockRange, EvidenceTarget } from '../../workspace/ContextSearch'
import type { WorkspaceView } from '../../workspace/model'
import { searchForView, viewFromSearch, type UrlState } from '../../workspace/viewUrl'
import { createFeatureContext } from '../createFeatureContext'
import { useWorkspaceUI } from '@/hooks/use-workspace-ui'

type NoteContext = { noteId: string; spaceId: string } | null
export type FocusBlock = BlockRange & { noteId: string; nonce: number }

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
  /** Where search results and citations open: a note at its block, or a Source. */
  evidenceTarget: EvidenceTarget
}

export const NavigationContext = createFeatureContext<NavigationValue>('Navigation')

function noteContextFor({ view, noteSpaceId }: UrlState): NoteContext {
  return view.startsWith('note:') && noteSpaceId ? { noteId: view.slice(5), spaceId: noteSpaceId } : null
}

/**
 * Which page is showing. Mirrored in the URL (`?note=`, `?space=`, `?view=`), one history entry per
 * navigation, so a refresh or link reopens it and back/forward move between pages.
 */
export function NavigationProvider({ children }: { children: ReactNode }) {
  const { closeMobileSidebar } = useWorkspaceUI()
  // The workspace renders only on the client (behind the session gate), so the URL is readable here.
  const [initial] = useState(() => viewFromSearch(window.location.search))
  const [view, setView] = useState<WorkspaceView>(initial.view)
  const [noteContext, setNoteContext] = useState<NoteContext>(() => noteContextFor(initial))
  const [openSourceId, setOpenSourceId] = useState<string | null>(null)
  const [focusBlock, setFocusBlock] = useState<FocusBlock | null>(null)
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

  const value = useMemo<NavigationValue>(() => ({
    view,
    activeNoteId,
    activeSpaceId,
    noteSpaceId: (noteId) => (noteContext?.noteId === noteId ? noteContext.spaceId : null),
    navigate,
    openNote,
    openSource,
    openSourceId,
    focusBlock,
    evidenceTarget: {
      openNote: (noteId, range) => {
        if (activeNoteId !== noteId) openNote(noteId, noteContext?.noteId === noteId ? noteContext.spaceId : undefined)
        setFocusBlock(range ? { ...range, noteId, nonce: Date.now() } : null)
      },
      openSource: (sourceId) => openSource(sourceId),
    },
  }), [view, activeNoteId, activeSpaceId, noteContext, navigate, openNote, openSource, openSourceId, focusBlock])

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>
}
