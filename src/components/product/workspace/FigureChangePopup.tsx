'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { AppIcon } from '../AppIcon'
import { FigureChangeCover } from './FigureChangeCover'
import type { NoteSession } from './useNoteSession'
import { FIGURE_CHANGE_EVENT, type FigureChangeDetail } from '@/lib/document-editor/figureChange'
import { swapFigureSource } from '@/lib/document-editor/figures'
import { ApiError, apiErrorMessage, isApiError } from '@/lib/api/errors'
import { newIdempotencyKey } from '@/lib/api/idempotency'
import { poll } from '@/lib/api/poll'
import { simulationsApi, streamSimulationEvents, type SimulationJob, type SimulationJobEvent } from '@/lib/api/simulations'
import { buttonPrimary, buttonQuiet, iconButton, inputClass } from './ui'
import { canRetrySimulation, instructionFromInput, simulationEventEnergy, simulationEventLabel, simulationFailureMessage } from './simulationModel'
import type { PlaceholderEnergy } from '@/lib/document-editor/pixelShader'

type PopupPhase = { phase: 'input'; error?: string } | { phase: 'working'; label: string; energy: PlaceholderEnergy; figureId: string } | { phase: 'failed'; message: string; retryable: boolean }

/**
 * An open popup is anchored to a NODE, not a figure: node IDs are stable across edits and
 * sync, while a node's figureId moves on every swap. The popup resolves the node's CURRENT
 * figureId at submit time, so a change always parents what the note shows — never a figure
 * the tab mounted from a stale cache, and never one a live-sync update already replaced.
 */
type OpenPopup = { nodeId: string; anchor: HTMLElement }

function figureNodeIdByFigure(editor: Editor, figureId: string): string | null {
  let found: string | null = null
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'incantlyFigure' && node.attrs.figureId === figureId && typeof node.attrs.id === 'string' && node.attrs.id) {
      found = node.attrs.id
      return false
    }
    return true
  })
  return found
}

function figureIdByNode(editor: Editor, nodeId: string): string | null {
  let found: string | null = null
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'incantlyFigure' && node.attrs.id === nodeId && typeof node.attrs.figureId === 'string' && node.attrs.figureId) {
      found = node.attrs.figureId
      return false
    }
    return true
  })
  return found
}

const POPUP_WIDTH = 320
const POPUP_GAP = 8

/**
 * "Change this figure", under the figure's edit button. The button lives in the editor as a
 * widget decoration (`figureChange.ts`) and only announces its figure; this popup owns the
 * instruction, posts the change job, follows it like a generation, and swaps the new figure
 * into the note as the learner's own edit. A FAILED change never touches the note: the
 * parent figure stays as it was, and the instruction stays for editing.
 */
