import { apiFetch } from './client'

/**
 * Simulation DTOs, mirroring the backend's `simulations.dto.ts` field for field. They are
 * hand-written because the committed schema copy predates the simulations API (§1.2, like
 * AiWebScope): regenerate (`npm run api:fetch && npm run api:types`) and switch these to
 * `Schema<…>` once the backend OpenAPI document carries them.
 */
export type SimulationJobStatus = 'ACCEPTED' | 'RUNNING' | 'WAITING' | 'COMPLETED' | 'FAILED' | 'EXPIRED'
export type SimulationStage = 'planning' | 'building' | 'probing' | 'repairing' | 'storing' | 'attaching'
export type SimulationJobEventType = 'ACCEPTED' | 'STEP_STARTED' | 'STEP_COMPLETED' | 'DEFERRED' | 'COMPLETED' | 'FAILED' | 'EXPIRED'

/** One selected stretch of a note block: its canonical ID and UTF-16 offsets, never the text itself. */
export type SimulationSelectionRange = { nodeId: string; from: number; to: number }
/** The note revision the editor showed, plus the selected ranges (at most 20). */
export type SimulationSelection = { revisionNumber: number; ranges: SimulationSelectionRange[] }
export type CreateSimulationBody = { concept: string; noteId?: string; selection?: SimulationSelection }
export type CreateSimulationResult = { jobId: string; status: SimulationJobStatus; created: boolean }
/** The change to make to an approved figure, in the learner's own words. */
export type CreateFigureChangeBody = { instruction: string }

export type SimulationFigureSummary = {
  figureId: string
  sdkVersion: string
  fallback: boolean
  fallbackReason?: string | null
  nodeId?: string | null
}

export type SimulationJob = {
  jobId: string
  status: SimulationJobStatus
  stage?: SimulationStage | string | null
  concept: string
  noteId?: string | null
  attempts: number
  /** Stable code once FAILED: a SIMULATION_* code, an AI allowance code, or a note code. */
  failureCode?: string | null
  /** Present once the figure is stored, even when the job later FAILED to attach. */
  figure?: SimulationFigureSummary | null
  createdAt: string
  completedAt?: string | null
}

/** Progress events carry codes and numbers only, never text. */
export type SimulationJobEvent = {
  seq: number
  type: SimulationJobEventType
  data?: Record<string, unknown> | null
  createdAt: string
}

export type SimulationJobEvents = {
  events: SimulationJobEvent[]
  /** Pass as `after` to continue; unchanged when empty. */
  nextAfter: number
  /** True once the job is terminal and every event was returned. Then read the job. */
  done: boolean
  status: SimulationJobStatus
}

export type SimulationFigure = {
  figureId: string
  jobId: string
  noteId?: string | null
  nodeId?: string | null
  concept: string
  sdkVersion: string
  fallback: boolean
  fallbackReason?: string | null
  fragmentsBytes: number
  snapshotBytes: number
  plan: Record<string, unknown>
  createdAt: string
}

export type SimulationFragments = {
  version: 1
  figureId: string
  sdkVersion: string
  concept: string
  plan: Record<string, unknown>
  fragments: { html: string; css: string; js: string }
  fallback: boolean
}

const id = (value: string) => encodeURIComponent(value)

/** `/v1/simulations/*` + `/v1/figures/*`: interactive-figure generation jobs and their approved figures. */
export const simulationsApi = {
  /**
   * Starts a generation job (202). One `idempotencyKey` per user action; network retries
   * reuse it. A 429 is surfaced so the UI can say the service is busy. Never retry with a
   * changed body (409 IDEMPOTENCY_KEY_REUSED); a retry after FAILED starts a new job with
   * a new key (replaying the old key would return the failed job, not a new attempt).
   */
  async create(body: CreateSimulationBody, idempotencyKey: string) {
    return (await apiFetch<CreateSimulationResult>('/v1/simulations', { method: 'POST', body, idempotencyKey, maxAttempts: 2 })).data
  },
  async job(jobId: string, signal?: AbortSignal) {
    return (await apiFetch<SimulationJob>(`/v1/simulations/${id(jobId)}`, { signal })).data
  },
  async events(jobId: string, after: number, signal?: AbortSignal) {
    return (await apiFetch<SimulationJobEvents>(`/v1/simulations/${id(jobId)}/events?after=${after}`, { signal })).data
  },
  async figure(figureId: string, signal?: AbortSignal) {
    return (await apiFetch<SimulationFigure>(`/v1/figures/${id(figureId)}`, { signal })).data
  },
  /**
   * The immutable fragments document. Mount it with the scene SDK at exactly `sdkVersion`;
   * never execute the fragments outside the SDK sandbox or persist them outside the SDK's
   * bounded runtime cache.
   */
  async fragments(figureId: string, signal?: AbortSignal) {
    return (await apiFetch<SimulationFragments>(`/v1/figures/${id(figureId)}/fragments`, { signal })).data
  },
  /**
   * Starts a change job on an approved figure (202): one model call replies with edits over its
   * fragments, never a rewrite. Follow it exactly like a generation; the new figure's ID is the
   * returned job ID. The server never attaches — the caller swaps the figure into the note. The
   * same idempotency rules as `create` apply; a FAILED change never touches the note.
   */
  async change(figureId: string, body: CreateFigureChangeBody, idempotencyKey: string) {
    return (await apiFetch<CreateSimulationResult>(`/v1/figures/${id(figureId)}/changes`, { method: 'POST', body, idempotencyKey, maxAttempts: 2 })).data
  },
}

/** Every event type the stream names (SSE delivers each as its own named event). */
const STREAM_EVENT_TYPES = [
  'ACCEPTED', 'STEP_STARTED', 'STEP_COMPLETED', 'DEFERRED', 'COMPLETED', 'FAILED', 'EXPIRED',
] as const satisfies readonly SimulationJobEvent['type'][]

/**
 * Follows a job's events live over `GET /v1/simulations/{id}/stream` (SSE), from after `after`.
 * Resolves `'done'` once the job is terminal, or `'fallback'` when the stream can't be used or
 * closes early (an error, a `timeout` close, too many open streams): the caller then polls
 * `/events` from the last `seq` it saw, so nothing is lost or repeated.
 */
export function streamSimulationEvents(jobId: string, after: number, onEvent: (event: SimulationJobEvent) => void, signal: AbortSignal): Promise<'done' | 'fallback'> {
  return new Promise((resolve) => {
    if (typeof EventSource === 'undefined' || signal.aborted) return resolve('fallback')
    const source = new EventSource(`/v1/simulations/${id(jobId)}/stream?after=${after}`, { withCredentials: true })
    const finish = (result: 'done' | 'fallback') => { source.close(); signal.removeEventListener('abort', abort); resolve(result) }
    const abort = () => finish('fallback')
    signal.addEventListener('abort', abort, { once: true })
    const onMessage = (message: MessageEvent<string>) => {
      try { onEvent(JSON.parse(message.data) as SimulationJobEvent) } catch { /* a malformed message is skipped; polling would not see it either */ }
    }
    for (const type of STREAM_EVENT_TYPES) source.addEventListener(type, onMessage)
    source.addEventListener('done', () => finish('done'))
    source.addEventListener('timeout', () => finish('fallback'))
    // EventSource would retry on its own; one path at a time, so hand over to polling instead.
    source.onerror = () => finish('fallback')
  })
}
