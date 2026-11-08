'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import type { NoteSession } from '@/components/product/workspace/useNoteSession'
import { canRetrySimulation, conceptFromSelection, simulationEventEnergy, simulationEventLabel, simulationFailureMessage, simulationFigureNodeId } from '@/components/product/workspace/simulationModel'
import { ApiError, apiErrorMessage, isApiError } from '@/lib/api/errors'
import { newIdempotencyKey } from '@/lib/api/idempotency'
import { poll } from '@/lib/api/poll'
import { simulationsApi, streamSimulationEvents, type CreateSimulationBody, type SimulationJob, type SimulationJobEvent, type SimulationSelectionRange } from '@/lib/api/simulations'
import { selectedText, selectedTextRanges } from '@/lib/document-editor/blockNavigation'
import { placeSimulationFigure, type SimulationPlacement } from '@/lib/document-editor/figures'
import { NOTE_SIMULATION_KEY, anchorNodeIdForSelection, animateFigureReveal, failSimulationPlaceholder, hideSimulationPlaceholder, showSimulationPlaceholder, updateSimulationPlaceholder } from '@/lib/document-editor/simulationPlaceholder'

export type SimulationFigurePhase =
  | { phase: 'idle' }
  | { phase: 'working'; label: string; energy?: 0 | 1 | 2 }
  | { phase: 'done'; text: string }
  | { phase: 'failed'; message: string; retryable: boolean }

type Attempt = {
  concept: string
  ranges: SimulationSelectionRange[]
  anchorNodeId: string | null
  key: string
  /** Set once the job exists; retrying then resumes the job instead of posting again. */
  jobId: string | null
}

type PendingPlacement = SimulationPlacement & { fallback: boolean }

const UNSAVED = 'Your latest edits haven’t saved yet. Try again once the note says Saved.'
const WAITING_SAVE = 'Waiting for your edits to save…'
/** How long placement waits for a draining save before asking for an explicit retry. */
const SAVE_WAIT_ATTEMPTS = 15
const SAVE_WAIT_MS = 2_000

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason)
    const timer = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve() }, ms)
    const onAbort = () => { clearTimeout(timer); reject(signal.reason) }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * "Generate simulation" in the open note: posts the selected text as the concept, follows the
 * job's progress, and places the approved figure at the selection. Used once, by the note
 * screen. One generation runs at a time; the server attaches the figure node as a new revision,
 * so completion reloads the note (like suggestion decisions) and inserts locally only when the
 * server could not attach — with the same stable ID, so exactly one node ever exists.
 */
