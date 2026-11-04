'use client'

import type { ReactNode } from 'react'
import { SharingContext, useSharingState } from '@/hooks/use-sharing'

/** Shares invitations, the share dialog and share links. The logic lives in `useSharingState` (`src/hooks/use-sharing.ts`); this runs it once and shares it. */
export function SharingProvider({ children }: { children: ReactNode }) {
  return <SharingContext.Provider value={useSharingState()}>{children}</SharingContext.Provider>
}
