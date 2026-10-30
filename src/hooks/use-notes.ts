'use client'

import { useFeatureContext } from '@/components/product/features/createFeatureContext'
import { NotesContext, type NotesValue } from '@/components/product/features/notes/NotesProvider'

/** `/v1/notes`: the notes list, the open note, and creating, deleting and sharing notes. Must be used inside `WorkspaceProviders`. */
export function useNotes(): NotesValue {
  return useFeatureContext(NotesContext)
}
