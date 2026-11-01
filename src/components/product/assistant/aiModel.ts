import type { AiCommand, AiJob, AiJobEvent, AiScope, AnswerCitation, CitedPassage, ClarificationOption, GroundedAnswer, NoteAssistResult, NoteSelection, PendingApproval, PracticeQuestions } from '../../../lib/api/ai'

export type ScopeKind = AiScope['kind']

/** A mode in the chat's "+" menu: the explicit task each message is sent as. `icon` is an AppIcon name. */
export type ChatMode = { command: AiCommand; label: string; description: string; icon: 'sparkles' | 'quote' | 'edit'; chip: string; placeholder: string }

const noteAssistant: ChatMode = { command: 'note.assist', label: 'Help with this note', description: 'Answers, explains and suggests edits you accept or reject.', icon: 'sparkles', chip: 'Note assistant', placeholder: 'Ask anything, or ask for changes…' }
const askWithSources: ChatMode = { command: 'ask', label: 'Ask with sources', description: 'Answers only from your notes and files, cited.', icon: 'quote', chip: 'Sources only', placeholder: 'Ask about your notes…' }
const quiz: ChatMode = { command: 'practice', label: 'Quiz me', description: 'Practice questions from your material.', icon: 'edit', chip: 'Quiz me', placeholder: 'What should the quiz cover?' }

/**
 * The modes on offer for a scope, default first. On one note the note assistant is the default: it
 * can explain beyond the note and suggest edits, where "Ask with sources" only answers from the
 * user's material (and says so when it doesn't cover the question).
 */
export function chatModes(kind: ScopeKind | undefined): ChatMode[] {
  return kind === 'NOTE' ? [noteAssistant, askWithSources, quiz] : [askWithSources, quiz]
}

/** The mode a message goes out as: the user's pick while it is on offer, else the scope's default. */
export function resolveMode(kind: ScopeKind | undefined, picked: AiCommand | null): ChatMode {
  const modes = chatModes(kind)
  return modes.find((mode) => mode.command === picked) ?? modes[0]
}

/** What the assistant may search, with the label shown on the scope pill. */
export type ScopeChoice = { kind: ScopeKind; scope: AiScope; label: string }

/** `quote` is the selected note text shown above the message; only the selection's ranges are sent. */
export type UserTurn = { id: string; role: 'user'; text: string; command?: AiCommand; quote?: string }

export type AssistantState = 'sending' | 'running' | 'done' | 'clarify' | 'failed' | 'canceled'

export type AssistantTurn = {
  id: string
  role: 'assistant'
  state: AssistantState
  /** The request this turn answers, kept so "Try again" and clarification can resend it. */
  request: { text: string; scope: ScopeChoice; command?: AiCommand; selection?: NoteSelection }
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
  /** What the assistant did, step by step, from its tool events. */
  steps?: ActivityStep[]
  /** Actions the assistant is waiting on the user to approve (job WAITING_APPROVAL). */
  approvals?: PendingApproval[]
  /** The job's `stateVersion` when the approvals were read; sent back with a decision. */
  stateVersion?: number
  /** The approval being decided right now. */
  deciding?: string
  approvalError?: string
}

export type Turn = UserTurn | AssistantTurn

/** One thing the assistant did: a tool call, from its TOOL_STARTED and TOOL_FINISHED events. */
export type ActivityStep = { id: string; tool: string; state: 'running' | 'done' | 'refused' | 'failed'; label: string; detail?: string }

type ToolCopy = { running: string; done: string; failed: string; detail?: (data: Record<string, unknown>) => string | undefined }

const count = (value: unknown, one: string, many: string) => (typeof value === 'number' ? `${value.toLocaleString()} ${value === 1 ? one : many}` : undefined)

/** Plain words for each tool the backend reports (docs: AiJobEventDto.data). Unknown tools read as "Working". */
const tools: Record<string, ToolCopy> = {
  read_note_blocks: { running: 'Reading your note', done: 'Read your note', failed: 'Couldn’t read your note', detail: (data) => count(data.blocks, 'paragraph', 'paragraphs') },
  knowledge_search: { running: 'Searching your material', done: 'Searched your material', failed: 'Couldn’t search your material', detail: (data) => (data.evidence === 0 ? 'nothing relevant' : count(data.evidence, 'passage', 'passages')) },
  library_overview: { running: 'Looking through your library', done: 'Looked through your library', failed: 'Couldn’t look through your library', detail: (data) => count(data.files, 'file', 'files') },
  read_pages: { running: 'Reading pages', done: 'Read pages', failed: 'Couldn’t read those pages', detail: (data) => count(data.evidence, 'passage', 'passages') },
  propose_note_edits: { running: 'Preparing suggested edits', done: 'Suggested edits', failed: 'Couldn’t prepare the edits', detail: (data) => count(data.changes, 'change', 'changes') },
  web_search: { running: 'Searching the web', done: 'Searched the web', failed: 'Couldn’t search the web', detail: (data) => count(data.results, 'result', 'results') },
  read_web_page: { running: 'Reading a web page', done: 'Read a web page', failed: 'Couldn’t read the web page' },
  list_images: { running: 'Looking through your images', done: 'Looked through your images', failed: 'Couldn’t look through your images', detail: (data) => (data.images === 0 ? 'none found' : count(data.images, 'image', 'images')) },
  web_task: { running: 'Researching on the web', done: 'Researched on the web', failed: 'Couldn’t finish the web research', detail: (data) => count(data.sources, 'source', 'sources') },
}
/** Why a step didn't work, in plain words (TOOL_FINISHED `reason`). Unknown codes show no detail. */
const refusalReasons: Record<string, string> = {
  invalid_markdown: 'the formatting didn’t convert',
  unsupported_markdown: 'it used formatting notes don’t support',
  invalid_link: 'a link wasn’t allowed',
  invalid_math: 'the maths didn’t parse',
  invalid_image: 'an image wasn’t valid',
  unknown_asset: 'that image isn’t in your library',
  too_large: 'it was too long',
  not_markdown: 'the content wasn’t in a usable form',
  unknown_block: 'it pointed at the wrong paragraph',
  invalid_change: 'the change was incomplete',
}

