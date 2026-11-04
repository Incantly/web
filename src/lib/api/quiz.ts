import { apiFetch } from './client'
import type { Schema } from './types'

export type AttemptDto = Schema<'AttemptDto'>
export type AttemptStartedDto = Schema<'AttemptStartedDto'>
export type AttemptSummaryDto = Schema<'AttemptSummaryDto'>
export type AttemptResultDto = Schema<'AttemptResultDto'>
export type QuizQuestionDto = Schema<'QuizQuestionDto'>
export type QuizOptionDto = Schema<'QuizOptionDto'>
export type ResultQuestionDto = Schema<'ResultQuestionDto'>
export type ResultCitationDto = Schema<'ResultCitationDto'>
export type QuizQuestionType = QuizQuestionDto['type']
export type AttemptState = AttemptDto['state']

/** One answer value as sent to the server (AnswersDto/SubmitDto): option ID, boolean, short text, ID array, or blank/left-ID map. Null clears. */
export type QuizAnswerInput = string | boolean | string[] | Record<string, string> | null
export type QuizAnswerMap = Record<string, QuizAnswerInput>

const id = (value: string) => encodeURIComponent(value)

/** Thin wrappers over the quiz-attempt routes (frontend-api-integration.md, "Taking a quiz" + "Results"). Scoring is server-side; the client sends answers and renders results. */
export const quizApi = {
  /** Starts an attempt, bound to the quiz's current version. One idempotency key per Start press; a same-key retry replays the same attempt. */
  async start(quizId: string, idempotencyKey: string) {
    return (await apiFetch<AttemptStartedDto>(`/v1/quizzes/${id(quizId)}/attempts`, { method: 'POST', idempotencyKey })).data
  },
  /** The newest 50 attempts at a quiz, with scores. */
  async history(quizId: string, signal?: AbortSignal) {
    return (await apiFetch<Schema<'AttemptHistoryDto'>>(`/v1/quizzes/${id(quizId)}/attempts`, { signal })).data.items
  },
  /** Resumes an attempt: its questions in order plus the answers saved so far. Never the correct answers. */
  async getAttempt(attemptId: string, signal?: AbortSignal) {
    return (await apiFetch<AttemptDto>(`/v1/quiz-attempts/${id(attemptId)}`, { signal })).data
  },
  /** Merges answers into an in-progress attempt. Safe to retry; null clears one question. */
  async saveAnswers(attemptId: string, answers: QuizAnswerMap) {
    return (await apiFetch<AttemptDto>(`/v1/quiz-attempts/${id(attemptId)}/answers`, { method: 'PUT', body: { answers } })).data
  },
  /** Grades the attempt once and returns the result. A repeat submit returns the same grade. */
  async submit(attemptId: string, body: Schema<'SubmitDto'>, idempotencyKey: string) {
    return (await apiFetch<AttemptResultDto>(`/v1/quiz-attempts/${id(attemptId)}/submit`, { method: 'POST', body, idempotencyKey })).data
  },
  /** Reads a submitted attempt's scored result. `409 QUIZ_ATTEMPT_NOT_SUBMITTED` means submit first. */
  async result(attemptId: string, signal?: AbortSignal) {
    return (await apiFetch<AttemptResultDto>(`/v1/quiz-attempts/${id(attemptId)}/result`, { signal })).data
  },
}
