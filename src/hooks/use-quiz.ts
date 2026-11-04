'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createFeatureContext, useFeatureContext } from '@/components/product/features/createFeatureContext'
import type { ListStatus } from '@/components/product/workspace/views'
import {
  QUIZ_RESULT_POLL_MS,
  QUIZ_SAVE_DEBOUNCE_MS,
  attemptDeadline,
  countAnswered,
  draftFromAttempt,
  timeLeftCopy,
  type DraftAnswers,
} from '@/components/product/workspace/quizModel'
import { isApiError } from '@/lib/api/errors'
import { newIdempotencyKey } from '@/lib/api/idempotency'
import { quizApi, type AttemptDto, type AttemptResultDto, type AttemptSummaryDto, type QuizAnswerInput, type QuizAnswerMap } from '@/lib/api/quiz'
import { useOnlineStatus } from '@/hooks/use-sharing'

export const quizHistoryKey = (quizId: string) => ['quiz-history', quizId] as const
export const quizAttemptKey = (attemptId: string) => ['quiz-attempt', attemptId] as const
export const quizResultKey = (attemptId: string) => ['quiz-result', attemptId] as const

export type OpenQuizAttempt = { quizId: string; attemptId: string }

export type QuizValue = {
  online: boolean
  /** The attempt open in the taker or result view, if any (memory only). */
  openAttempt: OpenQuizAttempt | null
  openQuizAttempt: (quizId: string, attemptId: string) => void
  closeQuizAttempt: () => void
}

export const QuizContext = createFeatureContext<QuizValue>('Quiz')

/** Which quiz attempt is open, plus the connection state quiz surfaces render. Runs once, in `QuizProvider`. */
export function useQuizState(): QuizValue {
  const online = useOnlineStatus()
  const [openAttempt, setOpenAttempt] = useState<OpenQuizAttempt | null>(null)
  const openQuizAttempt = useCallback((quizId: string, attemptId: string) => setOpenAttempt({ quizId, attemptId }), [])
  const closeQuizAttempt = useCallback(() => setOpenAttempt(null), [])
  return useMemo<QuizValue>(() => ({ online, openAttempt, openQuizAttempt, closeQuizAttempt }), [online, openAttempt, openQuizAttempt, closeQuizAttempt])
}

/** The open quiz attempt and connection state. Must be used inside `WorkspaceProviders`. */
export function useQuiz(): QuizValue {
  return useFeatureContext(QuizContext)
}

export type QuizScreenValue = {
  online: boolean
  history: AttemptSummaryDto[]
  historyStatus: ListStatus
  starting: boolean
  startError: unknown
  clearStartError: () => void
  /** Starts an attempt and opens it in the taker. Stays on errors for the view to render. */
  startAttempt: () => Promise<void>
  resumeAttempt: (attemptId: string) => void
  backToHistory: () => void
}

/**
 * One quiz's attempt history plus starting and resuming. The quiz screen only
 * draws this state; taking and results live in `useQuizAttempt`.
 */
export function useQuizScreen(quizId: string): QuizScreenValue {
  const client = useQueryClient()
  const { online, openQuizAttempt, closeQuizAttempt } = useQuiz()
  const query = useQuery({
    queryKey: quizHistoryKey(quizId),
    queryFn: ({ signal }) => quizApi.history(quizId, signal),
    meta: { silentErrors: true },
  })
  const { isPending, isError, error, refetch } = query
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<unknown>(null)

  const startAttempt = useCallback(async () => {
    if (starting) return
    setStarting(true)
    setStartError(null)
    try {
      // One key per Start press, reused unchanged if the request itself retries.
      const started = await quizApi.start(quizId, newIdempotencyKey())
      void client.invalidateQueries({ queryKey: quizHistoryKey(quizId) })
      openQuizAttempt(quizId, started.attempt.attemptId)
    } catch (failure) {
      setStartError(failure)
    } finally {
      setStarting(false)
    }
  }, [starting, quizId, client, openQuizAttempt])

  const resumeAttempt = useCallback((attemptId: string) => openQuizAttempt(quizId, attemptId), [openQuizAttempt, quizId])
  const backToHistory = useCallback(() => closeQuizAttempt(), [closeQuizAttempt])
  const clearStartError = useCallback(() => setStartError(null), [])

  return useMemo<QuizScreenValue>(() => ({
    online,
    history: query.data ?? [],
    historyStatus: { loading: isPending, error: isError ? error : null, retry: () => void refetch() },
    starting,
    startError,
    clearStartError,
    startAttempt,
    resumeAttempt,
    backToHistory,
  }), [online, query.data, isPending, isError, error, refetch, starting, startError, clearStartError, startAttempt, resumeAttempt, backToHistory])
}

