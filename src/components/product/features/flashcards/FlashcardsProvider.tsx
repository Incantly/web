'use client'

import type { ReactNode } from 'react'
import { FlashcardsContext, useFlashcardsState } from '@/hooks/use-flashcards'

/** Shares the flashcard connection state and the generation being followed. The logic lives in `useFlashcardsState` (`src/hooks/use-flashcards.ts`); this runs it once and shares it. */
export function FlashcardsProvider({ children }: { children: ReactNode }) {
  return <FlashcardsContext.Provider value={useFlashcardsState()}>{children}</FlashcardsContext.Provider>
}
