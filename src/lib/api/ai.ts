import { apiFetch } from './client'
import type { Schema } from './types'

export type AiScope = Schema<'AiScopeDto'>
/** `clarified` and `webSearch` have server defaults (the generated schema marks them required). */
export type AiRequest = Omit<Schema<'AiRequestDto'>, 'clarified' | 'webSearch'> & { clarified?: boolean; webSearch?: boolean }
/** Text selected in the note editor: block IDs and UTF-16 offsets, never the text itself. */
export type NoteSelection = Schema<'NoteSelectionDto'>
export type SelectionRange = Schema<'SelectionRangeDto'>
export type AiCommand = NonNullable<AiRequest['command']>
export type AiJob = Schema<'AiJobDto'>
export type AiJobStatus = AiJob['status']
export type AiJobEvent = Schema<'AiJobEventDto'>
export type AiJobEvents = Schema<'AiJobEventsDto'>
export type AiAccepted = Schema<'AiJobAcceptedDto'>
export type AiClarification = Schema<'AiClarificationDto'>
export type ClarificationOption = Schema<'ClarificationOptionDto'>
export type GroundedAnswer = Schema<'GroundedAnswerResultDto'>
export type PracticeQuestions = Schema<'PracticeQuestionsResultDto'>
export type AnswerCitation = Schema<'CitationDto'>
export type CitedPassage = Schema<'CitedPassageDto'>
export type AiAllowance = Schema<'AiAllowanceDto'>
export type NoteAssistResult = Schema<'NoteAssistResultDto'>
export type AiApprovals = Schema<'AiApprovalsDto'>
export type PendingApproval = Schema<'PendingApprovalDto'>
export type ApprovalDecision = Schema<'ApprovalDecisionDto'>['decision']

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
  /** Completed jobs only (`404 AI_RESULT_NOT_READY` otherwise). Passage text is untrusted: render it as text. */
  async citations(jobId: string, signal?: AbortSignal) {
    return (await apiFetch<Schema<'AiCitationsDto'>>(`/v1/ai/jobs/${id(jobId)}/citations`, { signal })).data
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
  async allowance(signal?: AbortSignal) {
    return (await apiFetch<AiAllowance>('/v1/ai/allowance', { signal, maxAttempts: 1 })).data
  },
}

/** Every event type the stream names (SSE delivers each as its own named event). */
const STREAM_EVENT_TYPES = [
  'ACCEPTED', 'STEP_STARTED', 'STEP_COMPLETED', 'WAITING_TURN', 'DEFERRED', 'CHILDREN_STARTED', 'CHILDREN_FINISHED',
  'APPROVAL_REQUESTED', 'APPROVED', 'REJECTED', 'APPROVAL_EXPIRED', 'TOOL_WAITING', 'TOOL_RESUMED',
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