export type QuizSaveState = 'idle' | 'saving' | 'saved' | 'error' | 'offline'

export type QuizAttemptValue = {
  online: boolean
  attempt: AttemptDto | null
  attemptStatus: ListStatus
  draft: DraftAnswers
  setAnswer: (questionId: string, value: QuizAnswerInput | undefined) => void
  /** Clears one question: sends null so the server drops the saved answer. */
  clearAnswer: (questionId: string) => void
  saveState: QuizSaveState
  savedAt: number | null
  saveError: unknown
  retrySave: () => void
  /** True when the save failed because the timed attempt expired: submit instead. */
  saveExpired: boolean
  answered: number
  total: number
  /** Countdown from the server deadline, or null when untimed. */
  timeLeft: string | null
  confirming: boolean
  requestSubmit: () => void
  cancelSubmit: () => void
  submitting: boolean
  submitError: unknown
  clearSubmitError: () => void
  /** Grades once and shows the result. Stays on errors for the view to render. */
  confirmSubmit: () => Promise<void>
  result: AttemptResultDto | null
  resultStatus: ListStatus
  backToHistory: () => void
}

function sameAnswer(left: QuizAnswerInput | undefined, right: QuizAnswerInput | undefined): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null)
}

/** Draft entries that differ from the last saved snapshot, ready to merge. */
function dirtyEntries(draft: DraftAnswers, saved: DraftAnswers): QuizAnswerMap {
  const dirty: QuizAnswerMap = {}
  for (const key of new Set([...Object.keys(draft), ...Object.keys(saved)])) {
    const value = draft[key]
    if (!sameAnswer(value, saved[key]) && value !== undefined) dirty[key] = value
  }
  return dirty
}

/**
 * Taking one attempt: the draft answers, debounced autosave with a saved
 * indicator, submit with confirm, and the scored result. Scoring stays
 * server-side; this only sends answers and renders what comes back.
 */
