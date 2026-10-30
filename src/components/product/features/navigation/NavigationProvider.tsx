'use client'

import type { ReactNode } from 'react'
import { NavigationContext, useNavigationState } from '@/hooks/use-navigation'

/** Shares which page is showing. The logic lives in `useNavigationState` (`src/hooks/use-navigation.ts`); this runs it once and shares it. */
export function NavigationProvider({ children }: { children: ReactNode }) {
  return <NavigationContext.Provider value={useNavigationState()}>{children}</NavigationContext.Provider>
}
