import type { AiCommand, AiJob, AiJobEvent, AiScope, AnswerCitation, CitedPassage, ClarificationOption, GroundedAnswer, PracticeQuestions } from '../../../lib/api/ai'

export type ScopeKind = AiScope['kind']

/** What the assistant may search, with the label shown on the scope pill. */
export type ScopeChoice = { kind: ScopeKind; scope: AiScope; label: string }

export type UserTurn = { id: string; role: 'user'; text: string; command?: AiCommand }

export type AssistantState = 'sending' | 'running' | 'done' | 'clarify' | 'failed' | 'canceled'

export type AssistantTurn = {
  id: string
  role: 'assistant'
  state: AssistantState
  /** The request this turn answers, kept so "Try again" and clarification can resend it. */
  request: { text: string; scope: ScopeChoice; command?: AiCommand }
  jobId?: string
  /** Progress copy from the latest job event. */
  progress?: string
  /** Last seen event `seq`, so polling resumes where it left off. */
  after?: number
  job?: AiJob
  passages?: CitedPassage[]
  options?: ClarificationOption[]
  /** Friendly failure copy. */
  error?: string
  failureCode?: string | null
  /** Set once the answer has been revealed, so a restored thread does not replay it. */
  revealed?: boolean
}

export type Turn = UserTurn | AssistantTurn

export const TERMINAL: ReadonlySet<AiJob['status']> = new Set(['COMPLETED', 'FAILED', 'CANCELED', 'EXPIRED'])

/** Progress copy for one job event. Events carry codes and numbers, never text. */
export function eventLabel(event: Pick<AiJobEvent, 'type' | 'data'>): string | null {
  switch (event.type) {
    case 'ACCEPTED': return 'Starting…'
    case 'STEP_STARTED':
    case 'STEP_COMPLETED': {
      const step = typeof event.data?.step === 'number' ? event.data.step : 1
      return step <= 1 && event.type === 'STEP_STARTED' ? 'Searching your material…' : 'Writing…'
    }
    case 'CHILDREN_STARTED': return 'Reading your files…'
    case 'CHILDREN_FINISHED': return 'Writing…'
    case 'WAITING_TURN': return 'Queued behind your other requests…'
    case 'DEFERRED': return event.data?.code === 'AI_PROVIDER_UNAVAILABLE' ? 'AI is unavailable right now. Still retrying…' : 'Busy, retrying shortly…'
    default: return null
  }
}

const failures: Record<string, string> = {
  AI_DAILY_LIMIT_REACHED: 'You’ve used today’s AI allowance.',
  AI_REQUEST_TOO_COSTLY: 'That request is too large. Try a narrower scope or a shorter question.',
  AI_SCOPE_FORBIDDEN: 'Something in the search scope was archived or deleted. Check what to search and ask again.',
  AI_REFUSED: 'The assistant can’t help with that request.',
  AI_CONTEXT_TOO_LARGE: 'There’s too much material to read at once. Narrow what to search.',
  AI_INVALID_OUTPUT: 'The assistant couldn’t put an answer together. Try again.',
  AI_AGENT_STEPS_EXHAUSTED: 'The assistant couldn’t put an answer together. Try again.',
  AI_ATTEMPTS_EXHAUSTED: 'The assistant couldn’t put an answer together. Try again.',
  AI_NO_ELIGIBLE_ROUTE: 'AI is unavailable right now. Try again later.',
  AI_PROVIDER_UNAVAILABLE: 'AI is unavailable right now. Try again later.',
  AI_ROUTE_DISABLED: 'AI is unavailable right now. Try again later.',
  AI_DEADLINE_EXHAUSTED: 'That took too long. Try again.',
  AI_TIER_NOT_ALLOWED: 'The AI assistant isn’t included in your plan.',
  CONTEXT_SCOPE_INVALID: 'Choose what to search first.',
  CONTEXT_SCOPE_TOO_LARGE: 'That’s too much to search at once. Narrow it down.',
  AI_TASK_UNKNOWN: 'That request isn’t supported yet.',
  AI_TASK_NOT_SUPPORTED: 'That request isn’t supported yet.',
  AI_JOB_INPUT_INVALID: 'Questions can be 2 to 2,000 characters.',
}

