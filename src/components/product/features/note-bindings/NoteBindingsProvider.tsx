'use client'

import type { ReactNode } from 'react'
import { NoteBindingsContext, useNoteBindingsState } from '@/hooks/use-note-bindings'

/** Shares the open note's attached sources. The logic lives in `useNoteBindingsState` (`src/hooks/use-note-bindings.ts`); this runs it once and shares it. */
export function NoteBindingsProvider({ children }: { children: ReactNode }) {
  return <NoteBindingsContext.Provider value={useNoteBindingsState()}>{children}</NoteBindingsContext.Provider>
}
