'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createFeatureContext, useFeatureContext } from '@/components/product/features/createFeatureContext'
import {
  FALLBACK_PLANS, PLAN_COPY, cardAction, changeConfirmation, pricingVisitor, checkoutFromSearch, comparisonSections, currentPlanNote, orderedPlans, planPrice, shortDate, signupHref, yearlySaving,
  type CardAction, type ChangeConfirmation, type ComparisonSection, type PlanCopy, type PlanPrice, type Visitor,
} from '@/components/pricing/pricingModel'
import { billingApi, billingKeys, type BillingInterval, type Plan, type PlanId, type PlanSelection, type Subscription } from '@/lib/api/billing'
import { abortableSleep } from '@/lib/api/client'
import { ApiError, apiErrorMessage, isApiError } from '@/lib/api/errors'
import { newIdempotencyKey } from '@/lib/api/idempotency'
import { authClient } from '@/lib/auth-client'
import { signInOpen } from '@/lib/signIn'

export type PricingCard = {
  plan: Plan
  copy: PlanCopy
  price: PlanPrice
  action: CardAction
  /** Where a signed-out visitor's button goes. */
  signupHref: string
  current: boolean
  /** Renewal, end or scheduled change, under the current plan's button. */
  note: string | null
  /** For a paid plan change: what it will charge and when, confirmed before `choose` runs it. */
  confirm: ChangeConfirmation | null
  busy: boolean
}

export type PricingBanner = { kind: 'grace' | 'info'; text: string } | null

export type PricingValue = {
  interval: BillingInterval
  setInterval: (interval: BillingInterval) => void
  /** "Save 25%" on the yearly option; null when yearly saves nothing. */
  savingLabel: string | null
  cards: PricingCard[]
  sections: ComparisonSection[]
  /** Column headings for the comparison table, in card order. */
  planNames: string[]
  banner: PricingBanner
  /** A paid subscriber can open Polar's portal for invoices and card updates. */
  canManageBilling: boolean
  busy: boolean
  error: string | null
  notice: string | null
  dismissMessages: () => void
  /** Runs a card's checkout, upgrade (on Polar's portal), plan change or resume. Downgrades to Free go through `downgrade` after a confirmation. */
  choose: (plan: PlanId) => void
  downgrade: () => void
  manageBilling: () => void
}

export const PricingContext = createFeatureContext<PricingValue>('Pricing')

const CHECKOUT_PENDING_TRIES = 3

/**
 * `/v1/billing/*` for the pricing page: plans and prices, the visitor's plan, and every plan action
 * (checkout, change, cancel, resume, portal). Runs once, in `PricingProvider`.
 */
