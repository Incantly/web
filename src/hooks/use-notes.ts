'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useCurrentUser } from '@/components/product/SessionGate'
import { createFeatureContext, useFeatureContext } from '@/components/product/features/createFeatureContext'
import type { NoteRecord } from '@/components/product/workspace/model'
import { createNoteVariables, useCreateNote, useDeleteNote, useNotesList } from '@/components/product/workspace/useNotes'
import { noteSyncStore, resumePendingNotes } from '@/components/product/workspace/useNoteSession'
import type { ListStatus } from '@/components/product/workspace/views'
import { useNavigation } from '@/hooks/use-navigation'
import { useSpaces } from '@/hooks/use-spaces'
import { authClient } from '@/lib/auth-client'
import { syncKey } from '@/lib/notes/syncStore'

export type NotesValue = {
  notes: NoteRecord[]
  status: ListStatus
  /** The note being shown, if it is in the loaded list. */
  activeNote: NoteRecord | undefined
  /** Create a note (optionally in a Space) and open it. Ignored while a create is in flight. */
  createNote: (options?: { title?: string; spaceId?: string | null }) => void
  /** Delete a note, drop its local sync queue, and leave for its Space or the notes list. */
  deleteNote: (noteId: string) => Promise<void>
  shareNote: (noteId: string) => void
}

export const NotesContext = createFeatureContext<NotesValue>('Notes')

/** `/v1/notes`: the notes list and the actions that create, delete and share notes. Runs once, in `NotesProvider`. */
export function useNotesState(): NotesValue {
  const user = useCurrentUser()
  const client = useQueryClient()
  const { activeNoteId, noteSpaceId, navigate, openNote } = useNavigation()
  const { addNoteToSpace } = useSpaces()
  const query = useNotesList(user.id)
  const { isPending, isError, error, refetch, hasNextPage, fetchNextPage, isFetchingNextPage } = query
  const create = useCreateNote(user.id)
  const remove = useDeleteNote(user.id)

  const notes = useMemo<NoteRecord[]>(() => query.notes.map((note) => ({
    id: note.id,
    title: note.title,
    updatedAt: Date.parse(note.updatedAt) || 0,
    spaceId: noteSpaceId(note.id),
    currentRevisionId: note.currentRevisionId ?? null,
  })), [query.notes, noteSpaceId])

  // Send edits still waiting on this device: once on load, and again whenever the connection returns.
  const activeNoteIdRef = useRef(activeNoteId)
  useEffect(() => { activeNoteIdRef.current = activeNoteId }, [activeNoteId])
  useEffect(() => {
    const resume = () => { void authClient.getSession().then((result) => { if (result.data?.user) void resumePendingNotes(user.id, activeNoteIdRef.current ?? undefined) }) }
    resume()
    window.addEventListener('online', resume)
    return () => window.removeEventListener('online', resume)
  }, [user.id])

  const createNote = useCallback((options: { title?: string; spaceId?: string | null } = {}) => {
    if (create.isPending) return
    create.mutate(createNoteVariables(options.title), {
      onSuccess: async (note) => {
        // Create directly in the Space: the note exists either way, so a failed move still opens it.
        if (options.spaceId) await addNoteToSpace(options.spaceId, note.id).catch(() => {})
        openNote(note.id, options.spaceId ?? undefined)
      },
    })
  }, [create, addNoteToSpace, openNote])

  const deleteNote = useCallback(async (noteId: string) => {
    const spaceId = noteSpaceId(noteId)
    await remove.mutateAsync(noteId)
    await noteSyncStore().remove(syncKey(user.id, noteId)).catch(() => {})
    void client.invalidateQueries({ queryKey: ['space-notes'] })
    void client.invalidateQueries({ queryKey: ['spaces', user.id] })
    navigate(spaceId ? `space:${spaceId}` : 'notes')
  }, [remove, user.id, client, noteSpaceId, navigate])

  const shareNote = useCallback((noteId: string) => {
    const text = notes.find((note) => note.id === noteId)?.title || 'Untitled note'
    if (navigator.share) void navigator.share({ title: text, text }).catch(() => {})
    else void navigator.clipboard.writeText(text).catch(() => {})
  }, [notes])

  return useMemo<NotesValue>(() => ({
    notes,
    status: { loading: isPending, error: isError ? error : null, retry: () => void refetch(), hasMore: hasNextPage, loadMore: () => void fetchNextPage(), loadingMore: isFetchingNextPage },
    activeNote: activeNoteId ? notes.find((note) => note.id === activeNoteId) : undefined,
    createNote,
    deleteNote,
    shareNote,
  }), [notes, isPending, isError, error, refetch, hasNextPage, fetchNextPage, isFetchingNextPage, activeNoteId, createNote, deleteNote, shareNote])
}

/** `/v1/notes`: the notes list, the open note, and creating, deleting and sharing notes. Must be used inside `WorkspaceProviders`. */
export function useNotes(): NotesValue {
  return useFeatureContext(NotesContext)
}
