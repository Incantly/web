'use client'

import type { ReactNode } from 'react'
import { LibraryContext, useLibraryState } from '@/hooks/use-library'

/** Shares the Library's Sources. The logic lives in `useLibraryState` (`src/hooks/use-library.ts`); this runs it once and shares it. */
export function LibraryProvider({ children }: { children: ReactNode }) {
  return <LibraryContext.Provider value={useLibraryState()}>{children}</LibraryContext.Provider>
}
