'use client'

import { useCallback, useMemo, useState } from 'react'
import { useCurrentUser } from '@/components/product/SessionGate'
import { createFeatureContext, useFeatureContext } from '@/components/product/features/createFeatureContext'
import type { NoteDto, TrashNoteDto } from '@/lib/api/notes'
import { notesApi } from '@/lib/api/notes'
import { isApiError } from '@/lib/api/errors'
import { useNotesCache, useRestoreTrashNote, useTrashCache, useTrashList } from '@/components/product/workspace/useNotes'
import type { ListStatus } from '@/components/product/workspace/views'

export type TrashValue = {
  trashed: TrashNoteDto[]
  status: ListStatus
  /** The note id a restore is running for, if any. */
  restoringId: string | null
  /** Restore and open the restored note. Stays on errors for the view to render. */
  restoreNote: (noteId: string) => Promise<void>
  /** The last restore failure, if any. */
  restoreError: unknown
  clearRestoreError: () => void
  /** The most recently restored note, so the view can offer to open it. */
  restored: NoteDto | null
  clearRestored: () => void
}

export const TrashContext = createFeatureContext<TrashValue>('Trash')

/** `GET /v1/notes/trash` plus the bodyless trash restore. Runs once, in `TrashProvider`. */
export function useTrashState(): TrashValue {
  const user = useCurrentUser()
  const query = useTrashList(user.id)
  const { isPending, isError, error, refetch, hasNextPage, fetchNextPage, isFetchingNextPage } = query
  const restore = useRestoreTrashNote(user.id)
  const notes = useNotesCache(user.id)
  const trash = useTrashCache(user.id)
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [restoreError, setRestoreError] = useState<unknown>(null)
  const [restored, setRestored] = useState<NoteDto | null>(null)

  const restoreNote = useCallback(async (noteId: string) => {
    if (restoringId) return
    setRestoringId(noteId)
    setRestoreError(null)
    setRestored(null)
    try {
      const note = await restore.mutateAsync(noteId)
      setRestored(note)
    } catch (failure) {
      if (isApiError(failure, 'NOTE_NOT_DELETED')) {
        // Already live: confirm with a metadata read instead of retrying, then treat it as restored.
        try {
          const note = await notesApi.get(noteId)
          notes.upsert(note)
          trash.remove(noteId)
          setRestored(note)
          return
        } catch {
          // The confirm read failed: fall through to the original error.
        }
      }
      if (isApiError(failure, 'NOTE_NOT_FOUND')) trash.remove(noteId)
      setRestoreError(failure)
    } finally {
      setRestoringId(null)
    }
  }, [restoringId, restore, notes, trash])

  const clearRestoreError = useCallback(() => setRestoreError(null), [])
  const clearRestored = useCallback(() => setRestored(null), [])

  return useMemo<TrashValue>(() => ({
    trashed: query.trashed,
    status: { loading: isPending, error: isError ? error : null, retry: () => void refetch(), hasMore: hasNextPage, loadMore: () => void fetchNextPage(), loadingMore: isFetchingNextPage },
    restoringId,
    restoreNote,
    restoreError,
    clearRestoreError,
    restored,
    clearRestored,
  }), [query.trashed, isPending, isError, error, refetch, hasNextPage, fetchNextPage, isFetchingNextPage, restoringId, restoreNote, restoreError, clearRestoreError, restored, clearRestored])
}

/** `GET /v1/notes/trash`: soft-deleted notes and restoring them. Must be used inside `WorkspaceProviders`. */
export function useTrash(): TrashValue {
  return useFeatureContext(TrashContext)
}
