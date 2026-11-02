'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createFeatureContext, useFeatureContext } from '@/components/product/features/createFeatureContext'
import { useCurrentUser } from '@/components/product/SessionGate'
import { offersUpgrade, paysThroughBilling, planLabel, planName, planStatus, refundMessage, usageReset, usageValue } from '@/components/product/workspace/billingModel'
import { billingApi, billingKeys, type Subscription } from '@/lib/api/billing'
import { apiErrorMessage, isApiError } from '@/lib/api/errors'
import { newIdempotencyKey } from '@/lib/api/idempotency'
import { poll } from '@/lib/api/poll'
import { useWorkspaceUI } from '@/hooks/use-workspace-ui'

export type UsageRow = { key: string; label: string; value: string; reset: string | null; state: 'ok' | 'near' | 'full' | 'unmetered' }

export type BillingValue = {
  /** False until the subscription loads, and when the server has no billing at all. */
  ready: boolean
  /** "Pro". */
  planName: string
  /** "Pro · yearly". */
  planLabel: string
  /** Renewal, end date, scheduled change or failed payment. */
  planStatus: string
  /** The plan needs attention: a failed payment. */
  warning: boolean
  /** Free accounts see Upgrade in the sidebar and Settings; it opens the Plans dialog. */
  showUpgrade: boolean
  /** Self-serve actions, each shown only when it applies. */
  can: { changePlan: boolean; manage: boolean; cancel: boolean; resume: boolean; refund: boolean }
  usage: { rows: UsageRow[]; loading: boolean; failed: boolean }
  marketingEmail: { value: boolean | null; saving: boolean; set: (value: boolean) => void }
  busy: boolean
  error: string | null
  notice: string | null
  dismiss: () => void
  manageBilling: () => void
  cancel: () => void
  resume: () => void
  /** Ends paid access at once; the UI confirms first. */
  requestRefund: () => void
}

export const BillingContext = createFeatureContext<BillingValue>('Billing')

const USAGE_POLL_MS = 60_000

/**
 * `/v1/billing/*` and `/v1/email-preferences` in the workspace: the user's plan, usage meters and
 * self-serve billing (portal, cancel, resume, refund). Upgrades and plan changes happen on `/pricing`.
 * Runs once, in `BillingProvider`.
 */