export function useSimulationFigure(noteId: string, session: NoteSession, editor: Editor | null) {
  const [status, setStatus] = useState<SimulationFigurePhase>({ phase: 'idle' })
  const [pendingPlacement, setPendingPlacement] = useState<PendingPlacement | null>(null)
  const runRef = useRef<AbortController | null>(null)
  const attemptRef = useRef<Attempt | null>(null)
  const placingRef = useRef(false)
  const placeholderShownRef = useRef(false)
  const editorRef = useRef(editor)
  useEffect(() => { editorRef.current = editor })

  useEffect(() => () => {
    runRef.current?.abort()
    runRef.current = null
    const live = editorRef.current
    if (live && !live.isDestroyed) hideSimulationPlaceholder(live, NOTE_SIMULATION_KEY, false)
  }, [])

  const fail = useCallback((message: string, retryable: boolean) => {
    setStatus({ phase: 'failed', message, retryable })
  }, [])

  const settleError = useCallback((error: unknown, attempt: Attempt) => {
    if (isApiError(error, 'NOTE_ACCESS_DENIED')) {
      attemptRef.current = null
      session.markAccessDenied(error)
      fail(apiErrorMessage(error), false)
      return
    }
    if (isApiError(error, 'NOTE_NOT_FOUND')) {
      attemptRef.current = null
      fail(apiErrorMessage(error), false)
      return
    }
    const code = error instanceof ApiError ? error.code : null
    if (code === 'SIMULATION_JOB_NOT_FOUND') {
      // The job is gone mid-follow: a retry starts a new one.
      attempt.jobId = null
      attempt.key = newIdempotencyKey()
    }
    fail(code === 'NOTE_REVISION_NOT_FOUND' ? simulationFailureMessage(code, 'FAILED') : apiErrorMessage(error), canRetrySimulation(code))
  }, [session, fail])

  const settleJob = useCallback(async (job: SimulationJob, attempt: Attempt, signal: AbortSignal) => {
    if (job.status === 'FAILED' || job.status === 'EXPIRED') {
      const message = simulationFailureMessage(job.failureCode, job.status)
      const retryable = canRetrySimulation(job.failureCode)
      if (job.failureCode === 'NOTE_ACCESS_DENIED') session.markAccessDenied(new ApiError(403, 'NOTE_ACCESS_DENIED', null, null))
      if (retryable) {
        // A retry starts a NEW job: replaying the old key would return this failed one.
        attempt.jobId = null
        attempt.key = newIdempotencyKey()
      } else {
        attemptRef.current = null
      }
      fail(message, retryable)
      return
    }
    if (job.status !== 'COMPLETED' || !job.figure) {
      attempt.jobId = null
      attempt.key = newIdempotencyKey()
      fail(simulationFailureMessage('SIMULATION_FIGURE_MISSING', job.status), true)
      return
    }
    const placement: PendingPlacement = {
      jobId: job.jobId,
      nodeId: simulationFigureNodeId(job.jobId),
      concept: job.concept,
      sdkVersion: job.figure.sdkVersion,
      anchorNodeId: attempt.anchorNodeId,
      fallback: job.figure.fallback,
    }
    if (!job.figure.nodeId) {
      // The server stored the figure but attached nothing: place it locally, no reload needed.
      setStatus({ phase: 'working', label: 'Placing it in your note…', energy: 1 })
      setPendingPlacement(placement)
      return
    }
    // The server attached the node as a new revision: drain local edits, then load it. The
    // load remounts the editor on the legacy path (or patches the live Yjs doc without a
    // reload); either way the placement effect below reveals the node there.
    setStatus({ phase: 'working', label: 'Placing it in your note…', energy: 1 })
    for (let waited = 0; ; waited++) {
      const state = await session.flush()
      if (signal.aborted) return
      if (state && state.pending === 0) break
      if (waited + 1 >= SAVE_WAIT_ATTEMPTS) {
        fail('Your figure is ready. It will appear once your edits finish saving — retry then.', true)
        return
      }
      setStatus({ phase: 'working', label: WAITING_SAVE, energy: 1 })
      await sleep(SAVE_WAIT_MS, signal)
    }
    if (signal.aborted) return
    // A failed reload throws before the placement is armed, so the effect below never places
    // against a document that lacks the server's node (that would duplicate its stable ID).
    await session.applyServerHead('figure')
    if (signal.aborted) return
    setPendingPlacement(placement)
  }, [session, fail])

  /** Runs the stored attempt: creates the job unless it already exists, follows it, settles it. */
  const runAttempt = useCallback(async () => {
    const attempt = attemptRef.current
    if (!attempt || runRef.current) return
    const controller = new AbortController()
    runRef.current = controller
    setStatus({ phase: 'working', label: 'Starting…', energy: 0 })
    try {
      const state = await session.flush()
      if (controller.signal.aborted) return
      if (!state || state.pending > 0) {
        fail(UNSAVED, true)
        return
      }
      let jobId = attempt.jobId
      if (!jobId) {
        const body: CreateSimulationBody = {
          concept: attempt.concept,
          noteId,
          selection: { revisionNumber: state.revisionNumber, ranges: attempt.ranges },
        }
        try {
          jobId = (await simulationsApi.create(body, attempt.key)).jobId
        } catch (error) {
          if (controller.signal.aborted) return
          if (isApiError(error, 'IDEMPOTENCY_KEY_REUSED')) {
            // A UUID collision with an unrelated request: one recovery with a fresh key.
            attempt.key = newIdempotencyKey()
            jobId = (await simulationsApi.create(body, attempt.key)).jobId
          } else {
            throw error
          }
        }
        attempt.jobId = jobId
      }
      if (controller.signal.aborted) return
      // Live over the stream; if it can't be used or closes early, poll on from the last event seen.
      let after = -1
      const take = (events: SimulationJobEvent[]) => {
        for (const event of events) {
          after = Math.max(after, event.seq)
          const label = simulationEventLabel(event)
          if (label) setStatus({ phase: 'working', label, energy: simulationEventEnergy(event) })
        }
      }
      const streamed = await streamSimulationEvents(jobId, after, (event) => take([event]), controller.signal)
      if (controller.signal.aborted) return
      if (streamed !== 'done') {
        await poll(async () => {
          const page = await simulationsApi.events(jobId, after, controller.signal)
          take(page.events)
          after = page.nextAfter
          return page
        }, (page) => page.done, { signal: controller.signal, maxMs: 4000 })
      }
      const job = await simulationsApi.job(jobId, controller.signal)
      if (controller.signal.aborted) return
      await settleJob(job, attempt, controller.signal)
    } catch (error) {
      if (controller.signal.aborted) return
      settleError(error, attempt)
    } finally {
      if (runRef.current === controller) runRef.current = null
    }
  }, [noteId, session, fail, settleJob, settleError])

  // Places a completed figure once its editor is ready — including the remount after the
  // completion reload. Idempotent: a second run finds the node and only reveals it. The
  // placeholder fades as the figure reveals beneath it: the slow reveal, not a snap.
  useEffect(() => {
    if (!pendingPlacement || !editor || editor.isDestroyed || placingRef.current) return
    placingRef.current = true
    const placement = pendingPlacement
    void placeSimulationFigure(editor, placement)
      .then((placed) => {
        if (!placed) {
          fail('Your figure is ready, but it couldn’t be placed. Retry to place it.', true)
          return
        }
        attemptRef.current = null
        placeholderShownRef.current = false
        animateFigureReveal(editor, placed.nodeId)
        hideSimulationPlaceholder(editor, NOTE_SIMULATION_KEY, true)
        setStatus({
          phase: 'done',
          text: placement.fallback ? 'Your figure is ready — a reviewed standard version for this idea.' : 'Your figure is ready.',
        })
      })
      .catch(() => fail('Your figure is ready, but it couldn’t be placed. Retry to place it.', true))
      .finally(() => {
        placingRef.current = false
        setPendingPlacement((current) => (current === placement ? null : current))
      })
  }, [pendingPlacement, editor, fail])

  const generate = useCallback((target: Editor | null) => {
    if (runRef.current) return
    const current = target ?? editorRef.current
    const ranges = selectedTextRanges(current)
    // The placeholder anchors here even when validation fails, so every generation state
    // — including "select text first" — renders in the note, never in a floating pill.
    const anchorNodeId = current && !current.isDestroyed ? anchorNodeIdForSelection(current, ranges) : null
    const checked = conceptFromSelection(selectedText(current))
    if (!ranges.length || 'error' in checked) {
      attemptRef.current = { concept: '', ranges, anchorNodeId, key: newIdempotencyKey(), jobId: null }
      fail('error' in checked ? checked.error : 'Select some text in the note first.', false)
      return
    }
    attemptRef.current = { concept: checked.concept, ranges, anchorNodeId, key: newIdempotencyKey(), jobId: null }
    placeholderShownRef.current = false
    void runAttempt()
  }, [runAttempt, fail])

  /** Retries the stored attempt: resumes its job when one exists, else posts it again. */
  const retry = useCallback(() => {
    // Validation failures keep an anchor-only attempt so the error renders in the note;
    // there is no concept to post, so retrying is a no-op until the selection changes.
    if (runRef.current || !attemptRef.current?.concept) return
    void runAttempt()
  }, [runAttempt])

  const dismiss = useCallback(() => {
    if (runRef.current) return
    attemptRef.current = null
    setPendingPlacement(null)
    setStatus({ phase: 'idle' })
  }, [])

  // Every generation state renders in the note at the anchor: working updates the shader's
  // label and energy, failures swap in the message with retry/dismiss, idle clears. Done is
  // handled by the placement effect (fade + reveal), never here.
  useEffect(() => {
    const live = editor
    if (!live || live.isDestroyed) {
      placeholderShownRef.current = false
      return
    }
    if (status.phase === 'idle') {
      if (placeholderShownRef.current) {
        placeholderShownRef.current = false
        hideSimulationPlaceholder(live, NOTE_SIMULATION_KEY, false)
      }
      return
    }
    if (status.phase === 'done') return
    const anchorNodeId = attemptRef.current?.anchorNodeId ?? null
    if (status.phase === 'failed') {
      if (!placeholderShownRef.current) {
        placeholderShownRef.current = true
        showSimulationPlaceholder(live, { key: NOTE_SIMULATION_KEY, anchorNodeId, label: status.message, energy: 1, onRetry: retry, onDismiss: dismiss })
      }
      failSimulationPlaceholder(live, NOTE_SIMULATION_KEY, status.message, status.retryable)
      return
    }
    if (!placeholderShownRef.current) {
      placeholderShownRef.current = true
      showSimulationPlaceholder(live, { key: NOTE_SIMULATION_KEY, anchorNodeId, label: status.label, energy: status.energy ?? 1, onRetry: retry, onDismiss: dismiss })
      return
    }
    updateSimulationPlaceholder(live, NOTE_SIMULATION_KEY, status.label, status.energy ?? 1)
  }, [status, editor, retry, dismiss])

  return {
    status,
    busy: status.phase === 'working',
    generate,
    retry,
    dismiss,
  }
}