export function FigureChangePopup({ editor, session }: { editor: Editor | null; session: NoteSession }) {
  const [open, setOpen] = useState<OpenPopup | null>(null)
  const [instruction, setInstruction] = useState('')
  const [status, setStatus] = useState<PopupPhase>({ phase: 'input' })
  const [rect, setRect] = useState<{ top: number; left: number } | null>(null)
  const runRef = useRef<AbortController | null>(null)
  const attemptRef = useRef<{
    figureId: string
    instruction: string
    key: string
    jobId: string | null
  } | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const editorRef = useRef(editor)
  useEffect(() => {
    editorRef.current = editor
  }, [editor])

  const close = useCallback(() => {
    runRef.current?.abort()
    runRef.current = null
    attemptRef.current = null
    setOpen(null)
    setInstruction('')
    setStatus({ phase: 'input' })
    setRect(null)
  }, [])

  // A new editor (note switch, reload) drops the popup: its anchor and figure are gone.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- close the popup when its editor is replaced
  useEffect(() => close(), [editor, close])

  useEffect(() => {
    const onChange = (event: Event) => {
      const custom = event as CustomEvent<FigureChangeDetail>
      // The press may land on the SVG glyph inside the button (an SVGElement, not an
      // HTMLElement), so resolve the button itself rather than trusting the raw target.
      const anchor = event.target instanceof Element ? (event.target.closest('.incantally-figure-change__button') as HTMLElement | null) : null
      if (!anchor || typeof custom.detail?.figureId !== 'string' || !custom.detail.figureId) return
      const live = editorRef.current
      if (!live || live.isDestroyed) return
      const nodeId = figureNodeIdByFigure(live, custom.detail.figureId)
      if (!nodeId) return
      runRef.current?.abort()
      runRef.current = null
      attemptRef.current = null
      setOpen({ nodeId, anchor })
      setInstruction('')
      setStatus({ phase: 'input' })
    }
    window.addEventListener(FIGURE_CHANGE_EVENT, onChange)
    return () => window.removeEventListener(FIGURE_CHANGE_EVENT, onChange)
  }, [])

  // The popup sits under the button and tracks it across scroll and resize.
  useEffect(() => {
    if (!open) return
    const place = () => {
      if (!open.anchor.isConnected) {
        close()
        return
      }
      const box = open.anchor.getBoundingClientRect()
      setRect({
        top: Math.min(box.bottom + POPUP_GAP, Math.max(8, window.innerHeight - 240)),
        left: Math.max(8, Math.min(box.right - POPUP_WIDTH, window.innerWidth - POPUP_WIDTH - 8)),
      })
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, close])

  useEffect(() => {
    if (open && rect) inputRef.current?.focus()
  }, [open, rect])

  // Escape closes (aborting a run); a pointer outside closes only at rest, never mid-run.
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    const onPointer = (event: PointerEvent) => {
      if (runRef.current) return
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) close()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointer)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointer)
    }
  }, [open, close])

  const settleJob = useCallback(
    async (
      job: SimulationJob,
      attempt: {
        figureId: string
        instruction: string
        key: string
        jobId: string | null
      },
    ) => {
      if (job.status === 'FAILED' || job.status === 'EXPIRED') {
        const message = simulationFailureMessage(job.failureCode, job.status)
        const retryable = canRetrySimulation(job.failureCode)
        if (job.failureCode === 'NOTE_ACCESS_DENIED') session.markAccessDenied(new ApiError(403, 'NOTE_ACCESS_DENIED', null, null))
        // Any post here starts a NEW job: replaying the old key would return this failed one.
        attempt.jobId = null
        attempt.key = newIdempotencyKey()
        setStatus({ phase: 'failed', message, retryable })
        return
      }
      if (job.status !== 'COMPLETED' || !job.figure) {
        attempt.jobId = null
        attempt.key = newIdempotencyKey()
        setStatus({
          phase: 'failed',
          message: simulationFailureMessage('SIMULATION_FIGURE_MISSING', job.status),
          retryable: true,
        })
        return
      }
      const live = editorRef.current
      if (!live || live.isDestroyed) {
        setStatus({
          phase: 'failed',
          message: 'The note closed before the change landed. Reopen it to see your figure.',
          retryable: false,
        })
        return
      }
      setStatus({ phase: 'working', label: 'Swapping it in…', energy: 1, figureId: attempt.figureId })
      const swapped = await swapFigureSource(live, attempt.figureId, job.jobId, job.figure.sdkVersion)
      if (!swapped) {
        setStatus({
          phase: 'failed',
          message: 'Your figure changed, but it couldn’t be swapped in — the figure may have moved. Retry to swap it.',
          retryable: true,
        })
        return
      }
      close()
    },
    [session, close],
  )

  const follow = useCallback(async (jobId: string, figureId: string, signal: AbortSignal) => {
    let after = -1
    const take = (events: SimulationJobEvent[]) => {
      for (const event of events) {
        after = Math.max(after, event.seq)
        const label = simulationEventLabel(event)
        if (label) setStatus({ phase: 'working', label, energy: simulationEventEnergy(event), figureId })
      }
    }
    const streamed = await streamSimulationEvents(jobId, after, (event) => take([event]), signal)
    if (signal.aborted) return
    if (streamed !== 'done') {
      await poll(
        async () => {
          const page = await simulationsApi.events(jobId, after, signal)
          take(page.events)
          after = page.nextAfter
          return page
        },
        (page) => page.done,
        { signal, maxMs: 4000 },
      )
    }
    if (signal.aborted) return
    return simulationsApi.job(jobId, signal)
  }, [])

  const run = useCallback(async () => {
    const attempt = attemptRef.current
    if (!attempt || runRef.current) return
    const controller = new AbortController()
    runRef.current = controller
    setStatus({ phase: 'working', label: 'Starting…', energy: 0, figureId: attempt.figureId })
    try {
      let jobId = attempt.jobId
      if (!jobId) {
        try {
          jobId = (await simulationsApi.change(attempt.figureId, { instruction: attempt.instruction }, attempt.key)).jobId
        } catch (error) {
          if (controller.signal.aborted) return
          if (isApiError(error, 'IDEMPOTENCY_KEY_REUSED')) {
            attempt.key = newIdempotencyKey()
            jobId = (await simulationsApi.change(attempt.figureId, { instruction: attempt.instruction }, attempt.key)).jobId
          } else {
            throw error
          }
        }
        attempt.jobId = jobId
      }
      if (controller.signal.aborted) return
      const job = await follow(jobId, attempt.figureId, controller.signal)
      if (controller.signal.aborted || !job) return
      await settleJob(job, attempt)
    } catch (error) {
      if (controller.signal.aborted) return
      if (isApiError(error, 'NOTE_ACCESS_DENIED')) {
        attemptRef.current = null
        session.markAccessDenied(error)
        setStatus({
          phase: 'failed',
          message: apiErrorMessage(error),
          retryable: false,
        })
        return
      }
      if (isApiError(error, 'NOTE_NOT_FOUND')) {
        attemptRef.current = null
        setStatus({
          phase: 'failed',
          message: apiErrorMessage(error),
          retryable: false,
        })
        return
      }
      const code = error instanceof ApiError ? error.code : null
      if (code === 'SIMULATION_JOB_NOT_FOUND') {
        attempt.jobId = null
        attempt.key = newIdempotencyKey()
      }
      setStatus({
        phase: 'failed',
        message: apiErrorMessage(error),
        retryable: canRetrySimulation(code),
      })
    } finally {
      if (runRef.current === controller) runRef.current = null
    }
  }, [follow, settleJob, session])

  const submit = useCallback(() => {
    if (!open || runRef.current) return
    const checked = instructionFromInput(instruction)
    if ('error' in checked) {
      setStatus({ phase: 'input', error: checked.error })
      return
    }
    const live = editorRef.current
    const current = live && !live.isDestroyed ? figureIdByNode(live, open.nodeId) : null
    if (!current) {
      setStatus({ phase: 'failed', message: 'That figure is no longer in the note.', retryable: false })
      return
    }
    attemptRef.current = { figureId: current, instruction: checked.instruction, key: newIdempotencyKey(), jobId: null }
    void run()
  }, [open, instruction, run])

  const retry = useCallback(() => {
    if (!open || runRef.current || !attemptRef.current) return
    const checked = instructionFromInput(instruction)
    if ('error' in checked) {
      setStatus({ phase: 'input', error: checked.error })
      return
    }
    const live = editorRef.current
    const current = live && !live.isDestroyed ? figureIdByNode(live, open.nodeId) : null
    if (!current) {
      attemptRef.current = null
      setStatus({ phase: 'failed', message: 'That figure is no longer in the note.', retryable: false })
      return
    }
    // Edited wording — or a figure that moved on since the attempt — is a new request;
    // untouched wording against the same figure resumes the attempt's keyed job.
    if (checked.instruction !== attemptRef.current.instruction || current !== attemptRef.current.figureId) {
      attemptRef.current = { figureId: current, instruction: checked.instruction, key: newIdempotencyKey(), jobId: null }
    }
    void run()
  }, [open, instruction, run])

  if (!open || !rect) return null
  return (
    <>
      <FigureChangeCover editor={editor} figureId={status.phase === 'working' ? status.figureId : ''} visible={status.phase === 'working'} energy={status.phase === 'working' ? status.energy : 0} />
      <div
        ref={panelRef}
        role="dialog"
        aria-label="Change this figure"
        className="fixed z-50 w-80 rounded-xl border border-default bg-raised p-4 shadow-lg"
        style={{ top: rect.top, left: rect.left }}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <AppIcon name="edit" className="size-4 text-muted" />
            Change this figure
          </p>
          <button type="button" onClick={close} aria-label="Close" className={`${iconButton} size-8`}>
            <AppIcon name="close" className="size-4" />
          </button>
        </div>
        {status.phase === 'working' ? (
          <p role="status" className="mt-2 flex items-center gap-2 text-sm text-muted">
            <span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-button" />
            {status.label}
          </p>
        ) : status.phase === 'failed' ? (
          <div className="mt-2">
            <p role="alert" className="text-sm text-foreground">
              {status.message}
            </p>
            <label className="mt-3 block text-sm font-medium text-muted" htmlFor="figure-change-instruction">
              What should change?
            </label>
            <input
              ref={inputRef}
              id="figure-change-instruction"
              type="text"
              value={instruction}
              maxLength={500}
              onChange={(event) => setInstruction(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') retry()
              }}
              placeholder="Show it in 3D"
              aria-label="What should change?"
              className={inputClass}
            />
            <div className="mt-3 flex items-center justify-end gap-2">
              <button type="button" onClick={close} className={buttonQuiet}>
                Cancel
              </button>
              {status.retryable ? (
                <button type="button" onClick={retry} className={buttonPrimary}>
                  Try again
                </button>
              ) : (
                <button type="button" onClick={retry} className={buttonPrimary}>
                  Apply change
                </button>
              )}
            </div>
          </div>
        ) : (
          <form
            className="mt-2"
            onSubmit={(event) => {
              event.preventDefault()
              submit()
            }}
          >
            <label className="block text-sm font-medium text-muted" htmlFor="figure-change-instruction">
              What should change?
            </label>
            <input
              ref={inputRef}
              id="figure-change-instruction"
              type="text"
              value={instruction}
              maxLength={500}
              onChange={(event) => setInstruction(event.target.value)}
              placeholder="Show it in 3D"
              aria-label="What should change?"
              className={inputClass}
            />
            {status.error ? (
              <p role="alert" className="mt-1.5 text-sm text-foreground">
                {status.error}
              </p>
            ) : null}
            <div className="mt-3 flex items-center justify-end gap-2">
              <button type="button" onClick={close} className={buttonQuiet}>
                Cancel
              </button>
              <button type="submit" className={buttonPrimary}>
                Apply change
              </button>
            </div>
          </form>
        )}
      </div>
    </>
  )
}
