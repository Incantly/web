import type { BillingInterval, PaidPlan, Plan, PlanId, PlanLimit, Plans, Subscription } from '@/lib/api/billing'

/**
 * The pricing page's pure rules: prices, the comparison table and which button each card shows.
 * Numbers come from `GET /v1/billing/plans`; the copy follows the backend's `docs/pricing-page.md`.
 */

export const PLAN_ORDER: PlanId[] = ['FREE', 'PRO', 'MAX']

/** Plan version 1, shown until `GET /v1/billing/plans` answers (or if it can't), so the page never renders empty. */
export const FALLBACK_PLANS: Plans = {
  planVersion: 1,
  plans: [
    fallbackPlan('FREE', 'Free', {}, [1e9, 20e6, 50e6, 5, 2, 60, 1, 120, false, 3, 'MEDIUM', 1]),
    fallbackPlan('PRO', 'Pro', { month: 800, year: 7200 }, [20e9, 64e6, 200e6, 20, 5, 600, 10, 900, true, 30, 'MEDIUM', 2]),
    fallbackPlan('MAX', 'Max', { month: 2000, year: 18000 }, [100e9, 64e6, 200e6, 50, 10, 1500, 10, 2400, true, 90, 'REASONING', 3]),
  ],
}

function fallbackPlan(plan: PlanId, name: string, prices: Plan['prices'], values: PlanLimit['value'][]): Plan {
  const keys = ['storage.bytes', 'upload.documentMaxBytes', 'upload.audioMaxBytes', 'upload.maxBatchFiles', 'upload.maxConcurrent', 'transcription.minutes', 'collaboration.collaborators', 'collaboration.liveMinutes', 'collaboration.comments', 'history.retentionDays', 'ai.maxTier', 'ai.maxRunningJobs'] as const
  const units: Record<(typeof keys)[number], PlanLimit['unit']> = {
    'storage.bytes': 'bytes', 'upload.documentMaxBytes': 'bytes', 'upload.audioMaxBytes': 'bytes', 'upload.maxBatchFiles': 'count', 'upload.maxConcurrent': 'count',
    'transcription.minutes': 'minutes', 'collaboration.collaborators': 'count', 'collaboration.liveMinutes': 'minutes', 'collaboration.comments': 'boolean',
    'history.retentionDays': 'days', 'ai.maxTier': 'enum', 'ai.maxRunningJobs': 'count',
  }
  return { plan, name, prices, currency: 'usd', taxIncluded: false, limits: keys.map((key, index) => ({ key, label: key, unit: units[key], value: values[index] })) }
}

export type PlanCopy = { tagline: string; popular: boolean; lead: string | null; features: string[] }

export const PLAN_COPY: Record<PlanId, PlanCopy> = {
  FREE: {
    tagline: 'Try Incantly',
    popular: false,
    lead: null,
    features: ['Unlimited flashcards and quizzes', 'AI note assistant and answers, light use', '1 GB storage', '1 hour of lecture transcription a month', 'Share a note with 1 person', '3 days of version history'],
  },
  PRO: {
    tagline: 'For everyday studying',
    popular: true,
    lead: 'Everything in Free, plus:',
    features: ['About 7× more AI per session, 12× per week', '20 GB storage, 64 MB PDFs, 200 MB audio', '10 hours of lecture transcription a month', 'Share notes with up to 10 people, with comments', 'About 7.5 hours of live co-editing a month', '30 days of version history'],
  },
  MAX: {
    tagline: 'For heavy study and teams of study partners',
    popular: false,
    lead: 'Everything in Pro, plus:',
    features: ['The most AI usage (about 2.5× Pro)', 'Most capable AI models for hard problems', '100 GB storage', '25 hours of lecture transcription a month', 'About 20 hours of live co-editing a month', '90 days of version history'],
  },
}

/** "$8", or "$7.50" when the amount isn't whole. Prices arrive in cents. */
export function formatPrice(cents: number): string {
  const dollars = cents / 100
  return `$${Number.isInteger(dollars) ? dollars : dollars.toFixed(2)}`
}

export type PlanPrice = { amount: string; period: string; billed: string }

/** What a card shows for the chosen interval. Yearly shows the per-month equivalent. */
export function planPrice(plan: Plan, interval: BillingInterval): PlanPrice {
  const { month, year } = plan.prices
  if (!month && !year) return { amount: '$0', period: '/month', billed: 'Free forever' }
  if (interval === 'year' && year) return { amount: formatPrice(year / 12), period: '/month', billed: `Billed ${formatPrice(year)} yearly` }
  return { amount: formatPrice(month ?? 0), period: '/month', billed: 'Billed monthly' }
}