const unknownTool: ToolCopy = { running: 'Working', done: 'Worked on a step', failed: 'A step didn’t work' }

/**
 * Folds tool events into the list of steps shown in the chat: TOOL_STARTED adds a running step,
 * TOOL_FINISHED (paired by `callId`) marks it done, refused or failed with its counts. Other events
 * leave the list as it is. Events carry codes and numbers only, so every label comes from here.
 */
export function activitySteps(steps: readonly ActivityStep[], event: Pick<AiJobEvent, 'type' | 'data'>): ActivityStep[] {
  if (event.type !== 'TOOL_STARTED' && event.type !== 'TOOL_FINISHED') return steps as ActivityStep[]
  const data = event.data ?? {}
  const id = typeof data.callId === 'string' ? data.callId : `step-${String(data.step ?? steps.length)}`
  const tool = typeof data.tool === 'string' ? data.tool : 'unknown'
  const copy = tools[tool] ?? unknownTool
  const existing = steps.findIndex((step) => step.id === id)
  if (event.type === 'TOOL_STARTED') {
    if (existing >= 0) return steps as ActivityStep[]
    return [...steps, { id, tool, state: 'running', label: copy.running }]
  }
  const outcome = data.outcome === 'refused' || data.outcome === 'failed' ? data.outcome : 'done'
  const detail = outcome === 'done' ? copy.detail?.(data) : refusalReasons[String(data.reason ?? '')]
  const finished: ActivityStep = { id, tool, state: outcome, label: outcome === 'done' ? copy.done : copy.failed, ...(detail ? { detail } : {}) }
  return existing >= 0 ? steps.map((step, index) => (index === existing ? finished : step)) : [...steps, finished]
}

/**
 * The note assistant tried to suggest edits but none was stored: every `propose_note_edits` call
 * was refused or failed and the result lists no proposals. Its reply may still read as if it
 * edited the note, so the chat says plainly that nothing changed.
 */
export function editsNotStored(proposalIds: readonly string[], steps: readonly ActivityStep[] = []) {
  const tries = steps.filter((step) => step.tool === 'propose_note_edits')
  return proposalIds.length === 0 && tries.length > 0 && tries.every((step) => step.state === 'refused' || step.state === 'failed')
}

/** "3 steps" for the collapsed list under a finished answer. */
export function stepsSummary(steps: readonly ActivityStep[]) {
  const problems = steps.filter((step) => step.state === 'refused' || step.state === 'failed').length
  const total = steps.length === 1 ? '1 step' : `${steps.length} steps`
  return problems ? `${total} · ${problems} didn’t work` : total
}

export const TERMINAL: ReadonlySet<AiJob['status']> = new Set(['COMPLETED', 'FAILED', 'CANCELED', 'EXPIRED'])

/** Progress copy for one job event. Events carry codes and numbers, never text. */
export function eventLabel(event: Pick<AiJobEvent, 'type' | 'data'>): string | null {
  switch (event.type) {
    case 'ACCEPTED': return 'Starting…'
    // Steps say nothing about what runs; tool events (activitySteps) do.
    case 'STEP_STARTED':
    case 'STEP_COMPLETED': return 'Thinking…'
    case 'CHILDREN_STARTED': return 'Reading your files…'
    case 'CHILDREN_FINISHED': return 'Writing…'
    case 'WAITING_TURN': return 'Queued behind your other requests…'
    case 'APPROVAL_REQUESTED': return 'Waiting for your OK…'
    case 'APPROVED':
    case 'TOOL_RESUMED': return 'Continuing…'
    case 'REJECTED': return 'Continuing without that…'
    case 'APPROVAL_EXPIRED': return 'The request to approve expired.'
    case 'TOOL_WAITING': return 'Waiting on a tool…'
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
  AI_SELECTION_NEEDS_NOTE: 'Selected text can only be sent while searching this note.',
  AI_APPROVAL_EXPIRED: 'The assistant stopped because its request to approve expired. Ask again.',
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

export function isNoteAssist(job: AiJob | undefined): job is AiJob & { result: NoteAssistResult } {
  return job?.jobType === 'agent.note_assist' && Boolean(job.result) && 'answer' in (job.result as object)
}

/** Events after which the job's pending approvals may have changed. */
export function touchesApprovals(event: Pick<AiJobEvent, 'type'>) {
  return event.type === 'APPROVAL_REQUESTED' || event.type === 'APPROVED' || event.type === 'REJECTED' || event.type === 'APPROVAL_EXPIRED'
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
