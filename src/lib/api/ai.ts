import { apiFetch } from './client'
import type { Schema } from './types'

export type AiScope = Schema<'AiScopeDto'>
/** What web search looks for, when `webSearch` is true: the web, research papers, or both per step. `both` is live on the backend but missing from the committed schema copy; widened here until the types are regenerated (§1.2). */
export type AiWebScope = Schema<'AiRequestDto'>['webScope'] | 'both'
/** `clarified`, `webSearch`, and `webScope` have server defaults (the generated schema marks them required). */
export type AiRequest = Omit<Schema<'AiRequestDto'>, 'clarified' | 'webSearch' | 'webScope'> & { clarified?: boolean; webSearch?: boolean; webScope?: AiWebScope }
/** Text selected in the note editor: block IDs and UTF-16 offsets, never the text itself. */
export type NoteSelection = Schema<'NoteSelectionDto'>
export type SelectionRange = Schema<'SelectionRangeDto'>
export type AiCommand = NonNullable<AiRequest['command']>
/** Research-paper metadata on a paper citation (`CitationDto.paper`). Every field is optional. */
export type WebPaper = Schema<'WebPaperDto'>
export type AiJob = Schema<'AiJobDto'>
export type AiJobStatus = AiJob['status']
/** Mid-run clarification events are live on the backend but missing from the committed schema copy; widened here until the types are regenerated (§1.2, like AiWebScope). */
export type AiJobEventType = Schema<'AiJobEventDto'>['type'] | 'CLARIFICATION_REQUESTED' | 'CLARIFIED' | 'CLARIFICATION_EXPIRED'
export type AiJobEvent = Omit<Schema<'AiJobEventDto'>, 'type'> & { type: AiJobEventType }
export type AiJobEvents = Schema<'AiJobEventsDto'>
export type AiAccepted = Schema<'AiJobAcceptedDto'>
export type AiClarification = Schema<'AiClarificationDto'>
export type ClarificationOption = Schema<'ClarificationOptionDto'>
export type GroundedAnswer = Schema<'GroundedAnswerResultDto'>
export type PracticeQuestions = Schema<'PracticeQuestionsResultDto'>
export type AnswerCitation = Schema<'CitationDto'>
export type CitedPassage = Schema<'CitedPassageDto'>
/** `web` is live on the backend but missing from the committed schema copy; widened here until the types are regenerated (§1.2, like AiWebScope). */
export type AiCitations = Schema<'AiCitationsDto'> & { web: AnswerCitation[] }
export type AiAllowance = Schema<'AiAllowanceDto'>
export type NoteAssistResult = Schema<'NoteAssistResultDto'>
export type AiApprovals = Schema<'AiApprovalsDto'>
export type PendingApproval = Schema<'PendingApprovalDto'>
export type ApprovalDecision = Schema<'ApprovalDecisionDto'>['decision']
/**
 * Mid-run clarification: one inline choice while a job waits (WAITING_CLARIFICATION), then the
 * same run resumes. Option ids are a closed server enum; labels are server-written, render as text.
 */
export type ClarifyOptionId = 'answer_in_chat' | 'edit_note' | 'generate_simulation' | 'change_figure'
export type ClarifyKind = 'SIM_AMBIGUOUS' | 'FIGURE_TARGET'
export type RunClarifyOption = { option: ClarifyOptionId; figureId?: string; label: string; description?: string }
export type RunClarification = { kind: ClarifyKind; options: RunClarifyOption[]; expiresAt: string; stateVersion: number }

const id = (value: string) => encodeURIComponent(value)

