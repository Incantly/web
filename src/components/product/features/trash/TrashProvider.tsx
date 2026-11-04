'use client'

import type { ReactNode } from 'react'
import { TrashContext, useTrashState } from '@/hooks/use-trash'

/** Shares the trash list and trash restore. The logic lives in `useTrashState` (`src/hooks/use-trash.ts`); this runs it once and shares it. */
export function TrashProvider({ children }: { children: ReactNode }) {
  return <TrashContext.Provider value={useTrashState()}>{children}</TrashContext.Provider>
}
