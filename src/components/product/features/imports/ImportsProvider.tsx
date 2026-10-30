'use client'

import type { ReactNode } from 'react'
import { ImportsContext, useImportsState } from '@/hooks/use-imports'

/** Shares the tracked imports. The logic lives in `useImportsState` (`src/hooks/use-imports.ts`); this runs it once and shares it. */
export function ImportsProvider({ children }: { children: ReactNode }) {
  return <ImportsContext.Provider value={useImportsState()}>{children}</ImportsContext.Provider>
}
