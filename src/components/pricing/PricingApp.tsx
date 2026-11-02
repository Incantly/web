'use client'

import { AppProviders } from '../product/AppProviders'
import { PricingProvider } from '../product/features/pricing/PricingProvider'
import { PlanCards } from './PlanCards'
import { PlanComparison } from './PlanComparison'
import { PricingHero } from './PricingHero'
import { PricingMessages } from './PricingMessages'

/** The interactive part of `/pricing`: everything that reads plans or the visitor's subscription. */
export function PricingApp() {
  return <AppProviders><PricingProvider>
    <PricingHero />
    <PricingMessages />
    <PlanCards />
    <PlanComparison />
  </PricingProvider></AppProviders>
}
