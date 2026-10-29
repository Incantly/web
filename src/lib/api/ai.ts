import { apiFetch } from './client'
import type { Schema } from './types'

export type AiScope = Schema<'AiScopeDto'>
/** `clarified` has a server default (the generated schema marks it required). */
export type AiRequest = Omit<Schema<'AiRequestDto'>, 'clarified'> & { clarified?: boolean }
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
  async allowance(signal?: AbortSignal) {
    return (await apiFetch<AiAllowance>('/v1/ai/allowance', { signal, maxAttempts: 1 })).data
  },
}
