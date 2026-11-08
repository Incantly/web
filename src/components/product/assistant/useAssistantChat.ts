'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useImports } from '@/hooks/use-imports'
import { noteProposalsKey } from '@/hooks/use-note-suggestions'
import { aiApi, streamJobEvents, type AiCommand, type AiJobEvent, type ApprovalDecision, type ClarificationOption, type NoteSelection, type RunClarifyOption } from '../../../lib/api/ai'
import { ApiError, apiErrorMessage, isApiError } from '../../../lib/api/errors'
import { newIdempotencyKey } from '../../../lib/api/idempotency'
import { poll } from '../../../lib/api/poll'
import { simulationsApi, streamSimulationEvents, type SimulationJobEvent } from '../../../lib/api/simulations'
import { dispatchChatSimulation } from '../../../lib/document-editor/simulationPlaceholder'
import { activitySteps, clarifyKey, eventLabel, failureMessage, isNoteAssist, isWebSearchFinished, simGenerationDone, simStageStep, simWaitingTarget, touchesApprovals, touchesClarification, type ActivityStep, type AssistantTurn, type ScopeChoice, type Turn } from './aiModel'
import { simulationEventEnergy, simulationEventLabel } from '../workspace/simulationModel'

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
  const { reloadNote } = useImports()
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
    // The choice the run waits on, if any. A resumed or answered job is not waiting: its 409
    // clears a stale card rather than leaving it up.
    const readClarification = async () => {
      const result = await aiApi.clarification(jobId, signal).catch((error: unknown) => {
        if (isApiError(error, 'AI_JOB_NOT_WAITING') && !signal.aborted) update(turnId, { clarification: undefined, clarifying: undefined })
        return null
      })
      if (result && !signal.aborted) update(turnId, { clarification: result, clarifyError: undefined })
    }
    // Web results land while the job runs: a 404 (AI_RESULT_NOT_READY) keeps the previous list.
    const readWebSources = async () => {
      const result = await aiApi.citations(jobId, signal).catch(() => null)
      if (!result || signal.aborted) return
      const previous = turnsRef.current.find((turn): turn is AssistantTurn => turn.id === turnId && turn.role === 'assistant')?.webSources?.length ?? 0
      // Refetches can overtake each other; the list only grows, so never shrink it.
      if (result.web.length >= previous) update(turnId, { webSources: result.web })
    }
    // The note this turn asked about: the request's own scope. (The job's `subject`
    // backfills later and is usually still empty here, so it cannot gate this.)
    const requestNoteId = () => {
      const turn = turnsRef.current.find((candidate): candidate is AssistantTurn => candidate.id === turnId && candidate.role === 'assistant')
      const scope = turn?.request.scope.scope
      return scope?.kind === 'NOTE' ? scope.noteId : undefined
    }
    // One simulation follow per turn: a parked figure call's stages retitle its running step
    // with the same copy the in-note placeholder shows, and draw that placeholder in the
    // open note while the figure generates. The AI follow still settles the turn.
    let simFollowed: string | null = null
    const followSim = async (simJobId: string) => {
      try {
        let after = -1
        let shownPlaceholder = false
        const takeSim = (events: SimulationJobEvent[]) => {
          const turn = turnsRef.current.find((candidate): candidate is AssistantTurn => candidate.id === turnId && candidate.role === 'assistant')
          if (!turn || (turn.state !== 'sending' && turn.state !== 'running')) return
          const noteId = requestNoteId()
          for (const event of events) {
            after = Math.max(after, event.seq)
            // A failed generation leaves no figure: its placeholder goes at once (the chat
            // reports why). A finished one stays until the turn settles and reloads the note.
            if ((event.type === 'FAILED' || event.type === 'EXPIRED') && noteId) {
              dispatchChatSimulation({ noteId, jobId: simJobId, phase: 'hide' })
              shownPlaceholder = false
              continue
            }
            const label = simulationEventLabel(event)
            if (!label || signal.aborted) continue
            update(turnId, { progress: label, ...(turn.steps ? { steps: simStageStep(turn.steps, label) } : {}) })
            if (noteId) {
              dispatchChatSimulation({ noteId, jobId: simJobId, phase: shownPlaceholder ? 'update' : 'show', label, energy: simulationEventEnergy(event) })
              shownPlaceholder = true
            }
          }
        }
        // Live over the stream; if it can't be used or closes early, poll on from the last event seen.
        const streamed = await streamSimulationEvents(simJobId, after, (event) => takeSim([event]), signal)
        if (signal.aborted) return
        if (streamed !== 'done') {
          await poll(async () => {
            const page = await simulationsApi.events(simJobId, after, signal)
            takeSim(page.events)
            after = page.nextAfter
            return page
          }, (page) => page.done, { signal, maxMs: 4000 })
        }
      } catch { /* aborted or unreachable: the AI follow still settles the turn */ }
    }
    try {
      // A resumed job may already be waiting: its APPROVAL_REQUESTED event is behind the cursor.
      if (after >= 0) {
        await readApprovals()
        await readClarification()
        // Its TOOL_WAITING is behind the cursor too: refollow the parked simulation, if any.
        if (resumed?.simJobId) {
          simFollowed = resumed.simJobId
          void followSim(resumed.simJobId)
        }
      }
      const take = (events: AiJobEvent[], next = cursor) => {
        cursor = Math.max(next, ...events.map((event) => event.seq))
        steps = events.reduce(activitySteps, steps)
        const label = events.map(eventLabel).filter(Boolean).at(-1)
        // An answered or expired choice leaves no card: the run continues or ends from here.
        const settled = events.some((event) => event.type === 'CLARIFIED' || event.type === 'CLARIFICATION_EXPIRED')
        update(turnId, { after: cursor, steps, ...(label ? { progress: label } : {}), ...(settled ? { clarification: undefined, clarifying: undefined } : {}) })
        if (events.some(touchesApprovals)) void readApprovals()
        if (events.some(touchesClarification)) void readClarification()
        if (events.some(isWebSearchFinished)) void readWebSources()
        for (const event of events) {
          const target = simWaitingTarget(event)
          if (target && simFollowed !== target.simJobId) {
            simFollowed = target.simJobId
            update(turnId, { simJobId: target.simJobId })
            void followSim(target.simJobId)
          }
        }
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
        const citations = await aiApi.citations(jobId, signal).catch(() => null)
        update(turnId, { state: 'done', job, passages: citations?.passages ?? [], ...(citations ? { webSources: citations.web } : {}), progress: undefined, approvals: undefined, clarification: undefined, clarifying: undefined })
        const scopeNoteId = requestNoteId()
        // The note assistant stored suggested edits: the open note draws them.
        if (isNoteAssist(job) && job.result.proposalIds.length && scopeNoteId) void client.invalidateQueries({ queryKey: noteProposalsKey(userId, scopeNoteId) })
        // A finished generation attached its figure as a new revision: the open note reloads to
        // show it (like a finished import), unless local edits are still on their way.
        if (isNoteAssist(job) && scopeNoteId && simGenerationDone(steps)) reloadNote(scopeNoteId)
      } else if (job.status === 'CANCELED') {
        update(turnId, { state: 'canceled', job, progress: undefined, approvals: undefined, clarification: undefined, clarifying: undefined })
      } else {
        update(turnId, { approvals: undefined, clarification: undefined, clarifying: undefined, state: 'failed', job, failureCode: job.failureCode, error: failureMessage(job.failureCode, job.status), progress: undefined })
        if (job.failureCode === 'AI_DAILY_LIMIT_REACHED') limitRef.current?.()
      }
    } catch (error) {
      if (signal.aborted) return
      update(turnId, { state: 'failed', error: errorCopy(error), progress: undefined, clarification: undefined, clarifying: undefined })
    } finally {
      if (controllers.current.get(turnId) === controller) controllers.current.delete(turnId)
      // Whatever settled the turn, its in-note placeholder goes with it (a finished
      // figure arrives through the reload above; anything else leaves nothing behind).
      if (simFollowed) {
        const noteId = requestNoteId()
        if (noteId) dispatchChatSimulation({ noteId, jobId: simFollowed, phase: 'hide' })
      }
    }
  }, [update, client, userId, reloadNote])

  const dispatch = useCallback(async (turnId: string, request: Request, clarified = false) => {
    update(turnId, { state: 'sending', progress: 'Sending…', options: undefined, error: undefined, failureCode: undefined, job: undefined, passages: undefined, webSources: undefined, jobId: undefined, after: undefined, revealed: undefined, approvals: undefined, stateVersion: undefined, approvalError: undefined, steps: undefined, clarification: undefined, clarifying: undefined, clarifyPick: undefined, clarifyError: undefined, simJobId: undefined, request })
    try {
      // One key per user action; the client reuses it for network retries of this send.
      const response = await aiApi.ask({ surface: 'chat', text: request.text, scope: request.scope.scope, ...(request.command ? { command: request.command } : {}), ...(request.selection ? { selection: request.selection } : {}), ...(request.webSearch === undefined ? {} : request.webSearch ? { webSearch: true, webScope: request.webScope ?? 'web' } : { webSearch: false }), ...(clarified ? { clarified: true } : {}) }, newIdempotencyKey())
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

  /**
   * `selection` (with its display `quote`) attaches text picked in the note; it needs the NOTE scope.
   * `web` carries the "+"-menu web modes and the @-menu's one-submission pick: `webSearch` with
   * its `webScope`, explicit `false` for "web off", or nothing for automatic (the server detects
   * web need from the question). The request keeps it for retries.
   */
  const send = useCallback((text: string, scope: ScopeChoice, command?: AiCommand, selection?: NoteSelection & { quote: string }, web?: { webSearch: boolean; webScope?: Request['webScope'] }) => {
    const userTurn: Turn = { id: crypto.randomUUID(), role: 'user', text, ...(command ? { command } : {}), ...(selection ? { quote: selection.quote } : {}) }
    const request: Request = { text, scope, ...(command ? { command } : {}), ...(selection ? { selection: { revisionNumber: selection.revisionNumber, ranges: selection.ranges } } : {}), ...(web ? (web.webSearch ? { webSearch: true as const, webScope: web.webScope ?? 'web' } : { webSearch: false as const }) : {}) }
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

  /**
   * Answers the run's waiting choice; the same run resumes server-side and the follow loop keeps
   * watching it. One pick disables the card; a failed send keeps the card (and the pick) for retry.
   */
  const answerClarification = useCallback(async (turn: AssistantTurn, option: Pick<RunClarifyOption, 'option' | 'figureId'>) => {
    if (!turn.jobId || turn.clarification === undefined || turn.clarifying) return
    const pick = { option: option.option, ...(option.figureId ? { figureId: option.figureId } : {}) }
    update(turn.id, { clarifying: clarifyKey(pick), clarifyPick: pick, clarifyError: undefined })
    try {
      await aiApi.answerClarification(turn.jobId, { ...pick, stateVersion: turn.clarification.stateVersion }, newIdempotencyKey())
      update(turn.id, { clarifying: undefined, clarification: undefined, clarifyPick: undefined, progress: 'Continuing…' })
    } catch (error) {
      // The choice moved on (another tab answered, or it changed): show what it offers now.
      const fresh = isApiError(error, 'AI_JOB_STATE_CHANGED') ? await aiApi.clarification(turn.jobId).catch(() => null) : null
      update(turn.id, { clarifying: undefined, clarifyError: errorCopy(error), ...(fresh ? { clarification: fresh } : {}) })
    }
  }, [update])

  const markRevealed = useCallback((id: string) => update(id, { revealed: true }), [update])

  const active = turns.findLast((turn): turn is AssistantTurn => turn.role === 'assistant' && (turn.state === 'sending' || turn.state === 'running'))
  return { turns, active, send, clarify, retry, stop, markRevealed, decideApproval, answerClarification }
}
