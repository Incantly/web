'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { noteProposalsKey } from '@/hooks/use-note-suggestions'
import { aiApi, streamJobEvents, type AiCommand, type AiJobEvent, type ApprovalDecision, type ClarificationOption, type NoteSelection } from '../../../lib/api/ai'
import { ApiError, apiErrorMessage, isApiError } from '../../../lib/api/errors'
import { newIdempotencyKey } from '../../../lib/api/idempotency'
import { poll } from '../../../lib/api/poll'
import { activitySteps, eventLabel, failureMessage, isNoteAssist, touchesApprovals, type ActivityStep, type AssistantTurn, type ScopeChoice, type Turn } from './aiModel'

const MAX_KEPT = 60

function storageKey(userId: string, thread: string) {
  return `incantly:assistant:${userId}:${thread}`
}

/** The thread lives in this tab's session storage so a reload resumes running jobs. */
function load(userId: string, thread: string): Turn[] {
  try {
    const raw = sessionStorage.getItem(storageKey(userId, thread))
    const turns = raw ? (JSON.parse(raw) as Turn[]) : []
    // A request that never got a job cannot be resumed.
    return Array.isArray(turns) ? turns.map((turn) => (turn.role === 'assistant' && turn.state === 'sending' ? { ...turn, state: 'failed', error: 'That request was interrupted. Ask again.' } : turn)) : []
  } catch {
    return []
  }
}

function save(userId: string, thread: string, turns: Turn[]) {
  try { sessionStorage.setItem(storageKey(userId, thread), JSON.stringify(turns.slice(-MAX_KEPT))) } catch { /* storage full or blocked: the thread just won't survive a reload */ }
}

function errorCopy(error: unknown) {
  if (isApiError(error, 'AI_JOB_NOT_FOUND')) return 'This answer is no longer available.'
  if (error instanceof ApiError) {
    const known = failureMessage(error.code)
    if (known !== failureMessage(null)) return known
  }
  return apiErrorMessage(error)
}

type Request = AssistantTurn['request']

/**
 * One assistant thread: per note, Space, or the rest of the workspace (the caller remounts per
 * `thread`). Each question becomes a background job: submit, poll its events for
 * progress, then read the result and its cited passages (frontend-api-integration.md, "AI assistant API").
 */
