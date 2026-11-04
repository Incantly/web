import type { AttemptDto, AttemptResultDto, AttemptSummaryDto, QuizAnswerInput, QuizOptionDto, QuizQuestionDto, ResultCitationDto, ResultQuestionDto } from '../../../lib/api/quiz'

/** How long the taker waits after the last keystroke before saving answers. */
export const QUIZ_SAVE_DEBOUNCE_MS = 1500
/** How often the result re-reads while background explanations are still being written. */
export const QUIZ_RESULT_POLL_MS = 5000
/** Short answers are capped server-side at 800 characters. */
export const QUIZ_SHORT_ANSWER_MAX = 800

/** A draft answer: the server shapes, plus `undefined` for a question the learner never touched. */
export type DraftAnswer = QuizAnswerInput | undefined
export type DraftAnswers = Record<string, DraftAnswer>

/**
 * The generated schema types nullable server scalars (`deadlineAt`, scores,
 * `explanation`) as `Record<string, never> | null`, but the wire carries ISO
 * strings and numbers. These readers recover the runtime values instead of
 * trusting the broken codegen.
 */
export function readText(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null
}

export function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** The server deadline of a timed quiz, as an ISO string, or null when untimed. */
export function attemptDeadline(attempt: AttemptDto): string | null {
  return readText(attempt.deadlineAt as unknown)
}

/** A background-written explanation, or null while it is still being written. */
export function resultExplanation(question: ResultQuestionDto): string | null {
  return readText(question.explanation as unknown)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Coerces one saved server value into a draft shape; `undefined` when absent or unrecognized. */
export function normalizeSavedAnswer(value: unknown): DraftAnswer {
  if (value === null || value === undefined) return undefined
  if (typeof value === 'string' || typeof value === 'boolean') return value
  if (Array.isArray(value) && value.every((item): item is string => typeof item === 'string')) return [...value]
  if (isRecord(value) && Object.values(value).every((item) => typeof item === 'string')) return { ...value } as Record<string, string>
  return undefined
}

/** The attempt's saved answers as a draft, in a shape the inputs can draw. */
export function draftFromAttempt(attempt: AttemptDto): DraftAnswers {
  const draft: DraftAnswers = {}
  for (const question of attempt.questions) {
    const value = normalizeSavedAnswer(attempt.answers[question.id])
    if (value !== undefined) draft[question.id] = value
  }
  return draft
}

/** Toggles one option of a multiple-select answer. An empty selection is a real (zero-scoring) answer. */
export function toggleMultiSelect(current: DraftAnswer, optionId: string): string[] {
  const selected = Array.isArray(current) ? current : []
  return selected.includes(optionId) ? selected.filter((id) => id !== optionId) : [...selected, optionId]
}

/** The ordering answer for a question the learner never touched: the attempt's own order. */
export function orderingFromOptions(question: QuizQuestionDto): string[] {
  return (question.options ?? []).map((option) => option.id)
}

/** Moves one ordering item up or down one slot; edges stay put. */
export function moveOrderingItem(current: string[], index: number, direction: -1 | 1): string[] {
  const next = [...current]
  const target = index + direction
  if (index < 0 || index >= next.length || target < 0 || target >= next.length) return next
  const [item] = next.splice(index, 1)
  next.splice(target, 0, item)
  return next
}

/** Maps one matching left item to a right item; a null right clears that row only. */
export function setMatch(current: DraftAnswer, leftId: string, rightId: string | null): Record<string, string> {
  const map = isRecord(current) ? { ...(current as Record<string, string>) } : {}
  if (rightId === null) delete map[leftId]
  else map[leftId] = rightId
  return map
}

/** Fills one blank; an empty fill clears that blank only. */
export function setBlank(current: DraftAnswer, blankId: string, text: string): Record<string, string> {
  const map = isRecord(current) ? { ...(current as Record<string, string>) } : {}
  if (text) map[blankId] = text
  else delete map[blankId]
  return map
}

/** Splits a fill-in-the-blank prompt on its `[[b1]]` markers into text and blank runs. */
export function splitFillBlanks(prompt: string): ({ kind: 'text'; text: string } | { kind: 'blank'; id: string })[] {
  const runs: ({ kind: 'text'; text: string } | { kind: 'blank'; id: string })[] = []
  const marker = /\[\[([^\]]+)\]\]/g
  let cursor = 0
  let match: RegExpExecArray | null
  while ((match = marker.exec(prompt)) !== null) {
    if (match.index > cursor) runs.push({ kind: 'text', text: prompt.slice(cursor, match.index) })
    runs.push({ kind: 'blank', id: match[1] })
    cursor = match.index + match[0].length
  }
  if (cursor < prompt.length) runs.push({ kind: 'text', text: prompt.slice(cursor) })
  return runs
}

