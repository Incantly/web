import { describe, expect, it } from 'vitest'
import type { Subscription } from '@/lib/api/billing'
import { FALLBACK_PLANS, FREE_SUBSCRIPTION, cardAction, changeConfirmation, pricingVisitor, checkoutFromSearch, comparisonSections, currentPlanNote, formatLimit, formatPrice, orderedPlans, planPrice, signupHref, yearlySaving, type Visitor } from './pricingModel'

const [free, pro, max] = FALLBACK_PLANS.plans
const date = (iso: string) => iso.slice(0, 10)

function subscription(overrides: Partial<Subscription> = {}): Subscription {
  return { plan: 'FREE', planVersion: 1, status: 'free', source: 'DEFAULT', interval: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, pendingPlan: null, pendingChangeAt: null, graceUntil: null, entitledUntil: null, hasBillingAccount: false, ...overrides }
}
const signedIn = (overrides: Partial<Subscription> = {}, payments = true): Visitor => ({ kind: 'signed-in', subscription: subscription(overrides), payments })

describe('prices', () => {
  it('formats cents without decimals when whole', () => {
    expect(formatPrice(800)).toBe('$8')
    expect(formatPrice(750)).toBe('$7.50')
  })

  it('shows yearly as the per-month equivalent with the yearly total', () => {
    expect(planPrice(pro, 'year')).toEqual({ amount: '$6', period: '/month', billed: 'Billed $72 yearly' })
    expect(planPrice(max, 'month')).toEqual({ amount: '$20', period: '/month', billed: 'Billed monthly' })
    expect(planPrice(free, 'year').amount).toBe('$0')
  })

  it('works out the yearly saving', () => {
    expect(yearlySaving(FALLBACK_PLANS.plans)).toBe(25)
    expect(yearlySaving([free])).toBeNull()
  })
})

describe('limits', () => {
  it('formats each unit as the pricing doc says', () => {
    expect(formatLimit({ key: 'storage.bytes', unit: 'bytes', value: 20_000_000_000 })).toBe('20 GB')
    expect(formatLimit({ key: 'upload.documentMaxBytes', unit: 'bytes', value: 64_000_000 })).toBe('64 MB')
    expect(formatLimit({ key: 'transcription.minutes', unit: 'minutes', value: 600 })).toBe('10 hours')
    expect(formatLimit({ key: 'transcription.minutes', unit: 'minutes', value: 60 })).toBe('1 hour')
    expect(formatLimit({ key: 'history.retentionDays', unit: 'days', value: 30 })).toBe('30 days')
    expect(formatLimit({ key: 'upload.maxBatchFiles', unit: 'count', value: null })).toBe('Unlimited')
    expect(formatLimit({ key: 'collaboration.comments', unit: 'boolean', value: false })).toBe('–')
  })

  it('shows live co-editing as two-person hours and the reasoning tier as a tick', () => {
    expect(formatLimit({ key: 'collaboration.liveMinutes', unit: 'minutes', value: 900 })).toBe('about 7.5 hours')
    expect(formatLimit({ key: 'ai.maxTier', unit: 'enum', value: 'REASONING' })).toBe('✓')
    expect(formatLimit({ key: 'ai.maxTier', unit: 'enum', value: 'MEDIUM' })).toBe('–')
  })

  it('builds one column per plan and marks rows not launched yet', () => {
    const storage = comparisonSections(FALLBACK_PLANS.plans).find((section) => section.id === 'storage')!.rows[0]
    expect(storage).toEqual({ label: 'Storage', soon: true, values: ['1 GB', '20 GB', '100 GB'] })
    const missing = comparisonSections([{ ...pro, limits: [] }]).find((section) => section.id === 'history')!.rows[0]
    expect(missing.values).toEqual(['–'])
  })

  it('orders plans Free, Pro, Max whatever order the server sends', () => {
    expect(orderedPlans([max, free, pro]).map((plan) => plan.plan)).toEqual(['FREE', 'PRO', 'MAX'])
  })
})

