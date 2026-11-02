'use client'

import { useState } from 'react'
import { useBilling } from '@/hooks/use-billing'
import { useWorkspaceUI } from '@/hooks/use-workspace-ui'
import { AppIcon } from '../AppIcon'
import { buttonPrimary, buttonSecondary, ConfirmDialog } from './ui'

/** Settings › Plan & billing controls. Each reads `useBilling()`; only a confirmation's open state is local. */

/** Opens the Plans dialog (Settings closes so it isn't stacked behind). */
export function PlanLink() {
  const { showUpgrade, can } = useBilling()
  const { openPlans } = useWorkspaceUI()
  if (showUpgrade) return <button type="button" onClick={openPlans} className={buttonPrimary}>Upgrade</button>
  if (can.changePlan) return <button type="button" onClick={openPlans} className={buttonSecondary}>Change plan</button>
  return null
}

export function ManageBillingButton() {
  const { manageBilling, busy } = useBilling()
  return <button type="button" disabled={busy} onClick={manageBilling} className={buttonSecondary}>Manage billing</button>
}

export function CancelPlanButton() {
  const { cancel, busy } = useBilling()
  const [confirming, setConfirming] = useState(false)
  return <>
    <button type="button" disabled={busy} onClick={() => setConfirming(true)} className={buttonSecondary}>Cancel plan</button>
    <ConfirmDialog open={confirming} onClose={() => setConfirming(false)} onConfirm={cancel} title="Cancel your plan?"
      body="You keep your plan until the end of the period you paid for, then move to Free. Nothing is deleted, and you can resume any time before it ends." confirmLabel="Cancel plan" destructive />
  </>
}

export function ResumePlanButton() {
  const { resume, busy } = useBilling()
  return <button type="button" disabled={busy} onClick={resume} className={buttonPrimary}>Resume plan</button>
}

export function RefundButton() {
  const { requestRefund, busy } = useBilling()
  const [confirming, setConfirming] = useState(false)
  return <>
    <button type="button" disabled={busy} onClick={() => setConfirming(true)} className={buttonSecondary}>Request a refund</button>
    <ConfirmDialog open={confirming} onClose={() => setConfirming(false)} onConfirm={requestRefund} title="Refund your last payment?"
      body="Available within 5 days of a payment. A refund ends your paid plan straight away and moves you to Free; your files are kept." confirmLabel="Refund and end plan" destructive />
  </>
}

export function MarketingEmailToggle() {
  const { marketingEmail } = useBilling()
  if (marketingEmail.value === null) return <span className="text-sm text-muted">—</span>
  return <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-muted">
    <input type="checkbox" checked={marketingEmail.value} disabled={marketingEmail.saving} onChange={(event) => marketingEmail.set(event.target.checked)} className="size-5 accent-button" />
    {marketingEmail.value ? 'On' : 'Off'}
  </label>
}

export function UsageValue({ value, reset, state }: { value: string; reset: string | null; state: 'ok' | 'near' | 'full' | 'unmetered' }) {
  return <span className="flex min-w-0 flex-col items-end text-right text-sm">
    <span className={state === 'full' ? 'font-semibold text-danger' : state === 'near' ? 'font-medium text-foreground' : 'text-muted'}>{value}</span>
    {reset ? <span className="text-xs text-muted">{reset}</span> : null}
  </span>
}

/** The outcome of the last billing action, above the rows. */
export function BillingMessage() {
  const { error, notice, dismiss } = useBilling()
  const message = error ?? notice
  return <div aria-live="polite">
    {message ? <div className={`mt-3 flex items-center justify-between gap-3 rounded-xl border px-4 py-1 text-sm text-foreground ${error ? 'border-danger bg-danger-surface' : 'border-default bg-surface'}`}>
      <span className="min-w-0 py-2">{message}</span>
      <button type="button" onClick={dismiss} aria-label="Dismiss" className="grid size-11 shrink-0 place-items-center rounded-lg text-muted hover:text-foreground"><AppIcon name="close" className="size-4" /></button>
    </div> : null}
  </div>
}
