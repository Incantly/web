'use client'

import type { ReactNode } from 'react'
import { CommentsContext, useCommentsState } from '@/hooks/use-comments'

/** Shares the open note's comment threads. The logic lives in `useCommentsState` (`src/hooks/use-comments.ts`); this runs it once and shares it. */
export function CommentsProvider({ children }: { children: ReactNode }) {
  return <CommentsContext.Provider value={useCommentsState()}>{children}</CommentsContext.Provider>
}
