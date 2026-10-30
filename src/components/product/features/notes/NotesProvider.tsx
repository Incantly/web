'use client'

import type { ReactNode } from 'react'
import { NotesContext, useNotesState } from '@/hooks/use-notes'

/** Shares the notes list and note actions. The logic lives in `useNotesState` (`src/hooks/use-notes.ts`); this runs it once and shares it. */
export function NotesProvider({ children }: { children: ReactNode }) {
  return <NotesContext.Provider value={useNotesState()}>{children}</NotesContext.Provider>
}