/** Percent saved by paying yearly, across the paid plans ("25"); null when there's no saving. */
export function yearlySaving(plans: Plan[]): number | null {
  const savings = plans.flatMap(({ prices: { month, year } }) => (month && year ? [Math.round((1 - year / (month * 12)) * 100)] : []))
  const best = Math.max(0, ...savings)
  return best > 0 ? best : null
}

const bytes = (value: number) => (value >= 1e9 ? `${+(value / 1e9).toFixed(1)} GB` : `${+(value / 1e6).toFixed(1)} MB`)
const hours = (value: number) => `${+value.toFixed(1)} ${value === 1 ? 'hour' : 'hours'}`

/** A limit value as the comparison table shows it (pricing-page.md, "Formatting rules"). */
export function formatLimit(limit: Pick<PlanLimit, 'key' | 'unit' | 'value'>): string {
  const { key, unit, value } = limit
  if (value === null) return 'Unlimited'
  if (key === 'ai.maxTier') return value === 'REASONING' ? '✓' : '–'
  // Counted only while two people edit together, so shown as two-person hours.
  if (key === 'collaboration.liveMinutes' && typeof value === 'number') return `about ${hours(value / 120)}`
  if (typeof value === 'boolean') return value ? '✓' : '–'
  if (typeof value !== 'number') return String(value)
  if (unit === 'bytes') return bytes(value)
  if (unit === 'minutes') return value >= 60 ? hours(value / 60) : `${value} min`
  if (unit === 'days') return `${value} ${value === 1 ? 'day' : 'days'}`
  return value.toLocaleString('en-US')
}

export type ComparisonRow = { label: string; values: string[]; soon: boolean }
export type ComparisonSection = { id: string; title: string; note: string | null; rows: ComparisonRow[] }

type RowSpec = { label: string; soon: boolean } & ({ key: string } | { values: string[] })

// Rows the backend has configured but not launched carry `soon` (pricing-page.md, "Launch status").
const sections: { id: string; title: string; note: string | null; rows: RowSpec[] }[] = [
  {
    id: 'ai', title: 'AI study tools', note: 'AI usage is shown as a percentage and resets every 4 hours and every week. Fair-use limits stop automated abuse; normal studying never hits them.',
    rows: [
      { label: 'Flashcards, quizzes and practice questions', values: ['Unlimited', 'Unlimited', 'Unlimited'], soon: false },
      { label: 'Note assistant, answers, study guides and research', values: ['Light use', 'More usage', 'Most usage'], soon: false },
      { label: 'AI usage per 4-hour session', values: ['Standard', 'About 7× Free', 'About 20× Free'], soon: true },
      { label: 'AI usage per week', values: ['Standard', 'About 12× Free', 'About 30× Free'], soon: true },
      { label: 'Most capable AI models', key: 'ai.maxTier', soon: true },
      { label: 'AI tasks running at once', key: 'ai.maxRunningJobs', soon: true },
    ],
  },
  {
    id: 'storage', title: 'Uploads and storage', note: null,
    rows: [
      { label: 'Storage', key: 'storage.bytes', soon: true },
      { label: 'Largest PDF or document', key: 'upload.documentMaxBytes', soon: true },
      { label: 'Largest audio file', key: 'upload.audioMaxBytes', soon: true },
      { label: 'Files per upload batch', key: 'upload.maxBatchFiles', soon: true },
      { label: 'Uploads at the same time', key: 'upload.maxConcurrent', soon: true },
    ],
  },
  {
    id: 'transcription', title: 'Lecture transcription', note: 'Turn lecture recordings into searchable notes.',
    rows: [{ label: 'Audio transcription per month', key: 'transcription.minutes', soon: true }],
  },
  {
    id: 'sharing', title: 'Sharing and collaboration', note: 'Live co-editing counts only while two or more people edit the same note together. When it runs out, notes still save, just not live.',
    rows: [
      { label: 'People you can share a note with', key: 'collaboration.collaborators', soon: true },
      { label: 'Live co-editing per month', key: 'collaboration.liveMinutes', soon: true },
      { label: 'Comments on shared notes', key: 'collaboration.comments', soon: true },
    ],
  },
  {
    id: 'history', title: 'History', note: null,
    rows: [{ label: 'Version history', key: 'history.retentionDays', soon: true }],
  },
]

