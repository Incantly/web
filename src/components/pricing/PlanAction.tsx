'use client'

import Link from 'next/link'
import { useState } from 'react'
import { WaitlistButton } from '../WaitlistButton'
import { ConfirmDialog } from '../product/workspace/ui'
import { usePricing, type PricingCard } from '@/hooks/use-pricing'

const base = 'inline-flex w-full items-center justify-center rounded-[0.625rem] px-5 text-[0.9375rem] font-medium no-underline transition-[background-color,color,border-color] duration-[180ms] disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none'
const primaryStyle = `${base} border border-button bg-button text-inverse hover:bg-button-hover focus-visible:bg-button-hover`
const secondaryStyle = `${base} border border-default bg-canvas text-foreground hover:border-strong hover:bg-surface`
const quietStyle = `${base} border border-default bg-surface text-muted`

/** A plan card's one button: waitlist, sign-up, checkout, plan change, resume or downgrade. */
export function PlanAction({ card, compact = false }: { card: PricingCard; compact?: boolean }) {
  const { choose, downgrade, busy } = usePricing()
  const [confirming, setConfirming] = useState(false)
  const { action } = card
  // 44px in the dialog, 48px on the page.
  const size = compact ? ' min-h-11' : ' min-h-12'
  const primary = primaryStyle + size
  const secondary = secondaryStyle + size
  const quiet = quietStyle + size
  const style = card.copy.popular ? primary : secondary
  if (action.kind === 'none') return null
  if (action.kind === 'waitlist') return <WaitlistButton className={style}>{action.label}</WaitlistButton>
  if (action.kind === 'signup') return <Link href={card.signupHref} className={style}>{action.label}</Link>
  if (action.kind === 'current' || action.kind === 'disabled') return <button type="button" disabled className={quiet}>{action.label}</button>
  const label = card.busy ? 'One moment…' : action.label
  if (action.kind === 'downgrade') return <>
    <button type="button" disabled={busy} onClick={() => setConfirming(true)} className={secondary}>{label}</button>
    <ConfirmDialog open={confirming} onClose={() => setConfirming(false)} onConfirm={downgrade} title="Move to Free?"
      body="You keep your current plan until the end of the period you paid for, then move to Free. Nothing is deleted; if you’re over a Free limit, new uploads pause." confirmLabel="Downgrade" />
  </>
  // Upgrades are paid on Polar's page, where the new price is shown and confirmed.
  if (action.kind === 'portal') return <>
    <button type="button" disabled={busy} aria-busy={card.busy} onClick={() => choose(card.plan.plan)} className={style}>{label}</button>
    <p className="mt-2 text-center text-xs text-muted">Opens Polar to review the price and pay.</p>
  </>
  // A downgrade between paid plans waits for renewal: confirm it first.
  if (action.kind === 'change' && card.confirm) return <>
    <button type="button" disabled={busy} aria-busy={card.busy} onClick={() => setConfirming(true)} className={style}>{label}</button>
    <ConfirmDialog open={confirming} onClose={() => setConfirming(false)} onConfirm={() => choose(card.plan.plan)} title={card.confirm.title} body={card.confirm.body} confirmLabel={card.confirm.confirmLabel} />
  </>
  return <button type="button" disabled={busy} aria-busy={card.busy} onClick={() => choose(card.plan.plan)} className={action.kind === 'resume' ? primary : style}>{label}</button>
}