export function usePricingState(): PricingValue {
  const client = useQueryClient()
  const [interval, setInterval] = useState<BillingInterval>('year')
  const [busyPlan, setBusyPlan] = useState<PlanId | 'portal' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // Every billing POST answers 404 while the server has billing switched off.
  const [billingOff, setBillingOff] = useState(false)

  const open = signInOpen()
  const session = authClient.useSession()
  const user = open ? session.data?.user : undefined
  // Prices are public; the server copy replaces version 1 as soon as it arrives.
  const plansQuery = useQuery({ queryKey: billingKeys.plans, queryFn: ({ signal }) => billingApi.plans(signal), staleTime: 5 * 60_000, meta: { silentErrors: true } })
  const subscriptionQuery = useQuery({
    queryKey: billingKeys.subscription(user?.id ?? ''),
    queryFn: ({ signal }) => billingApi.subscription(signal),
    enabled: Boolean(user),
    meta: { silentErrors: true },
  })

  const plans = useMemo(() => orderedPlans((plansQuery.data ?? FALLBACK_PLANS).plans), [plansQuery.data])
  const subscriptionMissing = isApiError(subscriptionQuery.error) && subscriptionQuery.error.status === 404
  const visitor = useMemo<Visitor>(() => pricingVisitor({
    signInOpen: open,
    session: session.isPending ? 'pending' : user ? 'signed-in' : 'signed-out',
    subscription: {
      state: subscriptionQuery.data ? 'ready' : subscriptionMissing ? 'missing' : subscriptionQuery.isError ? 'failed' : 'pending',
      data: subscriptionQuery.data,
    },
    // Without the plans endpoint the server has no billing at all.
    billing: !billingOff && !plansQuery.isError,
  }), [open, session.isPending, user, subscriptionQuery.data, subscriptionQuery.isError, subscriptionMissing, billingOff, plansQuery.isError])
  // Signed in but the plan couldn't be read: say so rather than leave the buttons waiting silently.
  const planUnreadable = Boolean(user) && subscriptionQuery.isError && !subscriptionMissing

  const fail = useCallback((cause: unknown) => {
    if (isApiError(cause) && cause.status === 404) { setBillingOff(true); setError('Paid plans aren’t open yet. You can keep using Free.'); return }
    setError(apiErrorMessage(cause))
  }, [])

  const settle = useCallback((next: Subscription) => {
    if (user) client.setQueryData(billingKeys.subscription(user.id), next)
  }, [client, user])

  const startCheckout = useCallback(async (selection: PlanSelection) => {
    // One key per click, reused while an earlier attempt is still being confirmed.
    const key = newIdempotencyKey()
    for (let attempt = 1; ; attempt++) {
      try {
        const intent = await billingApi.checkout(selection, key)
        if (!intent.checkoutUrl) throw new ApiError(409, 'CHECKOUT_PENDING', null, null)
        window.location.assign(intent.checkoutUrl)
        return
      } catch (cause) {
        if (!isApiError(cause, 'CHECKOUT_PENDING') || attempt >= CHECKOUT_PENDING_TRIES) throw cause
        await abortableSleep((cause.retryAfterSeconds ?? 3) * 1000)
      }
    }
  }, [])

  const run = useCallback(async (plan: PlanId | 'portal', action: () => Promise<void>) => {
    setBusyPlan(plan)
    setError(null)
    setNotice(null)
    try { await action() } catch (cause) { fail(cause) } finally { setBusyPlan(null) }
  }, [fail])

  const choose = useCallback((planId: PlanId) => {
    const plan = plans.find((item) => item.plan === planId)
    if (!plan) return
    const action = cardAction(plan, visitor, interval)
    if (action.kind === 'checkout') void run(planId, () => startCheckout(action.selection))
    else if (action.kind === 'change') {
      void run(planId, async () => {
        const next = await billingApi.change(action.selection, newIdempotencyKey())
        settle(next)
        setNotice(next.pendingPlan ? `Your plan changes on ${next.pendingChangeAt ? shortDate(next.pendingChangeAt) : 'your next renewal'}.` : `You’re now on ${plan.name}.`)
      })
    } else if (action.kind === 'portal') {
      // Polar's portal shows the new price and takes the confirmation; its webhooks bring the change back here.
      void run(planId, async () => { window.location.assign((await billingApi.portal()).url) })
    } else if (action.kind === 'resume') {
      void run(planId, async () => { settle(await billingApi.resume()); setNotice('Your plan will keep renewing.') })
    }
  }, [plans, visitor, interval, run, startCheckout, settle])

  const downgrade = useCallback(() => {
    void run('FREE', async () => {
      const next = await billingApi.cancel()
      settle(next)
      setNotice(next.currentPeriodEnd ? `You keep your plan until ${shortDate(next.currentPeriodEnd)}, then move to Free.` : 'You’ll move to Free at the end of this period.')
    })
  }, [run, settle])

  const manageBilling = useCallback(() => {
    void run('portal', async () => { window.location.assign((await billingApi.portal()).url) })
  }, [run])

  // After "Get Pro" → sign up, the visitor lands back here with `?plan=pro&interval=year`: start that
  // checkout once. Clearing the query is the "once"; the timer keeps the request out of the effect body.
  useEffect(() => {
    if (visitor.kind !== 'signed-in') return
    const wanted = checkoutFromSearch(window.location.search)
    if (!wanted) return
    const timer = window.setTimeout(() => {
      window.history.replaceState(null, '', window.location.pathname)
      if (visitor.payments && visitor.subscription.plan === 'FREE') void run(wanted.plan === 'pro' ? 'PRO' : 'MAX', () => startCheckout(wanted))
    }, 0)
    return () => window.clearTimeout(timer)
  }, [visitor, run, startCheckout])

  return useMemo<PricingValue>(() => {
    const saving = yearlySaving(plans)
    const sub = visitor.kind === 'signed-in' ? visitor.subscription : null
    return {
      interval,
      setInterval,
      savingLabel: saving ? `Save ${saving}%` : null,
      cards: plans.map((plan) => {
        const current = sub?.plan === plan.plan
        const action = cardAction(plan, visitor, interval)
        return {
          plan,
          copy: PLAN_COPY[plan.plan],
          price: planPrice(plan, interval),
          action,
          signupHref: signupHref(plan, interval),
          current,
          note: current && sub ? currentPlanNote(sub) : null,
          confirm: action.kind === 'change' && sub ? changeConfirmation(plan, sub, action.selection) : null,
          busy: busyPlan === plan.plan,
        }
      }),
      sections: comparisonSections(plans),
      planNames: plans.map((plan) => plan.name),
      banner: visitor.kind === 'signed-in' && !visitor.payments && sub?.source !== 'TESTER' && sub?.source !== 'OPERATOR'
        ? { kind: 'info', text: 'Paid plans aren’t open on this server yet, so upgrades are switched off. Your Free plan works as usual.' }
        : sub?.status === 'grace' ? { kind: 'grace', text: `Your last payment failed. Update your card${sub.graceUntil ? ` by ${shortDate(sub.graceUntil)}` : ''} to keep ${sub.plan === 'MAX' ? 'Max' : 'Pro'}.` } : null,
      canManageBilling: Boolean(sub?.hasBillingAccount) && visitor.kind === 'signed-in' && visitor.payments,
      busy: busyPlan !== null,
      error: error ?? (planUnreadable ? 'We couldn’t load your plan. Refresh the page to try again.' : null),
      notice,
      dismissMessages: () => { setError(null); setNotice(null) },
      choose,
      downgrade,
      manageBilling,
    }
  }, [plans, visitor, interval, busyPlan, error, planUnreadable, notice, choose, downgrade, manageBilling])
}

/** The pricing page's plans, the visitor's plan and plan actions. Must be used inside `PricingProvider`. */
export function usePricing(): PricingValue {
  return useFeatureContext(PricingContext)
}