/** Copy for a job's `failureCode` (or status when there is none). Unknown codes read as a generic failure. */
export function failureMessage(code: string | null | undefined, status?: AiJob['status']): string {
  if (code && failures[code]) return failures[code]
  if (status === 'EXPIRED') return 'That took too long. Try again.'
  return 'Something went wrong. Try again.'
}

/** Failures where asking the same thing again can help. */
export function canRetry(code: string | null | undefined) {
  return !code || !['AI_REFUSED', 'AI_DAILY_LIMIT_REACHED', 'AI_TIER_NOT_ALLOWED'].includes(code)
}

export type AnswerSegment = { kind: 'text'; text: string } | { kind: 'ref'; ref: string; index: number }

const REF = /\[([A-Za-z0-9]+(?:\s*,\s*[A-Za-z0-9]+)*)\]/g

/**
 * Splits model text into plain text and citation markers. `[S1E1]` (or `[S1E1, S2E3]`) becomes a
 * marker only when every ref is a known citation; other brackets stay as text. Markers are numbered
 * by first appearance.
 */
export function segmentAnswer(text: string, known: ReadonlySet<string>, order: string[] = []): { segments: AnswerSegment[]; order: string[] } {
  const segments: AnswerSegment[] = []
  let last = 0
  for (const match of text.matchAll(REF)) {
    const refs = match[1].split(',').map((ref) => ref.trim())
    if (!refs.every((ref) => known.has(ref))) continue
    // Drop the space before a marker so it sits against the word it supports.
    const before = text.slice(last, match.index).replace(/[ \t]+$/, '')
    if (before) segments.push({ kind: 'text', text: before })
    for (const ref of refs) {
      if (!order.includes(ref)) order.push(ref)
      segments.push({ kind: 'ref', ref, index: order.indexOf(ref) + 1 })
    }
    last = match.index + match[0].length
  }
  if (last < text.length) segments.push({ kind: 'text', text: text.slice(last) })
  return { segments, order }
}

/** Cuts segments to the first `chars` characters of text, for the reveal. Markers show once reached. */
export function revealSegments(segments: AnswerSegment[], chars: number): AnswerSegment[] {
  const out: AnswerSegment[] = []
  let budget = chars
  for (const segment of segments) {
    if (segment.kind === 'ref') { if (budget > 0) out.push(segment); continue }
    if (budget <= 0) break
    out.push(segment.text.length <= budget ? segment : { kind: 'text', text: segment.text.slice(0, budget) })
    budget -= segment.text.length
  }
  return out
}

export function textLength(segments: AnswerSegment[]) {
  return segments.reduce((total, segment) => total + (segment.kind === 'text' ? segment.text.length : 0), 0)
}

export function isGroundedAnswer(job: AiJob | undefined): job is AiJob & { result: GroundedAnswer } {
  return job?.jobType === 'agent.grounded_answer' && Boolean(job.result) && 'answer' in (job.result as object)
}

export function isPracticeQuestions(job: AiJob | undefined): job is AiJob & { result: PracticeQuestions } {
  return job?.jobType === 'agent.practice_questions' && Boolean(job.result) && 'questions' in (job.result as object)
}

/** A citation joined with its stored passage (when still kept; passages expire after 30 days). */
export type ResolvedCitation = { ref: string; index: number; citation?: AnswerCitation; passage?: CitedPassage }

export function resolveCitations(order: string[], citations: AnswerCitation[], passages: CitedPassage[] = []): ResolvedCitation[] {
  return order.map((ref, index) => ({
    ref,
    index: index + 1,
    citation: citations.find((item) => item.ref === ref),
    passage: passages.find((item) => item.ref === ref),
  }))
}

/** "Page 4", "2:05", or the heading path: where in the original the passage sits. */
export function locatorLabel(item: { page: number | null; startMs: number | null }, headingPath: string[] = []) {
  if (item.page !== null && item.page !== undefined) return `Page ${item.page}`
  if (item.startMs !== null && item.startMs !== undefined) {
    const total = Math.floor(item.startMs / 1000)
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
  }
  return headingPath.length ? headingPath.join(' › ') : null
}

export const MIN_PROMPT = 2
export const MAX_PROMPT = 2000