/** True when the draft holds a complete answer for the question (partial maps don't count). */
export function isAnswered(question: QuizQuestionDto, value: DraftAnswer): boolean {
  if (value === undefined || value === null) return false
  switch (question.type) {
    case 'SINGLE_CHOICE':
    case 'SHORT_ANSWER':
      return typeof value === 'string' && value.trim().length > 0
    case 'TRUE_FALSE':
      return typeof value === 'boolean'
    case 'MULTIPLE_SELECT':
      return Array.isArray(value)
    case 'ORDERING':
      return Array.isArray(value) && value.length === (question.options ?? []).length
    case 'FILL_IN_THE_BLANK': {
      if (!isRecord(value)) return false
      const blanks = question.blanks ?? []
      return blanks.length > 0 && blanks.every((blank) => typeof value[blank] === 'string' && (value[blank] as string).trim().length > 0)
    }
    case 'MATCHING': {
      if (!isRecord(value)) return false
      const left = question.options ?? []
      return left.length > 0 && left.every((option) => typeof value[option.id] === 'string' && (value[option.id] as string).length > 0)
    }
  }
}

export function countAnswered(questions: QuizQuestionDto[], draft: DraftAnswers): number {
  return questions.filter((question) => isAnswered(question, draft[question.id])).length
}

/** The per-type hint under a question. New types score exact-match with no partial credit. */
export function questionTypeHint(type: QuizQuestionDto['type']): string | null {
  switch (type) {
    case 'MULTIPLE_SELECT':
      return 'Choose every answer that fits. There is no partial credit.'
    case 'SHORT_ANSWER':
      return 'A short factual answer. Spelling close to the source counts; punctuation must match.'
    case 'FILL_IN_THE_BLANK':
      return 'Fill every blank. There is no partial credit.'
    case 'MATCHING':
      return 'Match every row. Each right-hand item is used once. There is no partial credit.'
    case 'ORDERING':
      return 'Put every item in order. There is no partial credit.'
    default:
      return null
  }
}

function optionText(options: QuizOptionDto[] | undefined, id: string): string {
  return options?.find((option) => option.id === id)?.text ?? id
}

/**
 * One result answer as plain text, resolving option IDs through the
 * question's own options. Respects the attempt's returned order; never grades.
 */
export function formatAnswerText(question: Pick<ResultQuestionDto, 'type' | 'options' | 'right'>, value: unknown): string {
  if (value === null || value === undefined) return 'No answer'
  switch (question.type) {
    case 'TRUE_FALSE':
      return value === true ? 'True' : value === false ? 'False' : 'No answer'
    case 'SINGLE_CHOICE':
      return typeof value === 'string' ? optionText(question.options, value) : 'No answer'
    case 'SHORT_ANSWER':
      return typeof value === 'string' && value ? value : 'No answer'
    case 'MULTIPLE_SELECT':
    case 'ORDERING':
      return Array.isArray(value) && value.length > 0 ? value.map((id) => optionText(question.options, id)).join(question.type === 'ORDERING' ? ' → ' : ', ') : 'No answer'
    case 'FILL_IN_THE_BLANK':
      if (!isRecord(value)) return 'No answer'
      return Object.entries(value)
        .map(([blank, text]) => `${blank}: ${text}`)
        .join(', ') || 'No answer'
    case 'MATCHING': {
      if (!isRecord(value)) return 'No answer'
      return Object.entries(value)
        .map(([left, right]) => `${optionText(question.options, left)} → ${optionText(question.right, right as string)}`)
        .join('; ') || 'No answer'
    }
  }
}

