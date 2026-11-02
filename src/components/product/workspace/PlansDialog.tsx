'use client'

import Link from 'next/link'
import { useEffect, useId, useRef } from 'react'
import { useWorkspaceUI } from '@/hooks/use-workspace-ui'
import { IntervalToggle } from '../../pricing/IntervalToggle'
import { PlanCards } from '../../pricing/PlanCards'
import { PricingMessages } from '../../pricing/PricingMessages'
import { AppIcon } from '../AppIcon'
import { PricingProvider } from '../features/pricing/PricingProvider'
import { iconButton } from './ui'

/**
 * Plans over the workspace: the pricing page's cards, period switch and messages, so upgrading,
 * switching and downgrading work here exactly as on `/pricing`. Paid buttons go straight to checkout.
 */
export function PlansDialog() {
  const { plansOpen: open, closePlans } = useWorkspaceUI()
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  // Only its own close: a confirmation opened inside it closes too, and React passes that event up.
  return <dialog ref={ref} aria-labelledby={titleId}
    onClose={(event) => { if (event.target === event.currentTarget) closePlans() }}
    onCancel={(event) => { if (event.target !== event.currentTarget) return; event.preventDefault(); closePlans() }}
    onClick={(event) => { if (event.target === ref.current) closePlans() }}
    className="m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden border-default bg-raised p-0 text-foreground shadow-xl backdrop:bg-foreground/30 open:flex open:flex-col sm:m-auto sm:h-fit sm:max-h-[calc(100dvh-2rem)] sm:w-[min(72rem,calc(100vw-2rem))] sm:rounded-[1.15rem] sm:border">
    {/* Plans and the subscription load only while it's open. */}
    {open ? <PricingProvider>
      <header className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-default pl-5 pr-2 pt-[env(safe-area-inset-top)] sm:pl-7 sm:pt-0">
        <h2 id={titleId} className="font-display text-xl text-foreground">Plans</h2>
        <button type="button" onClick={closePlans} className={iconButton} aria-label="Close plans"><AppIcon name="close" className="size-5" /></button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 sm:px-6">
        <div className="flex justify-center"><IntervalToggle /></div>
        <div className="mt-4"><PricingMessages inset /></div>
        <PlanCards inset />
        <p className="mt-4 text-center text-sm text-muted">
          Prices are in US dollars, before tax.{' '}
          <Link href="/pricing#compare-heading" onClick={closePlans} className="font-semibold text-button underline underline-offset-2 hover:text-button-hover">Compare every feature</Link>
        </p>
      </div>
    </PricingProvider> : null}
  </dialog>
}
