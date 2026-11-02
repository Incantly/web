'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { billingApi } from '@/lib/api/billing'

const POLL_MS = 2_500
const PATIENCE_MS = 30_000

export type CheckoutStatus =
  | { kind: 'missing' }
  | { kind: 'confirming' }
  /** Paid, but the plan hasn't switched within 30 s; the webhook will land it. */
  | { kind: 'slow' }
  | { kind: 'active'; planName: string }
  | { kind: 'failed' }

/**
 * After Polar returns to `/billing/success?intent=…`. The redirect grants nothing: poll the intent
 * every 2.5 s until the account is on the new plan, then refresh the subscription. No shared state,
 * so no provider.
 */
export function useCheckoutStatus(): CheckoutStatus {
  const client = useQueryClient()
  const [intentId] = useState(() => new URLSearchParams(window.location.search).get('intent'))
  const [patient, setPatient] = useState(true)
  useEffect(() => {
    const timer = window.setTimeout(() => setPatient(false), PATIENCE_MS)
    return () => window.clearTimeout(timer)
  }, [])

  const intent = useQuery({
    queryKey: ['billing', 'checkout', intentId],
    queryFn: ({ signal }) => billingApi.checkoutIntent(intentId ?? '', signal),
    enabled: Boolean(intentId),
    // Fast while waiting, then occasionally until it lands.
    refetchInterval: (query) => (query.state.data && query.state.data.currentPlan === query.state.data.plan ? false : patient ? POLL_MS : 15_000),
    meta: { silentErrors: true },
  })
  const data = intent.data
  const active = Boolean(data && data.currentPlan === data.plan)
  useEffect(() => { if (active) void client.invalidateQueries({ queryKey: ['billing', 'subscription'] }) }, [active, client])

  if (!intentId) return { kind: 'missing' }
  if (active && data) return { kind: 'active', planName: data.plan === 'MAX' ? 'Max' : 'Pro' }
  if (intent.isError || data?.state === 'FAILED' || data?.state === 'EXPIRED') return { kind: 'failed' }
  return patient ? { kind: 'confirming' } : { kind: 'slow' }
}
