'use client'

import type { ReactNode } from 'react'
import { PricingContext, usePricingState } from '@/hooks/use-pricing'

/** Shares the pricing page's plans and plan actions. The logic lives in `usePricingState` (`src/hooks/use-pricing.ts`); this runs it once and shares it. */
export function PricingProvider({ children }: { children: ReactNode }) {
  return <PricingContext.Provider value={usePricingState()}>{children}</PricingContext.Provider>
}