export function useQuizAttempt(quizId: string, attemptId: string): QuizAttemptValue {
  const client = useQueryClient()
  const { online, closeQuizAttempt } = useQuiz()
  const attemptQuery = useQuery({
    queryKey: quizAttemptKey(attemptId),
    queryFn: ({ signal }) => quizApi.getAttempt(attemptId, signal),
    meta: { silentErrors: true },
  })
  const attempt = attemptQuery.data ?? null
  const submitted = attempt?.state === 'SUBMITTED'

  const [submitResult, setSubmitResult] = useState<AttemptResultDto | null>(null)
  const resultQuery = useQuery({
    queryKey: quizResultKey(attemptId),
    queryFn: ({ signal }) => quizApi.result(attemptId, signal),
    enabled: submitted || submitResult !== null,
    // Explanations land in the background: re-read until they are complete.
    refetchInterval: (query) => (query.state.data?.explanationsComplete === false ? QUIZ_RESULT_POLL_MS : false),
    meta: { silentErrors: true },
  })
  const result = submitResult ?? resultQuery.data ?? null

  const [draft, setDraft] = useState<DraftAnswers>({})
  const [hydratedId, setHydratedId] = useState<string | null>(null)
  /** The last answers the server confirmed (or stopped accepting), for the dirty check. */
  const [saved, setSaved] = useState<DraftAnswers>({})
  const [saveState, setSaveState] = useState<QuizSaveState>('idle')
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [saveError, setSaveError] = useState<unknown>(null)
  const [saveNonce, setSaveNonce] = useState(0)

  // A fresh attempt (or a resumed one) starts the draft from its saved answers.
  // Adjusted during render from the previous attempt id, so no effect is needed.
  if (attempt && hydratedId !== attempt.attemptId) {
    const next = draftFromAttempt(attempt)
    setDraft(next)
    setSaved(next)
    setHydratedId(attempt.attemptId)
    setSaveState('idle')
    setSaveError(null)
  }

  const saveNow = useCallback(async (answers: QuizAnswerMap) => {
    setSaveState('saving')
    try {
      const merged = await quizApi.saveAnswers(attemptId, answers)
      setSaved((current) => ({ ...current, ...answers }))
      client.setQueryData<AttemptDto>(quizAttemptKey(attemptId), merged)
      setSaveState('saved')
      setSavedAt(Date.now())
      setSaveError(null)
    } catch (failure) {
      if (isApiError(failure, 'QUIZ_ATTEMPT_EXPIRED') || isApiError(failure, 'QUIZ_ATTEMPT_SUBMITTED')) {
        // The attempt moved on (autosave stops mattering): don't retry these forever.
        setSaved((current) => ({ ...current, ...answers }))
      }
      setSaveState('error')
      setSaveError(failure)
    }
  }, [attemptId, client])

  // Autosave: debounce the draft, hold it while offline, retry on reconnect.
  // The indicator reads 'saving' from the edit handlers and 'offline' from the
  // render below, so this effect only schedules the request itself.
  useEffect(() => {
    if (!attempt || submitted || hydratedId !== attempt.attemptId || !online) return
    const dirty = dirtyEntries(draft, saved)
    if (Object.keys(dirty).length === 0) return
    const timer = setTimeout(() => void saveNow(dirty), QUIZ_SAVE_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [attempt, submitted, hydratedId, draft, saved, online, saveNonce, saveNow])

  const setAnswer = useCallback((questionId: string, value: QuizAnswerInput | undefined) => {
    setSaveState('saving')
    setDraft((current) => (value === undefined ? Object.fromEntries(Object.entries(current).filter(([key]) => key !== questionId)) : { ...current, [questionId]: value }))
  }, [])
  const clearAnswer = useCallback((questionId: string) => {
    setSaveState('saving')
    setDraft((current) => ({ ...current, [questionId]: null }))
  }, [])
  const retrySave = useCallback(() => {
    setSaveError(null)
    setSaveState('saving')
    setSaveNonce((nonce) => nonce + 1)
  }, [])

  const [confirming, setConfirming] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<unknown>(null)

  const requestSubmit = useCallback(() => {
    setSubmitError(null)
    setConfirming(true)
  }, [])
  const cancelSubmit = useCallback(() => setConfirming(false), [])
  const clearSubmitError = useCallback(() => setSubmitError(null), [])

  const confirmSubmit = useCallback(async () => {
    if (submitting) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      // Merge whatever never saved (offline edits, expired autosave) into the grade.
      const dirty = dirtyEntries(draft, saved)
      const graded = await quizApi.submit(attemptId, Object.keys(dirty).length > 0 ? { answers: dirty } : {}, newIdempotencyKey())
      setSaved((current) => ({ ...current, ...dirty }))
      setSubmitResult(graded)
      setConfirming(false)
      void client.invalidateQueries({ queryKey: quizHistoryKey(quizId) })
      void client.invalidateQueries({ queryKey: quizAttemptKey(attemptId) })
    } catch (failure) {
      setSubmitError(failure)
    } finally {
      setSubmitting(false)
    }
  }, [submitting, draft, saved, attemptId, quizId, client])

  // The countdown ticks locally but always from the server deadline.
  const deadline = attempt && !submitted ? attemptDeadline(attempt) : null
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!deadline) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [deadline])

  const backToHistory = useCallback(() => closeQuizAttempt(), [closeQuizAttempt])

  return useMemo<QuizAttemptValue>(() => {
    const questions = attempt?.questions ?? []
    const hasUnsaved = Object.keys(dirtyEntries(draft, saved)).length > 0
    return {
      online,
      attempt,
      attemptStatus: { loading: attemptQuery.isPending, error: attemptQuery.isError ? attemptQuery.error : null, retry: () => void attemptQuery.refetch() },
      draft,
      setAnswer,
      clearAnswer,
      saveState: !online && (saveState === 'saving' || saveState === 'error' || hasUnsaved) ? 'offline' : saveState,
      savedAt,
      saveError,
      retrySave,
      saveExpired: isApiError(saveError, 'QUIZ_ATTEMPT_EXPIRED'),
      answered: countAnswered(questions, draft),
      total: questions.length,
      timeLeft: timeLeftCopy(deadline, now),
      confirming,
      requestSubmit,
      cancelSubmit,
      submitting,
      submitError,
      clearSubmitError,
      confirmSubmit,
      result,
      resultStatus: {
        loading: resultQuery.isPending,
        error: resultQuery.isError ? resultQuery.error : null,
        retry: () => void resultQuery.refetch(),
      },
      backToHistory,
    }
  }, [online, attempt, attemptQuery, draft, saved, setAnswer, clearAnswer, saveState, savedAt, saveError, retrySave, deadline, now, confirming, requestSubmit, cancelSubmit, submitting, submitError, clearSubmitError, confirmSubmit, result, resultQuery, backToHistory])
}