export function useAssistantChat(userId: string, thread: string, { onLimitReached }: { onLimitReached?: () => void } = {}) {
  // The workspace renders only on the client (behind the session gate), so storage is readable here.
  const [turns, setTurns] = useState<Turn[]>(() => load(userId, thread))
  const controllers = useRef(new Map<string, AbortController>())
  const cancelRequested = useRef(new Set<string>())
  const client = useQueryClient()
  const limitRef = useRef(onLimitReached)
  const turnsRef = useRef(turns)
  useEffect(() => { limitRef.current = onLimitReached; turnsRef.current = turns })

  const update = useCallback((id: string, patch: Partial<AssistantTurn>) => {
    setTurns((current) => current.map((turn) => (turn.id === id && turn.role === 'assistant' ? { ...turn, ...patch } : turn)))
  }, [])

  const follow = useCallback(async (turnId: string, jobId: string, after = -1) => {
    controllers.current.get(turnId)?.abort()
    const controller = new AbortController()
    controllers.current.set(turnId, controller)
    const { signal } = controller
    let cursor = after
    // A resumed job keeps the steps it already showed; its later events continue the list.
    const resumed = turnsRef.current.find((turn): turn is AssistantTurn => turn.id === turnId && turn.role === 'assistant')
    let steps: ActivityStep[] = after >= 0 ? (resumed?.steps ?? []) : []
    // What the assistant is waiting on the user to approve, if anything (empty unless WAITING_APPROVAL).
    const readApprovals = async () => {
      const result = await aiApi.approvals(jobId, signal).catch(() => null)
      if (result && !signal.aborted) update(turnId, { approvals: result.approvals, stateVersion: result.stateVersion })
    }
    try {
      // A resumed job may already be waiting: its APPROVAL_REQUESTED event is behind the cursor.
      if (after >= 0) await readApprovals()
      const take = (events: AiJobEvent[], next = cursor) => {
        cursor = Math.max(next, ...events.map((event) => event.seq))
        steps = events.reduce(activitySteps, steps)
        const label = events.map(eventLabel).filter(Boolean).at(-1)
        update(turnId, { after: cursor, steps, ...(label ? { progress: label } : {}) })
        if (events.some(touchesApprovals)) void readApprovals()
      }
      // Live over the stream; if it can't be used or closes early, poll on from the last event seen.
      const streamed = await streamJobEvents(jobId, cursor, (event) => take([event]), signal)
      if (signal.aborted) return
      if (streamed !== 'done') {
        await poll(async () => {
          const page = await aiApi.events(jobId, cursor, signal)
          take(page.events, page.nextAfter)
          return page
        }, (page) => page.done, { signal, maxMs: 4000 })
      }
      const job = await aiApi.job(jobId, signal)
      if (job.status === 'COMPLETED') {
        // Passages are kept 30 days; without them the answer still shows with bare markers.
        const passages = await aiApi.citations(jobId, signal).then((result) => result.passages).catch(() => [])
        update(turnId, { state: 'done', job, passages, progress: undefined, approvals: undefined })
        // The note assistant stored suggested edits: the open note draws them.
        if (isNoteAssist(job) && job.result.proposalIds.length && job.subject?.kind === 'NOTE' && job.subject.id) void client.invalidateQueries({ queryKey: noteProposalsKey(userId, job.subject.id) })
      } else if (job.status === 'CANCELED') {
        update(turnId, { state: 'canceled', job, progress: undefined, approvals: undefined })
      } else {
        update(turnId, { approvals: undefined, state: 'failed', job, failureCode: job.failureCode, error: failureMessage(job.failureCode, job.status), progress: undefined })
        if (job.failureCode === 'AI_DAILY_LIMIT_REACHED') limitRef.current?.()
      }
    } catch (error) {
      if (signal.aborted) return
      update(turnId, { state: 'failed', error: errorCopy(error), progress: undefined })
    } finally {
      if (controllers.current.get(turnId) === controller) controllers.current.delete(turnId)
    }
  }, [update, client, userId])

  const dispatch = useCallback(async (turnId: string, request: Request, clarified = false) => {
    update(turnId, { state: 'sending', progress: 'Sending…', options: undefined, error: undefined, failureCode: undefined, job: undefined, passages: undefined, jobId: undefined, after: undefined, revealed: undefined, approvals: undefined, stateVersion: undefined, approvalError: undefined, steps: undefined, request })
    try {
      // One key per user action; the client reuses it for network retries of this send.
      const response = await aiApi.ask({ surface: 'chat', text: request.text, scope: request.scope.scope, ...(request.command ? { command: request.command } : {}), ...(request.selection ? { selection: request.selection } : {}), ...(clarified ? { clarified: true } : {}) }, newIdempotencyKey())
      if (response.outcome === 'CLARIFICATION_REQUIRED') {
        update(turnId, { state: 'clarify', options: response.options, progress: undefined })
        return
      }
      update(turnId, { state: 'running', jobId: response.job.id, progress: 'Starting…', after: -1 })
      if (cancelRequested.current.delete(turnId)) void aiApi.cancel(response.job.id).catch(() => {})
      void follow(turnId, response.job.id)
    } catch (error) {
      cancelRequested.current.delete(turnId)
      update(turnId, { state: 'failed', error: errorCopy(error), failureCode: error instanceof ApiError ? error.code : null, progress: undefined })
      if (isApiError(error, 'AI_DAILY_LIMIT_REACHED')) limitRef.current?.()
    }
  }, [follow, update])

  // Pick up jobs from the restored thread that are still running server-side.
  useEffect(() => {
    for (const turn of turnsRef.current) if (turn.role === 'assistant' && turn.state === 'running' && turn.jobId) void follow(turn.id, turn.jobId, turn.after ?? -1)
    const live = controllers.current
    return () => { for (const controller of live.values()) controller.abort(); live.clear() }
  }, [follow])

  useEffect(() => { save(userId, thread, turns) }, [userId, thread, turns])

  /** `selection` (with its display `quote`) attaches text picked in the note; it needs the NOTE scope. */
  const send = useCallback((text: string, scope: ScopeChoice, command?: AiCommand, selection?: NoteSelection & { quote: string }) => {
    const userTurn: Turn = { id: crypto.randomUUID(), role: 'user', text, ...(command ? { command } : {}), ...(selection ? { quote: selection.quote } : {}) }
    const request: Request = { text, scope, ...(command ? { command } : {}), ...(selection ? { selection: { revisionNumber: selection.revisionNumber, ranges: selection.ranges } } : {}) }
    const reply: AssistantTurn = { id: crypto.randomUUID(), role: 'assistant', state: 'sending', progress: 'Sending…', request }
    setTurns((current) => [...current, userTurn, reply])
    void dispatch(reply.id, request)
  }, [dispatch])

  const clarify = useCallback((turn: AssistantTurn, option: ClarificationOption) => {
    void dispatch(turn.id, { ...turn.request, command: option.command }, true)
  }, [dispatch])

  const retry = useCallback((turn: AssistantTurn) => { void dispatch(turn.id, turn.request) }, [dispatch])

  const stop = useCallback((turn: AssistantTurn) => {
    if (turn.jobId) void aiApi.cancel(turn.jobId).then(() => update(turn.id, { progress: 'Stopping…' })).catch(() => {})
    else cancelRequested.current.add(turn.id)
  }, [update])

  /** Approve or reject one action the assistant proposed; the job resumes on the server. */
  const decideApproval = useCallback(async (turn: AssistantTurn, toolCallId: string, decision: ApprovalDecision) => {
    if (!turn.jobId || turn.stateVersion === undefined) return
    update(turn.id, { deciding: toolCallId, approvalError: undefined })
    try {
      await aiApi.decideApproval(turn.jobId, toolCallId, decision, turn.stateVersion)
      update(turn.id, { deciding: undefined, approvals: turn.approvals?.filter((item) => item.toolCallId !== toolCallId), progress: decision === 'approve' ? 'Continuing…' : 'Continuing without that…' })
    } catch (error) {
      // The job moved on (another tab decided, or it expired): show what it waits for now.
      const fresh = isApiError(error, 'AI_JOB_STATE_CHANGED') ? await aiApi.approvals(turn.jobId).catch(() => null) : null
      update(turn.id, { deciding: undefined, approvalError: errorCopy(error), ...(fresh ? { approvals: fresh.approvals, stateVersion: fresh.stateVersion } : {}) })
    }
  }, [update])

  const markRevealed = useCallback((id: string) => update(id, { revealed: true }), [update])

  const active = turns.findLast((turn): turn is AssistantTurn => turn.role === 'assistant' && (turn.state === 'sending' || turn.state === 'running'))
  return { turns, active, send, clarify, retry, stop, markRevealed, decideApproval }
}
