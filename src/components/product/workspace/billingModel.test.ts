import { describe, expect, it } from 'vitest'
import type { Subscription, UsageItem } from '@/lib/api/billing'
import { offersUpgrade, planLabel, planStatus, refundMessage, usageReset, usageValue } from './billingModel'

const date = (iso: string) => iso.slice(0, 10)

function subscription(overrides: Partial<Subscription> = {}): Subscription {
  return { plan: 'FREE', planVersion: 1, status: 'free', source: 'DEFAULT', interval: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, pendingPlan: null, pendingChangeAt: null, graceUntil: null, entitledUntil: null, hasBillingAccount: false, ...overrides }
}

function item(overrides: Partial<UsageItem> = {}): UsageItem {
  return { key: 'storage.bytes', label: 'Storage', unit: 'bytes', percentUsed: 42, state: 'ok', resetsAt: null, used: 4_200_000_000, limit: 10_000_000_000, ...overrides }
}

describe('plan labels', () => {
  it('names the plan and its billing period', () => {
    expect(planLabel(subscription())).toBe('Free')
    expect(planLabel(subscription({ plan: 'PRO', interval: 'year' }))).toBe('Pro · yearly')
    expect(planLabel(subscription({ plan: 'MAX', interval: 'month' }))).toBe('Max · monthly')
  })

  it('says where the plan stands', () => {
    const paid = { plan: 'PRO' as const, source: 'BILLING' as const, currentPeriodEnd: '2026-12-01T00:00:00Z' }
    expect(planStatus(subscription({ ...paid, status: 'active' }), date)).toBe('Renews on 2026-12-01.')
    expect(planStatus(subscription({ ...paid, status: 'canceling' }), date)).toBe('Ends on 2026-12-01, then moves to Free. Nothing is deleted.')
    expect(planStatus(subscription({ ...paid, status: 'grace', graceUntil: '2026-11-04T00:00:00Z' }), date)).toBe('Your last payment failed. Update your card by 2026-11-04 to keep Pro.')
    expect(planStatus(subscription({ plan: 'MAX', status: 'active', source: 'BILLING', pendingPlan: 'PRO', pendingChangeAt: '2026-12-01T00:00:00Z' }), date)).toBe('Switches to Pro on 2026-12-01.')
    expect(planStatus(subscription({ plan: 'PRO', source: 'TESTER' }), date)).toBe('Assigned by Incantly.')
  })

  it('offers Upgrade only to Free accounts Incantly did not assign', () => {
    expect(offersUpgrade(subscription())).toBe(true)
    expect(offersUpgrade(subscription({ plan: 'PRO', status: 'active', source: 'BILLING' }))).toBe(false)
    expect(offersUpgrade(subscription({ source: 'OPERATOR' }))).toBe(false)
    expect(offersUpgrade(undefined)).toBe(false)
  })
})

describe('usage', () => {
  it('shows the server percentage with amounts, but never amounts for AI', () => {
    expect(usageValue(item())).toBe('42% used · 4.2 GB of 10 GB')
    expect(usageValue(item({ key: 'ai.weekly', label: 'AI usage this week', unit: 'usd', percentUsed: 7, used: null, limit: null }))).toBe('7% used')
  })

  it('marks meters that are not built yet', () => {
    expect(usageValue(item({ state: 'unmetered', percentUsed: null }))).toBe('Coming soon')
    expect(usageReset(item({ state: 'unmetered', resetsAt: '2026-11-05T14:20:00Z' }))).toBeNull()
  })

  it('says when a meter resets, and nothing for one that does not', () => {
    expect(usageReset(item())).toBeNull()
    expect(usageReset(item({ resetsAt: '2026-11-05T14:20:00Z' }), new Date('2026-11-02T10:00:00Z'))).toMatch(/^Resets \w{3} \d{2}:\d{2}$/)
  })
})

describe('refunds', () => {
  it('describes each refund state', () => {
    expect(refundMessage('pending', 800)).toBe('Refunding $8…')
    expect(refundMessage('confirmed', 7200)).toBe('Refunded $72. Your account is on Free now; your files are kept.')
    expect(refundMessage('failed', 800)).toMatch(/didn’t go through/)
  })
})