describe('card buttons', () => {
  it('sends everyone to the waitlist while sign-up is closed', () => {
    expect(cardAction(pro, { kind: 'waitlist' }, 'year')).toEqual({ kind: 'waitlist', label: 'Join waitlist' })
  })

  it('offers sign-up when signed out', () => {
    expect(cardAction(free, { kind: 'signed-out' }, 'year')).toEqual({ kind: 'signup', label: 'Get started' })
    expect(cardAction(max, { kind: 'signed-out' }, 'year')).toEqual({ kind: 'signup', label: 'Get Max' })
  })

  it('upgrades a Free account through checkout', () => {
    expect(cardAction(free, signedIn(), 'year')).toEqual({ kind: 'current', label: 'Current plan' })
    expect(cardAction(pro, signedIn(), 'month')).toEqual({ kind: 'checkout', label: 'Upgrade to Pro', selection: { plan: 'pro', interval: 'month' } })
  })

  it('sends paid upgrades to Polar, switches down with a plan change, and downgrades to Free by cancelling', () => {
    const onPro = signedIn({ plan: 'PRO', status: 'active', source: 'BILLING', interval: 'year' })
    expect(cardAction(max, onPro, 'year')).toEqual({ kind: 'portal', label: 'Upgrade to Max' })
    expect(cardAction(free, onPro, 'year')).toEqual({ kind: 'downgrade', label: 'Downgrade' })
    const onMax = signedIn({ plan: 'MAX', status: 'active', source: 'BILLING', interval: 'year' })
    expect(cardAction(pro, onMax, 'year')).toMatchObject({ kind: 'change', label: 'Switch to Pro' })
  })

  it('offers the other billing period on the current plan: yearly is paid on Polar, monthly waits for renewal', () => {
    const onPro = signedIn({ plan: 'PRO', status: 'active', source: 'BILLING', interval: 'month' })
    expect(cardAction(pro, onPro, 'year')).toEqual({ kind: 'portal', label: 'Switch to yearly' })
    expect(cardAction(pro, onPro, 'month')).toEqual({ kind: 'current', label: 'Current plan' })
  })

  it('offers only Resume while a plan is ending', () => {
    const ending = signedIn({ plan: 'PRO', status: 'canceling', source: 'BILLING', interval: 'year' })
    expect(cardAction(pro, ending, 'year')).toEqual({ kind: 'resume', label: 'Resume plan' })
    expect(cardAction(max, ending, 'year')).toEqual({ kind: 'none' })
  })

  it('shows a scheduled downgrade instead of a button', () => {
    const switching = signedIn({ plan: 'MAX', status: 'active', source: 'BILLING', interval: 'year', pendingPlan: 'PRO', pendingChangeAt: '2026-12-01T00:00:00Z' })
    expect(cardAction(pro, switching, 'year', date)).toEqual({ kind: 'disabled', label: 'Starts 2026-12-01' })
  })

  it('hides payment buttons for plans Incantly assigned', () => {
    const tester = signedIn({ plan: 'PRO', status: 'active', source: 'TESTER' }, false)
    expect(cardAction(pro, tester, 'year')).toEqual({ kind: 'current', label: 'Current plan' })
    expect(cardAction(max, tester, 'year')).toEqual({ kind: 'none' })
    expect(cardAction(free, tester, 'year')).toEqual({ kind: 'none' })
  })
})

describe('current plan note', () => {
  it('says when the plan ends, changes or renews', () => {
    expect(currentPlanNote(subscription({ plan: 'PRO', status: 'canceling', currentPeriodEnd: '2026-12-01T00:00:00Z' }), date)).toBe('Ends on 2026-12-01')
    expect(currentPlanNote(subscription({ plan: 'MAX', status: 'active', pendingPlan: 'PRO', pendingChangeAt: '2026-12-01T00:00:00Z' }), date)).toBe('Switches to Pro on 2026-12-01')
    expect(currentPlanNote(subscription({ plan: 'PRO', status: 'active', currentPeriodEnd: '2026-12-01T00:00:00Z' }), date)).toBe('Renews on 2026-12-01')
    expect(currentPlanNote(subscription(), date)).toBeNull()
  })
})

