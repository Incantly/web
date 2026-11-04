'use client'

import type { ReactNode } from 'react'
import { ArtifactsContext, useArtifactsState } from '@/hooks/use-artifacts'

/** Shares the artifacts connection state and the generation being followed. The logic lives in `useArtifactsState` (`src/hooks/use-artifacts.ts`); this runs it once and shares it. */
export function ArtifactsProvider({ children }: { children: ReactNode }) {
  return <ArtifactsContext.Provider value={useArtifactsState()}>{children}</ArtifactsContext.Provider>
}