/** `/v1/ai/*` (frontend-api-integration.md, "AI assistant API"). Every request becomes a background job. */
export const aiApi = {
  /** One `idempotencyKey` per user action; network retries reuse it. A 429 is surfaced so the UI can say so. */
  async ask(body: AiRequest, idempotencyKey: string) {
    return (await apiFetch<AiAccepted | AiClarification>('/v1/ai/requests', { method: 'POST', body, idempotencyKey, maxAttempts: 2 })).data
  },
  async job(jobId: string, signal?: AbortSignal) {
    return (await apiFetch<AiJob>(`/v1/ai/jobs/${id(jobId)}`, { signal })).data
  },
  async events(jobId: string, after: number, signal?: AbortSignal) {
    return (await apiFetch<AiJobEvents>(`/v1/ai/jobs/${id(jobId)}/events?after=${after}`, { signal })).data
  },
  /**
   * `passages` needs a completed job; `web` is served while the job runs once the first result
   * lands (`404 AI_RESULT_NOT_READY` until then). Passage text is untrusted: render it as text.
   */
  async citations(jobId: string, signal?: AbortSignal) {
    return (await apiFetch<AiCitations>(`/v1/ai/jobs/${id(jobId)}/citations`, { signal })).data
  },
  /** Idempotent: cancelling a finished job returns it unchanged. */
  async cancel(jobId: string) {
    return (await apiFetch<AiJob>(`/v1/ai/jobs/${id(jobId)}/cancel`, { method: 'POST', maxAttempts: 3 })).data
  },
  /** Actions a WAITING_APPROVAL job wants to take, with a server-written preview. Empty otherwise. */
  async approvals(jobId: string, signal?: AbortSignal) {
    return (await apiFetch<AiApprovals>(`/v1/ai/jobs/${id(jobId)}/approvals`, { signal })).data
  },
  /** One decision per action. A stale `stateVersion` is 409 AI_JOB_STATE_CHANGED: reload the approvals. */
  async decideApproval(jobId: string, toolCallId: string, decision: ApprovalDecision, stateVersion: number) {
    return (await apiFetch<AiJob>(`/v1/ai/jobs/${id(jobId)}/approvals/${id(toolCallId)}`, { method: 'POST', body: { decision, stateVersion }, maxAttempts: 2 })).data
  },
  /** The waiting choice for a WAITING_CLARIFICATION job. A job that is not waiting is 409 AI_JOB_NOT_WAITING. */
  async clarification(jobId: string, signal?: AbortSignal) {
    return (await apiFetch<RunClarification>(`/v1/ai/jobs/${id(jobId)}/clarification`, { signal })).data
  },
  /**
   * Answers the waiting choice; the same run resumes. One `idempotencyKey` per pick; a stale
   * `stateVersion` is 409 AI_JOB_STATE_CHANGED (reload the choices), an expired wait is 410
   * AI_CLARIFICATION_EXPIRED, and an option outside the checkpoint is 422 AI_CLARIFICATION_INVALID.
   */
  async answerClarification(jobId: string, body: { option: ClarifyOptionId; figureId?: string; stateVersion: number }, idempotencyKey: string) {
    return (await apiFetch<AiJob>(`/v1/ai/jobs/${id(jobId)}/clarification`, { method: 'POST', body, idempotencyKey, maxAttempts: 2 })).data
  },
  async allowance(signal?: AbortSignal) {
    return (await apiFetch<AiAllowance>('/v1/ai/allowance', { signal, maxAttempts: 1 })).data
  },
}

/** Every event type the stream names (SSE delivers each as its own named event). */
const STREAM_EVENT_TYPES = [
  'ACCEPTED', 'STEP_STARTED', 'STEP_COMPLETED', 'WAITING_TURN', 'DEFERRED', 'CHILDREN_STARTED', 'CHILDREN_FINISHED',
  'APPROVAL_REQUESTED', 'APPROVED', 'REJECTED', 'APPROVAL_EXPIRED', 'TOOL_WAITING', 'TOOL_RESUMED',
  'CLARIFICATION_REQUESTED', 'CLARIFIED', 'CLARIFICATION_EXPIRED',
  'TOOL_STARTED', 'TOOL_FINISHED', 'COMPLETED', 'FAILED', 'CANCELED', 'EXPIRED',
] as const satisfies readonly AiJobEvent['type'][]

/**
 * Follows a job's events live over `GET /v1/ai/jobs/{id}/stream` (SSE), from after `after`.
 * Resolves `'done'` once the job is terminal, or `'fallback'` when the stream can't be used or
 * closes early (an error, a `timeout` close, too many open streams): the caller then polls
 * `/events` from the last `seq` it saw, so nothing is lost or repeated.
 */
export function streamJobEvents(jobId: string, after: number, onEvent: (event: AiJobEvent) => void, signal: AbortSignal): Promise<'done' | 'fallback'> {
  return new Promise((resolve) => {
    if (typeof EventSource === 'undefined' || signal.aborted) return resolve('fallback')
    const source = new EventSource(`/v1/ai/jobs/${id(jobId)}/stream?after=${after}`, { withCredentials: true })
    const finish = (result: 'done' | 'fallback') => { source.close(); signal.removeEventListener('abort', abort); resolve(result) }
    const abort = () => finish('fallback')
    signal.addEventListener('abort', abort, { once: true })
    const onMessage = (message: MessageEvent<string>) => {
      try { onEvent(JSON.parse(message.data) as AiJobEvent) } catch { /* a malformed message is skipped; polling would not see it either */ }
    }
    for (const type of STREAM_EVENT_TYPES) source.addEventListener(type, onMessage)
    source.addEventListener('done', () => finish('done'))
    source.addEventListener('timeout', () => finish('fallback'))
    // EventSource would retry on its own; one path at a time, so hand over to polling instead.
    source.onerror = () => finish('fallback')
  })
}
