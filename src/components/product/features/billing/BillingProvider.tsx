'use client'

import type { ReactNode } from 'react'
import { BillingContext, useBillingState } from '@/hooks/use-billing'

/** Shares the user's plan, usage and billing actions. The logic lives in `useBillingState` (`src/hooks/use-billing.ts`); this runs it once and shares it. */
export function BillingProvider({ children }: { children: ReactNode }) {
  return <BillingContext.Provider value={useBillingState()}>{children}</BillingContext.Provider>
}
