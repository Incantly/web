import type { PlanId, Subscription, UsageItem } from '@/lib/api/billing'
import { formatLimit, formatPrice, shortDate } from '../../pricing/pricingModel'

/** Pure labels for the workspace's plan and billing UI (Settings › Plan & billing, the sidebar). */

export const planName = (plan: PlanId) => (plan === 'MAX' ? 'Max' : plan === 'PRO' ? 'Pro' : 'Free')

/** Self-serve payment actions only for plans bought through billing; testers and operators get theirs from Incantly. */
export const paysThroughBilling = (sub: Subscription) => sub.source === 'BILLING'

/** "Pro · yearly", "Free". */
export function planLabel(sub: Subscription): string {
  const name = planName(sub.plan)
  return sub.plan !== 'FREE' && sub.interval ? `${name} · ${sub.interval === 'year' ? 'yearly' : 'monthly'}` : name
}

/** One sentence on where the plan stands: renewal, end, scheduled change, failed payment or who assigned it. */
export function planStatus(sub: Subscription, formatDate: (iso: string) => string = shortDate): string {
  if (sub.source === 'TESTER' || sub.source === 'OPERATOR') return 'Assigned by Incantly.'
  if (sub.status === 'grace') return `Your last payment failed. Update your card${sub.graceUntil ? ` by ${formatDate(sub.graceUntil)}` : ''} to keep ${planName(sub.plan)}.`
  if (sub.status === 'canceling') return sub.currentPeriodEnd ? `Ends on ${formatDate(sub.currentPeriodEnd)}, then moves to Free. Nothing is deleted.` : 'Ends at the end of this period, then moves to Free.'
  if (sub.pendingPlan && sub.pendingChangeAt) return `Switches to ${planName(sub.pendingPlan)} on ${formatDate(sub.pendingChangeAt)}.`
  if (sub.plan === 'FREE') return 'Upgrade for more AI, storage, transcription and sharing.'
  return sub.currentPeriodEnd ? `Renews on ${formatDate(sub.currentPeriodEnd)}.` : 'Renews automatically.'
}

/** The sidebar offers Upgrade to Free accounts whose plan isn't assigned by Incantly. */
export function offersUpgrade(sub: Subscription | undefined): boolean {
  return Boolean(sub && sub.plan === 'FREE' && sub.source !== 'TESTER' && sub.source !== 'OPERATOR')
}

const amount = (unit: UsageItem['unit'], value: number) => formatLimit({ key: '', unit: unit === 'usd' ? 'count' : unit, value })

/**
 * "42% used · 4.2 GB of 10 GB" (server percentages only, never computed here; AI never shows amounts).
 * Unbuilt meters say so instead of a number.
 */
export function usageValue(item: UsageItem): string {
  if (item.state === 'unmetered' || item.percentUsed === null) return 'Coming soon'
  const of = item.unit !== 'usd' && item.used !== null && item.limit !== null ? ` · ${amount(item.unit, item.used)} of ${amount(item.unit, item.limit)}` : ''
  return `${item.percentUsed}% used${of}`
}

/** "Resets Thu 14:20", or nothing for limits that don't reset (storage). */
export function usageReset(item: UsageItem, now: Date = new Date()): string | null {
  if (!item.resetsAt || item.state === 'unmetered') return null
  const date = new Date(item.resetsAt)
  if (Number.isNaN(date.getTime())) return null
  const within = date.getTime() - now.getTime() < 6 * 24 * 3600_000
  const day = within ? date.toLocaleDateString('en-GB', { weekday: 'short' }) : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  return `Resets ${day} ${date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
}

/** What a refund request turned into. */
export function refundMessage(state: 'pending' | 'confirmed' | 'failed', amountCents: number): string {
  if (state === 'confirmed') return `Refunded ${formatPrice(amountCents)}. Your account is on Free now; your files are kept.`
  if (state === 'failed') return 'The refund didn’t go through. Contact support and we’ll sort it out.'
  return `Refunding ${formatPrice(amountCents)}…`
}
