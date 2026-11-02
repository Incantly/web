'use client'

import { usePricing } from '@/hooks/use-pricing'
import { PlanCard } from './PlanCard'

/** The three plans side by side from `lg`, stacked below. `inset` drops the page gutters and tightens the cards (inside a dialog). */
export function PlanCards({ inset = false }: { inset?: boolean }) {
  const { cards } = usePricing()
  return <div className={`grid gap-4 md:grid-cols-2 lg:grid-cols-3 lg:gap-5 ${inset ? '' : 'mx-auto max-w-[76rem] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] sm:px-6'}`}>
    {cards.map((card) => <PlanCard key={card.plan.plan} card={card} compact={inset} />)}
  </div>
}
