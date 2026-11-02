'use client'

import Link from 'next/link'
import { AppProviders } from '../product/AppProviders'
import { SessionGate } from '../product/SessionGate'
import { useCheckoutStatus, type CheckoutStatus } from '@/hooks/use-checkout-status'
import { eyebrowClass } from '../../lib/ui'

const button = 'mt-8 inline-flex min-h-12 items-center justify-center rounded-[0.625rem] border border-button bg-button px-6 text-[0.9375rem] font-medium text-inverse no-underline hover:bg-button-hover focus-visible:bg-button-hover'

const copy: Record<CheckoutStatus['kind'], { title: string; body: string }> = {
  missing: { title: 'Nothing to confirm here.', body: 'This page finishes a checkout. Choose a plan to start one.' },
  confirming: { title: 'Confirming your payment…', body: 'This usually takes a few seconds. You can keep this page open.' },
  slow: { title: 'Payment received.', body: 'We’re activating your plan. It will switch over on its own in a moment; you can start working meanwhile.' },
  active: { title: '', body: 'Everything in your new plan is ready. Receipts come from Polar by email.' },
  failed: { title: 'That checkout didn’t go through.', body: 'You weren’t charged for a plan change. Try again from the pricing page.' },
}

function Status() {
  const status = useCheckoutStatus()
  const text = copy[status.kind]
  const title = status.kind === 'active' ? `You’re on ${status.planName}.` : text.title
  const done = status.kind === 'active' || status.kind === 'slow'
  return <div className="mx-auto max-w-[36rem] px-4 text-center" role="status" aria-live="polite">
    <p className={`${eyebrowClass} text-accent`}>Billing</p>
    <h1 className="mt-3 font-display text-[clamp(2.25rem,6vw,3.5rem)] font-normal leading-[1.05] tracking-[-0.045em] text-foreground text-balance">{title}</h1>
    <p className="mt-4 text-base leading-[1.6] text-muted">{text.body}</p>
    {status.kind === 'confirming' ? null : <Link href={done ? '/notes' : '/pricing'} className={button}>{done ? 'Open Incantly' : 'Back to pricing'}</Link>}
  </div>
}

/** `/billing/success`: where Polar sends the browser after checkout. Signed-in only. */
export function CheckoutReturn() {
  return <AppProviders><SessionGate><main className="grid min-h-[60svh] place-items-center bg-canvas py-16"><Status /></main></SessionGate></AppProviders>
}