export function useBillingState(): BillingValue {
  const user = useCurrentUser()
  const client = useQueryClient()
  const { settingsOpen } = useWorkspaceUI()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [billingOff, setBillingOff] = useState(false)
  const stop = useRef<AbortController | null>(null)
  useEffect(() => () => stop.current?.abort(), [])

  const subscription = useQuery({ queryKey: billingKeys.subscription(user.id), queryFn: ({ signal }) => billingApi.subscription(signal), staleTime: 60_000, meta: { silentErrors: true } })
  // Meters only matter while Settings shows them; at most one read a minute.
  const usage = useQuery({ queryKey: billingKeys.usage(user.id), queryFn: ({ signal }) => billingApi.usage(signal), enabled: settingsOpen && subscription.isSuccess, refetchInterval: settingsOpen ? USAGE_POLL_MS : false, staleTime: USAGE_POLL_MS, meta: { silentErrors: true } })
  const emails = useQuery({ queryKey: billingKeys.emailPreferences(user.id), queryFn: ({ signal }) => billingApi.emailPreferences(signal), enabled: settingsOpen, meta: { silentErrors: true } })
  const saveEmails = useMutation({
    mutationFn: billingApi.setEmailPreferences,
    onSuccess: (next) => client.setQueryData(billingKeys.emailPreferences(user.id), next),
  })

  const settle = useCallback((next: Subscription) => {
    client.setQueryData(billingKeys.subscription(user.id), next)
    void client.invalidateQueries({ queryKey: billingKeys.usage(user.id) })
  }, [client, user.id])

  const run = useCallback(async (action: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try { await action() } catch (cause) {
      // Every billing POST answers 404 while the server has billing switched off.
      if (isApiError(cause) && cause.status === 404) { setBillingOff(true); setError('Billing isn’t available right now.') }
      else setError(apiErrorMessage(cause))
    } finally { setBusy(false) }
  }, [])

  const manageBilling = useCallback(() => {
    // A fresh link per click, opened at once and never kept.
    void run(async () => { window.location.assign((await billingApi.portal()).url) })
  }, [run])

  const cancel = useCallback(() => {
    void run(async () => {
      const next = await billingApi.cancel()
      settle(next)
      setNotice(next.currentPeriodEnd ? `Your plan ends on ${new Date(next.currentPeriodEnd).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}. You keep everything until then.` : 'Your plan ends at the end of this period.')
    })
  }, [run, settle])

  const resume = useCallback(() => {
    void run(async () => { settle(await billingApi.resume()); setNotice('Your plan will keep renewing.') })
  }, [run, settle])

  const requestRefund = useCallback(() => {
    void run(async () => {
      const accepted = await billingApi.refund(newIdempotencyKey())
      setNotice(refundMessage(accepted.state, accepted.amountCents))
      stop.current?.abort()
      stop.current = new AbortController()
      const done = await poll(() => billingApi.refundStatus(accepted.refundId, stop.current?.signal), (refund) => refund.state !== 'pending', { signal: stop.current.signal, startMs: 2000 })
      setNotice(refundMessage(done.state, done.amountCents))
      await client.invalidateQueries({ queryKey: ['billing'] })
    })
  }, [run, client])

  const setMarketingEmail = useCallback((value: boolean) => { saveEmails.mutate({ marketingEmail: value }) }, [saveEmails])

  return useMemo<BillingValue>(() => {
    const sub = subscription.data
    // A server without billing has no subscription route at all.
    const noBilling = isApiError(subscription.error) && subscription.error.status === 404
    const payments = Boolean(sub && paysThroughBilling(sub)) && !billingOff
    const paid = Boolean(sub && sub.plan !== 'FREE')
    return {
      ready: Boolean(sub),
      planName: sub ? planName(sub.plan) : '',
      planLabel: sub ? planLabel(sub) : noBilling ? 'Free' : subscription.isError ? 'Unavailable' : 'Checking…',
      planStatus: sub ? planStatus(sub) : noBilling ? 'Paid plans aren’t open yet.' : subscription.isError ? 'We couldn’t load your plan.' : '',
      warning: sub?.status === 'grace',
      showUpgrade: !billingOff && offersUpgrade(sub),
      can: {
        changePlan: !billingOff && Boolean(sub) && sub?.source !== 'TESTER' && sub?.source !== 'OPERATOR' && sub?.status !== 'canceling',
        manage: payments && Boolean(sub?.hasBillingAccount),
        cancel: payments && paid && (sub?.status === 'active' || sub?.status === 'trialing' || sub?.status === 'grace'),
        resume: payments && sub?.status === 'canceling',
        refund: payments && paid && sub?.status !== 'canceling',
      },
      usage: {
        rows: (usage.data?.items ?? []).map((item) => ({ key: item.key, label: item.label, value: usageValue(item), reset: usageReset(item), state: item.state })),
        loading: usage.isPending && usage.fetchStatus !== 'idle',
        failed: usage.isError,
      },
      marketingEmail: { value: emails.data?.marketingEmail ?? null, saving: saveEmails.isPending, set: setMarketingEmail },
      busy,
      error,
      notice,
      dismiss: () => { setError(null); setNotice(null) },
      manageBilling,
      cancel,
      resume,
      requestRefund,
    }
  }, [subscription.data, subscription.isError, subscription.error, usage.data, usage.isPending, usage.fetchStatus, usage.isError, emails.data, saveEmails.isPending, setMarketingEmail, billingOff, busy, error, notice, manageBilling, cancel, resume, requestRefund])
}

/** The user's plan, usage and billing actions. Must be used inside `WorkspaceProviders`. */
export function useBilling(): BillingValue {
  return useFeatureContext(BillingContext)
}