/** The comparison table, one column per plan in `plans` order. A row whose limit a plan lacks shows "–". */
export function comparisonSections(plans: Plan[]): ComparisonSection[] {
  return sections.map((section) => ({
    ...section,
    rows: section.rows.map((row) => ({
      label: row.label,
      soon: row.soon,
      values: 'values' in row ? row.values : plans.map((plan) => {
        const limit = plan.limits.find((item) => item.key === row.key)
        return limit ? formatLimit(limit) : '–'
      }),
    })),
  }))
}

/** Plans in display order, skipping any the server doesn't send. */
export function orderedPlans(plans: Plan[]): Plan[] {
  return PLAN_ORDER.flatMap((id) => plans.filter((plan) => plan.plan === id))
}

export type Visitor =
  /** Sign-up is closed: every card leads to the waitlist. */
  | { kind: 'waitlist' }
  | { kind: 'checking' }
  | { kind: 'signed-out' }
  /** `payments` is false while billing is off or for plans Incantly assigned (testers, operators). */
  | { kind: 'signed-in'; subscription: Subscription; payments: boolean }

export type CardAction =
  | { kind: 'waitlist'; label: string }
  | { kind: 'signup'; label: string }
  | { kind: 'checkout'; label: string; selection: { plan: PaidPlan; interval: BillingInterval } }
  /** A downgrade between paid plans: scheduled for renewal, nothing charged. */
  | { kind: 'change'; label: string; selection: { plan: PaidPlan; interval: BillingInterval } }
  /** An upgrade between paid plans charges the saved card, so it happens on Polar's page, where the customer sees and confirms the price. */
  | { kind: 'portal'; label: string }
  | { kind: 'downgrade'; label: string }
  | { kind: 'resume'; label: string }
  | { kind: 'current'; label: string }
  | { kind: 'disabled'; label: string }
  | { kind: 'none' }

/** A Free account as the server reports it before any billing exists for the user. */
export const FREE_SUBSCRIPTION: Subscription = {
  plan: 'FREE', planVersion: 1, status: 'free', source: 'DEFAULT', interval: null, currentPeriodEnd: null, cancelAtPeriodEnd: false,
  pendingPlan: null, pendingChangeAt: null, graceUntil: null, entitledUntil: null, hasBillingAccount: false,
}

export type VisitorInput = {
  signInOpen: boolean
  session: 'pending' | 'signed-in' | 'signed-out'
  subscription: { state: 'pending' | 'ready' | 'missing' | 'failed'; data?: Subscription }
  /** False while billing is off on the server. */
  billing: boolean
}

/**
 * Who is looking at the pricing page. A signed-in visitor is never shown sign-up: while their plan
 * loads, or if it can't be read, the buttons wait; a server without billing (`missing`, a 404) means Free.
 */
export function pricingVisitor({ signInOpen, session, subscription, billing }: VisitorInput): Visitor {
  if (!signInOpen) return { kind: 'waitlist' }
  if (session === 'pending') return { kind: 'checking' }
  if (session === 'signed-out') return { kind: 'signed-out' }
  if (subscription.state === 'missing') return { kind: 'signed-in', subscription: FREE_SUBSCRIPTION, payments: false }
  if (subscription.state !== 'ready' || !subscription.data) return { kind: 'checking' }
  const assigned = subscription.data.source === 'TESTER' || subscription.data.source === 'OPERATOR'
  return { kind: 'signed-in', subscription: subscription.data, payments: billing && !assigned }
}

const paid = (plan: PlanId): PaidPlan | null => (plan === 'PRO' ? 'pro' : plan === 'MAX' ? 'max' : null)
const rank = (plan: PlanId) => PLAN_ORDER.indexOf(plan)

