'use client'

import type { ReactNode } from 'react'
import { LiveCollabContext, useLiveCollabState } from '@/hooks/use-live-collab'

/** Shares the open note's live-collaboration room. The logic lives in `useLiveCollabState` (`src/hooks/use-live-collab.ts`); this runs it once and shares it. */
export function LiveCollabProvider({ children }: { children: ReactNode }) {
  return <LiveCollabContext.Provider value={useLiveCollabState()}>{children}</LiveCollabContext.Provider>
}