const quizDate = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

function formatQuizDate(value: string | null): string {
  if (!value) return 'Unknown date'
  const time = Date.parse(value)
  return Number.isFinite(time) ? quizDate.format(new Date(time)) : 'Unknown date'
}

/** The result headline and detail, from the server's own score (never client-graded). */
export function scoreCopy(result: AttemptResultDto): { headline: string; detail: string } {
  const headline = result.passed ? 'You passed' : 'Not passed yet'
  const detail = `${result.score} of ${result.maxScore} points · Passing score ${result.passingScore} · Submitted ${formatQuizDate(result.submittedAt)}`
  return { headline, detail }
}

/** One result citation as plain text: file and page, note, or timestamp, plus its heading path. */
export function citationCopy(citation: ResultCitationDto): string {
  const parts = [citation.title]
  const page = readNumber(citation.page as unknown)
  if (page !== null) parts.push(`p. ${page}`)
  const startMs = readNumber(citation.startMs as unknown)
  if (startMs !== null) parts.push(new Date(startMs).toISOString().slice(14, 19))
  if (citation.headingPath.length > 0) parts.push(citation.headingPath.join(' › '))
  return parts.join(' · ')
}

/** One history row's meta line, from the server's own values. */
export function historySummaryCopy(summary: AttemptSummaryDto): string {
  const started = formatQuizDate(summary.startedAt)
  if (summary.state === 'IN_PROGRESS') return `In progress · Started ${started}`
  const score = readNumber(summary.score as unknown)
  const maxScore = readNumber(summary.maxScore as unknown)
  const submitted = formatQuizDate(readText(summary.submittedAt as unknown))
  return score !== null && maxScore !== null ? `${score} of ${maxScore} points · Submitted ${submitted}` : `Submitted ${submitted}`
}

/** The submit confirmation copy: unanswered questions score zero and submits are final. */
export function submitConfirmCopy(answered: number, total: number): { title: string; body: string } {
  const title = 'Submit this attempt?'
  if (answered >= total) return { title, body: `You answered all ${total} ${total === 1 ? 'question' : 'questions'}. You can’t change answers after submitting.` }
  const left = total - answered
  return { title, body: `${left} of ${total} ${total === 1 ? 'question is' : 'questions are'} still unanswered. Unanswered questions score zero, and you can’t change answers after submitting.` }
}

const savedTime = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' })

/** The autosave indicator line under the taker header. */
export function saveIndicatorCopy(state: 'idle' | 'saving' | 'saved' | 'error' | 'offline', savedAt: number | null): string {
  switch (state) {
    case 'saving':
      return 'Saving…'
    case 'saved':
      return savedAt ? `Saved ${savedTime.format(new Date(savedAt))}` : 'Saved'
    case 'error':
      return 'Couldn’t save just now.'
    case 'offline':
      return 'Offline — answers stay on this page until you reconnect.'
    default:
      return 'Answers save as you go.'
  }
}

/** Remaining time on a timed attempt, from the server deadline. Null when untimed. */
export function timeLeftCopy(deadlineAt: string | null, now: number): string | null {
  if (!deadlineAt) return null
  const remaining = Date.parse(deadlineAt) - now
  if (!Number.isFinite(remaining) || remaining <= 0) return 'Time is up — submit to see your score.'
  const minutes = Math.floor(remaining / 60_000)
  const seconds = Math.floor((remaining % 60_000) / 1000)
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m left`
  if (minutes >= 1) return `${minutes}m ${String(seconds).padStart(2, '0')}s left`
  return `${seconds}s left`
}
