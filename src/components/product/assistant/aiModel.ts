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

/** Inline Markdown in an answer: plain text, emphasis, code, and citation markers. */
export type InlineNode =
  | { kind: 'text'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'math'; tex: string }
  | { kind: 'strong'; children: InlineNode[] }
  | { kind: 'em'; children: InlineNode[] }
  | { kind: 'ref'; ref: string; index: number }

/** Block-level Markdown in an answer. */
export type AnswerBlock =
  | { kind: 'heading'; level: 1 | 2 | 3; content: InlineNode[] }
  | { kind: 'paragraph'; content: InlineNode[] }
  | { kind: 'list'; ordered: boolean; items: InlineNode[][] }
  | { kind: 'code'; text: string }
  | { kind: 'math'; tex: string }

// Citation markers ride through the Markdown pass as private-use placeholders, so `*`, `_` and
// backticks inside the answer can never split or swallow them.
const REF_OPEN = ''
const REF_MID = ''
const REF_CLOSE = ''
const INLINE = new RegExp([
  '`([^`]+)`',
  // Inline LaTeX: $…$ (no space inside the dollars, not followed by a digit, so "$5 and $10" stays
  // text) or \(…\).
  '\\$(?![\\s$])([^$\\n]+?)(?<!\\s)\\$(?!\\d)',
  '\\\\\\((.+?)\\\\\\)',
  '\\*\\*(.+?)\\*\\*',
  '(?<![\\w])__(.+?)__(?![\\w])',
  '(?<![\\w*])\\*([^*\\s](?:[^*]*?[^*\\s])?)\\*(?![\\w*])',
  '(?<![\\w])_([^_\\s](?:[^_]*?[^_\\s])?)_(?![\\w])',
  `${REF_OPEN}(\\d+)${REF_MID}([^${REF_CLOSE}]*)${REF_CLOSE}`,
].join('|'), 'g')

function parseInline(text: string): InlineNode[] {
  const nodes: InlineNode[] = []
  let last = 0
  for (const match of text.matchAll(INLINE)) {
    if (match.index > last) nodes.push({ kind: 'text', text: text.slice(last, match.index) })
    const [, code, math, mathAlt, strong, strongAlt, em, emAlt, refIndex, ref] = match
    if (code !== undefined) nodes.push({ kind: 'code', text: code })
    else if (math !== undefined || mathAlt !== undefined) nodes.push({ kind: 'math', tex: plainRefs(math ?? mathAlt) })
    else if (strong !== undefined || strongAlt !== undefined) nodes.push({ kind: 'strong', children: parseInline(strong ?? strongAlt) })
    else if (em !== undefined || emAlt !== undefined) nodes.push({ kind: 'em', children: parseInline(em ?? emAlt) })
    else nodes.push({ kind: 'ref', ref, index: Number(refIndex) })
    last = match.index + match[0].length
  }
  if (last < text.length) nodes.push({ kind: 'text', text: text.slice(last) })
  return nodes
}

/** Code blocks show citation markers as their plain `[n]`. */
function plainRefs(text: string) {
  return text.replace(new RegExp(`${REF_OPEN}(\\d+)${REF_MID}[^${REF_CLOSE}]*${REF_CLOSE}`, 'g'), '[$1]')
}

/**
 * Turns answer segments into Markdown blocks: headings, paragraphs, bullet and numbered lists,
 * fenced code, and inline emphasis and code. The result is data rendered as React elements, never
 * HTML, so model text stays untrusted text. Unclosed markers (mid-reveal) stay literal.
 */
export function answerBlocks(segments: AnswerSegment[]): AnswerBlock[] {
  const source = segments.map((segment) => (segment.kind === 'text' ? segment.text : `${REF_OPEN}${segment.index}${REF_MID}${segment.ref}${REF_CLOSE}`)).join('')
  const blocks: AnswerBlock[] = []
  let paragraph: string[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  const flush = () => {
    if (paragraph.length) blocks.push({ kind: 'paragraph', content: parseInline(paragraph.join('\n')) })
    if (list) blocks.push({ kind: 'list', ordered: list.ordered, items: list.items.map(parseInline) })
    paragraph = []
    list = null
  }
  const lines = source.split('\n')
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    if (/^\s*```/.test(line)) {
      flush()
      const code: string[] = []
      while (++index < lines.length && !/^\s*```/.test(lines[index])) code.push(lines[index])
      blocks.push({ kind: 'code', text: plainRefs(code.join('\n')) })
      continue
    }
    // Display math: $$…$$ or \[…\], on one line or across several.
    const mathOpen = /^\s*(\$\$|\\\[)(.*)$/.exec(line)
    if (mathOpen) {
      flush()
      const close = mathOpen[1] === '$$' ? '$$' : '\\]'
      let body = mathOpen[2]
      while (!body.trimEnd().endsWith(close) && index + 1 < lines.length) body += `\n${lines[++index]}`
      const tex = body.trimEnd().endsWith(close) ? body.trimEnd().slice(0, -close.length) : body
      blocks.push({ kind: 'math', tex: plainRefs(tex.trim()) })
      continue
    }
    if (!line.trim()) { flush(); continue }
    const heading = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line)
    if (heading) {
      flush()
      blocks.push({ kind: 'heading', level: Math.min(heading[1].length, 3) as 1 | 2 | 3, content: parseInline(heading[2]) })
      continue
    }
    const item = /^\s*(?:([-*+])|(\d+)[.)])\s+(.*)$/.exec(line)
    if (item) {
      const ordered = item[2] !== undefined
      if (paragraph.length || (list && list.ordered !== ordered)) flush()
      list ??= { ordered, items: [] }
      list.items.push(item[3])
      continue
    }
    // A line after a list item without a blank line continues that item.
    if (list) { list.items[list.items.length - 1] += ` ${line.trim()}`; continue }
    paragraph.push(line)
  }
  flush()
  return blocks
}
