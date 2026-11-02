'use client'

import { usePricing } from '@/hooks/use-pricing'
import type { BillingInterval } from '@/lib/api/billing'

const options: { value: BillingInterval; label: string }[] = [
  { value: 'month', label: 'Monthly' },
  { value: 'year', label: 'Yearly' },
]

/** Monthly or yearly prices on every card. */
export function IntervalToggle() {
  const { interval, setInterval, savingLabel } = usePricing()
  return <div role="group" aria-label="Billing period" className="inline-flex rounded-full border border-default bg-surface p-1">
    {options.map((option) => <button key={option.value} type="button" aria-pressed={interval === option.value} onClick={() => setInterval(option.value)}
      className="inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-sm font-medium text-muted transition-colors duration-[180ms] hover:text-foreground aria-pressed:bg-raised aria-pressed:text-foreground aria-pressed:shadow-sm motion-reduce:transition-none">
      {option.label}
      {option.value === 'year' && savingLabel ? <span className="rounded-full bg-feature-research px-2 py-0.5 text-xs font-semibold text-accent">{savingLabel}</span> : null}
    </button>)}
  </div>
}
