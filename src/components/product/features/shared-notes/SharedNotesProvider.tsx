'use client'

import type { ReactNode } from 'react'
import { SharedNotesContext, useSharedNotesState } from '@/hooks/use-shared-notes'

/** Shares the shared-with-me list. The logic lives in `useSharedNotesState` (`src/hooks/use-shared-notes.ts`); this runs it once and shares it. */
export function SharedNotesProvider({ children }: { children: ReactNode }) {
  return <SharedNotesContext.Provider value={useSharedNotesState()}>{children}</SharedNotesContext.Provider>
}