/** The one button a plan card shows for this visitor (pricing-page.md, "Buttons and states"). */
export function cardAction(plan: Plan, visitor: Visitor, interval: BillingInterval, formatDate: (iso: string) => string = shortDate): CardAction {
  const target = paid(plan.plan)
  const name = plan.name
  if (visitor.kind === 'waitlist') return { kind: 'waitlist', label: 'Join waitlist' }
  if (visitor.kind === 'checking') return { kind: 'disabled', label: target ? `Get ${name}` : 'Get started' }
  if (visitor.kind === 'signed-out') return { kind: 'signup', label: target ? `Get ${name}` : 'Get started' }

  const { subscription: sub, payments } = visitor
  const current = sub.plan === plan.plan
  if (current && sub.status === 'canceling') return payments ? { kind: 'resume', label: 'Resume plan' } : { kind: 'current', label: 'Current plan' }
  if (current && target && payments && sub.interval && sub.interval !== interval && sub.status !== 'grace') {
    // Monthly to yearly charges now; yearly to monthly waits for renewal.
    return interval === 'year'
      ? { kind: 'portal', label: 'Switch to yearly' }
      : { kind: 'change', label: 'Switch to monthly', selection: { plan: target, interval } }
  }
  if (current) return { kind: 'current', label: 'Current plan' }
  // Billing off: still show what an upgrade would be, greyed out. Plans Incantly assigned show nothing.
  if (!payments) return sub.source !== 'TESTER' && sub.source !== 'OPERATOR' && target && rank(plan.plan) > rank(sub.plan) ? { kind: 'disabled', label: `Upgrade to ${name}` } : { kind: 'none' }
  if (sub.status === 'canceling') return { kind: 'none' }
  if (sub.pendingPlan === plan.plan) return { kind: 'disabled', label: sub.pendingChangeAt ? `Starts ${formatDate(sub.pendingChangeAt)}` : 'Starts at renewal' }
  if (!target) return { kind: 'downgrade', label: 'Downgrade' }
  if (sub.plan === 'FREE') return { kind: 'checkout', label: `Upgrade to ${name}`, selection: { plan: target, interval } }
  return rank(plan.plan) > rank(sub.plan)
    ? { kind: 'portal', label: `Upgrade to ${name}` }
    : { kind: 'change', label: `Switch to ${name}`, selection: { plan: target, interval } }
}

export type ChangeConfirmation = { title: string; body: string; confirmLabel: string }

/**
 * What a downgrade between paid plans will do, said before it happens: it waits for renewal and
 * charges nothing today. (Upgrades charge the card, so they go through Polar's own page instead.)
 */
export function changeConfirmation(plan: Plan, sub: Subscription, selection: { plan: PaidPlan; interval: BillingInterval }, formatDate: (iso: string) => string = shortDate): ChangeConfirmation {
  const yearly = selection.interval === 'year'
  const price = yearly && plan.prices.year ? `${formatPrice(plan.prices.year)} a year` : plan.prices.month ? `${formatPrice(plan.prices.month)} a month` : ''
  const sameplan = (selection.plan === 'pro' ? 'PRO' : 'MAX') === sub.plan
  const until = sub.currentPeriodEnd ? formatDate(sub.currentPeriodEnd) : 'your next renewal'
  return {
    title: `Switch to ${plan.name}${sameplan ? (yearly ? ' yearly' : ' monthly') : ''}?`,
    body: `You keep your current plan until ${until}, then move to ${plan.name} at ${price}, plus applicable tax. Nothing is charged today.`,
    confirmLabel: 'Switch at renewal',
  }
}

/** A line under the current plan's button: when it ends, renews or changes. */
export function currentPlanNote(sub: Subscription, formatDate: (iso: string) => string = shortDate): string | null {
  if (sub.status === 'canceling' && sub.currentPeriodEnd) return `Ends on ${formatDate(sub.currentPeriodEnd)}`
  if (sub.pendingPlan && sub.pendingChangeAt) return `Switches to ${sub.pendingPlan === 'PRO' ? 'Pro' : 'Max'} on ${formatDate(sub.pendingChangeAt)}`
  if (sub.status === 'grace') return 'Payment failed'
  if (sub.currentPeriodEnd && sub.plan !== 'FREE') return `Renews on ${formatDate(sub.currentPeriodEnd)}`
  return null
}

export function shortDate(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso))
}

/** Where a signed-out "Get Pro" goes: sign up, then back here to start that checkout. */
export function signupHref(plan: Plan, interval: BillingInterval): string {
  const target = paid(plan.plan)
  const next = target ? `/pricing?plan=${target}&interval=${interval}` : '/notes'
  return `/auth/signup?next=${encodeURIComponent(next)}`
}

/** The checkout a visitor asked for before signing up (`?plan=pro&interval=year`), if any. */
export function checkoutFromSearch(search: string): { plan: PaidPlan; interval: BillingInterval } | null {
  const params = new URLSearchParams(search)
  const plan = params.get('plan')
  const interval = params.get('interval')
  if ((plan !== 'pro' && plan !== 'max') || (interval !== 'month' && interval !== 'year')) return null
  return { plan, interval }
}
