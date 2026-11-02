'use client'

import { AppIcon } from '../product/AppIcon'
import { usePricing } from '@/hooks/use-pricing'

/** Payment-failed banner, plus the outcome of the last plan action. */
export function PricingMessages({ inset = false }: { inset?: boolean }) {
  const { banner, error, notice, dismissMessages, canManageBilling, manageBilling, busy } = usePricing()
  const message = error ?? notice
  return <div className={inset ? '' : 'mx-auto max-w-[76rem] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] sm:px-6'}>
    {banner ? <div role={banner.kind === 'grace' ? 'alert' : 'status'} className={`mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm text-foreground ${banner.kind === 'grace' ? 'border-danger bg-danger-surface' : 'border-default bg-surface'}`}>
      <span className="min-w-0">{banner.text}</span>
      {banner.kind === 'grace' && canManageBilling ? <button type="button" disabled={busy} onClick={manageBilling} className="inline-flex min-h-11 items-center rounded-lg px-3 font-semibold text-foreground underline underline-offset-2 disabled:opacity-60">Update card</button> : null}
    </div> : null}
    <div aria-live="polite">
      {message ? <div className={`mb-4 flex items-center justify-between gap-3 rounded-xl border px-4 py-2 text-sm ${error ? 'border-danger bg-danger-surface text-foreground' : 'border-default bg-surface text-foreground'}`}>
        <span className="min-w-0">{message}</span>
        <button type="button" onClick={dismissMessages} aria-label="Dismiss" className="grid size-11 shrink-0 place-items-center rounded-lg text-muted hover:text-foreground"><AppIcon name="close" className="size-4" /></button>
      </div> : null}
    </div>
  </div>
}
