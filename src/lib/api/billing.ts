import { apiFetch } from './client'

// Billing is not in `openapi.json` yet (the backend ships it on `feat/billing-polar`), so these types
// mirror its `billing.dto.ts`. Swap them for `Schema<'PlanDto'>` etc. after the next `npm run api:types`.

export type PlanId = 'FREE' | 'PRO' | 'MAX'
export type PaidPlan = 'pro' | 'max'
export type BillingInterval = 'month' | 'year'

export type PlanLimit = {
  key: string
  label: string
  unit: 'bytes' | 'minutes' | 'count' | 'days' | 'boolean' | 'enum'
  /** `null` means unlimited. */
  value: number | boolean | string | null
}

export type Plan = {
  plan: PlanId
  name: string
  /** Cents, before tax. Free has neither. */
  prices: { month?: number; year?: number }
  currency: string
  taxIncluded: boolean
  limits: PlanLimit[]
}

export type Plans = { planVersion: number; plans: Plan[] }

export type Subscription = {
  plan: PlanId
  planVersion: number
  status: 'free' | 'active' | 'trialing' | 'canceling' | 'grace'
  /** `TESTER` and `OPERATOR` plans are assigned by Incantly: no payment actions. */
  source: 'DEFAULT' | 'TESTER' | 'OPERATOR' | 'BILLING'
  interval: BillingInterval | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  /** A downgrade scheduled for the next renewal. */
  pendingPlan: 'PRO' | 'MAX' | null
  pendingChangeAt: string | null
  graceUntil: string | null
  entitledUntil: string | null
  hasBillingAccount: boolean
}

export type CheckoutIntent = {
  intentId: string
  state: 'CREATING' | 'UNKNOWN' | 'OPEN' | 'SUCCEEDED' | 'EXPIRED' | 'FAILED' | 'SUPERSEDED'
  plan: 'PRO' | 'MAX'
  interval: BillingInterval
  /** Polar's hosted checkout, only while `OPEN`. Never build it yourself. */
  checkoutUrl: string | null
  expiresAt: string | null
  currentPlan: PlanId
}

export type PlanSelection = { plan: PaidPlan; interval: BillingInterval }

export type UsageItem = {
  key: string
  label: string
  unit: 'usd' | 'bytes' | 'minutes' | 'count'
  /** 0–100, rounded down by the server; null until that meter exists. Never compute it locally. */
  percentUsed: number | null
  state: 'ok' | 'near' | 'full' | 'unmetered'
  resetsAt: string | null
  /** Omitted (null) for AI (`usd`) keys: AI is only ever shown as a percentage. */
  used: number | null
  limit: number | null
}

export type Usage = { plan: PlanId; items: UsageItem[]; upgrade: { plan: PlanId } | null }

export type Refund = { refundId: string; state: 'pending' | 'confirmed' | 'failed'; amountCents: number; currency: string }

export type EmailPreferences = { marketingEmail: boolean }

/** React Query keys shared by the pricing page and the workspace, so a change in one shows in the other. */
export const billingKeys = {
  plans: ['billing', 'plans'] as const,
  subscription: (userId: string) => ['billing', 'subscription', userId] as const,
  usage: (userId: string) => ['billing', 'usage', userId] as const,
  emailPreferences: (userId: string) => ['email-preferences', userId] as const,
}

const id = (value: string) => encodeURIComponent(value)

/**
 * `/v1/billing/*` (frontend-api-integration.md, "Plans and billing API"). The browser never sends a
 * price or decides access; it shows what these return. Every POST answers 404 while billing is off.
 */
export const billingApi = {
  /** Public. Prices and limits for the pricing page. */
  async plans(signal?: AbortSignal) {
    return (await apiFetch<Plans>('/v1/billing/plans', { signal })).data
  },
  async subscription(signal?: AbortSignal) {
    return (await apiFetch<Subscription>('/v1/billing/subscription', { signal })).data
  },
  /** Free → paid. One key per Upgrade click; `CHECKOUT_PENDING` is retried with the same key. */
  async checkout(body: PlanSelection, idempotencyKey: string) {
    return (await apiFetch<CheckoutIntent>('/v1/billing/checkout', { method: 'POST', body, idempotencyKey, maxAttempts: 3 })).data
  },
  async checkoutIntent(intentId: string, signal?: AbortSignal) {
    return (await apiFetch<CheckoutIntent>(`/v1/billing/checkout/${id(intentId)}`, { signal })).data
  },
  /** Pro ↔ Max or monthly ↔ yearly. Upgrades charge now; downgrades apply at renewal. */
  async change(body: PlanSelection, idempotencyKey: string) {
    return (await apiFetch<Subscription>('/v1/billing/subscription/change', { method: 'POST', body, idempotencyKey, maxAttempts: 2 })).data
  },
  /** Back to Free at the end of the paid period. Safe to repeat. */
  async cancel() {
    return (await apiFetch<Subscription>('/v1/billing/subscription/cancel', { method: 'POST', body: {}, maxAttempts: 2 })).data
  },
  async resume() {
    return (await apiFetch<Subscription>('/v1/billing/subscription/resume', { method: 'POST', maxAttempts: 2 })).data
  },
  /** A fresh customer-portal link per click; open it at once, never store it. */
  async portal() {
    return (await apiFetch<{ url: string; expiresAt: string }>('/v1/billing/portal', { method: 'POST', maxAttempts: 2 })).data
  },
  /** Percent used and reset time per shown limit. Poll at most once a minute. */
  async usage(signal?: AbortSignal) {
    return (await apiFetch<Usage>('/v1/billing/usage', { signal })).data
  },
  /** Refunds the latest charge (within 5 days) and ends paid access at once. One key per confirmed request. */
  async refund(idempotencyKey: string) {
    return (await apiFetch<Refund>('/v1/billing/refunds', { method: 'POST', idempotencyKey, maxAttempts: 2 })).data
  },
  async refundStatus(refundId: string, signal?: AbortSignal) {
    return (await apiFetch<Refund>(`/v1/billing/refunds/${id(refundId)}`, { signal })).data
  },
  async emailPreferences(signal?: AbortSignal) {
    return (await apiFetch<EmailPreferences>('/v1/email-preferences', { signal })).data
  },
  /** Only ever set `marketingEmail: true` from an explicit user action. */
  async setEmailPreferences(body: EmailPreferences) {
    return (await apiFetch<EmailPreferences>('/v1/email-preferences', { method: 'PUT', body })).data
  },
}
