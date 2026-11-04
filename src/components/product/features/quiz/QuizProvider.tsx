'use client'

import type { ReactNode } from 'react'
import { QuizContext, useQuizState } from '@/hooks/use-quiz'

/** Shares the open quiz attempt and connection state. The logic lives in `useQuizState` (`src/hooks/use-quiz.ts`); this runs it once and shares it. */
export function QuizProvider({ children }: { children: ReactNode }) {
  return <QuizContext.Provider value={useQuizState()}>{children}</QuizContext.Provider>
}