describe('sign up, then checkout', () => {
  it('round-trips the wanted plan through sign-up', () => {
    const href = signupHref(pro, 'year')
    const next = new URL(href, 'https://incantly.test').searchParams.get('next')!
    expect(next).toBe('/pricing?plan=pro&interval=year')
    expect(checkoutFromSearch(new URL(next, 'https://incantly.test').search)).toEqual({ plan: 'pro', interval: 'year' })
    expect(signupHref(free, 'year')).toBe(`/auth/signup?next=${encodeURIComponent('/notes')}`)
  })

  it('ignores anything that is not a paid plan and period', () => {
    expect(checkoutFromSearch('?plan=free&interval=year')).toBeNull()
    expect(checkoutFromSearch('?plan=pro&interval=week')).toBeNull()
    expect(checkoutFromSearch('')).toBeNull()
  })
})

describe('who is visiting', () => {
  const base = { signInOpen: true, billing: true } as const

  it('never shows sign-up to someone who is signed in', () => {
    expect(pricingVisitor({ ...base, session: 'signed-in', subscription: { state: 'pending' } }).kind).toBe('checking')
    expect(pricingVisitor({ ...base, session: 'signed-in', subscription: { state: 'failed' } }).kind).toBe('checking')
    const paid = subscription({ plan: 'PRO', status: 'active', source: 'BILLING', interval: 'year' })
    const visitor = pricingVisitor({ ...base, session: 'signed-in', subscription: { state: 'ready', data: paid } })
    expect(visitor).toEqual({ kind: 'signed-in', subscription: paid, payments: true })
    expect(cardAction(pro, visitor, 'year')).toEqual({ kind: 'current', label: 'Current plan' })
    expect(cardAction(free, visitor, 'year')).toEqual({ kind: 'downgrade', label: 'Downgrade' })
  })

  it('treats a server without billing as Free with no payment buttons', () => {
    const visitor = pricingVisitor({ ...base, session: 'signed-in', subscription: { state: 'missing' } })
    expect(visitor).toEqual({ kind: 'signed-in', subscription: FREE_SUBSCRIPTION, payments: false })
    expect(cardAction(free, visitor, 'year').kind).toBe('current')
    expect(cardAction(pro, visitor, 'year')).toEqual({ kind: 'disabled', label: 'Upgrade to Pro' })
    expect(cardAction(max, visitor, 'year')).toEqual({ kind: 'disabled', label: 'Upgrade to Max' })
  })

  it('offers sign-up only when signed out, and the waitlist while sign-up is closed', () => {
    expect(pricingVisitor({ ...base, session: 'signed-out', subscription: { state: 'pending' } }).kind).toBe('signed-out')
    expect(pricingVisitor({ ...base, session: 'pending', subscription: { state: 'pending' } }).kind).toBe('checking')
    expect(pricingVisitor({ ...base, signInOpen: false, session: 'signed-in', subscription: { state: 'pending' } }).kind).toBe('waitlist')
  })

  it('hides payment buttons for plans Incantly assigned', () => {
    const tester = subscription({ plan: 'MAX', status: 'active', source: 'TESTER' })
    expect(pricingVisitor({ ...base, session: 'signed-in', subscription: { state: 'ready', data: tester } })).toMatchObject({ payments: false })
  })
})

describe('confirming a downgrade', () => {
  it('says a downgrade waits for renewal and charges nothing today', () => {
    const onMax = subscription({ plan: 'MAX', status: 'active', source: 'BILLING', interval: 'year', currentPeriodEnd: '2027-11-02T10:00:00Z' })
    const confirm = changeConfirmation(pro, onMax, { plan: 'pro', interval: 'year' }, date)
    expect(confirm).toEqual({
      title: 'Switch to Pro?',
      body: 'You keep your current plan until 2027-11-02, then move to Pro at $72 a year, plus applicable tax. Nothing is charged today.',
      confirmLabel: 'Switch at renewal',
    })
    expect(changeConfirmation(max, onMax, { plan: 'max', interval: 'month' }, date).title).toBe('Switch to Max monthly?')
  })
})
