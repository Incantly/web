'use client'

import type { ReactNode } from 'react'
import { SpacesContext, useSpacesState } from '@/hooks/use-spaces'

/** Shares the user's Spaces. The logic lives in `useSpacesState` (`src/hooks/use-spaces.ts`); this runs it once and shares it. */
export function SpacesProvider({ children }: { children: ReactNode }) {
  return <SpacesContext.Provider value={useSpacesState()}>{children}</SpacesContext.Provider>
}
