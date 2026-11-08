import { ApiError, apiErrorMessage } from '../../../lib/api/errors'
import type { SimulationJobEvent, SimulationJobStatus, SimulationStage } from '../../../lib/api/simulations'

/** The concept mirrors the server: trimmed, whitespace folded, at most 2000 chars (a deployment may allow less). */
export const SIMULATION_CONCEPT_MAX_CHARS = 2000
/** A change instruction mirrors the server: trimmed, folded, at most 500 chars (the SDK's learner-prompt cap). */
export const SIMULATION_INSTRUCTION_MAX_CHARS = 500

export function instructionFromInput(text: string): { instruction: string } | { error: string } {
  const instruction = text.replace(/\s+/g, ' ').trim()
  if (!instruction) return { error: apiErrorMessage(new ApiError(422, 'SIMULATION_INSTRUCTION_INVALID', null, null)) }
  if (instruction.length > SIMULATION_INSTRUCTION_MAX_CHARS) {
    return { error: apiErrorMessage(new ApiError(422, 'SIMULATION_INSTRUCTION_TOO_LONG', null, null)) }
  }
  return { instruction }
}

export function conceptFromSelection(text: string): { concept: string } | { error: string } {
  const concept = text.replace(/\s+/g, ' ').trim()
  if (!concept) return { error: 'Select some text in the note first.' }
  if (concept.length > SIMULATION_CONCEPT_MAX_CHARS) {
    return { error: apiErrorMessage(new ApiError(422, 'SIMULATION_CONCEPT_TOO_LONG', null, null)) }
  }
  return { concept }
}

/** The stable node ID for a job's figure — the same ID the server attach uses, so exactly one node exists. */
export function simulationFigureNodeId(jobId: string): string {
  return `fig-${jobId}`
}

/** Progress copy for one job event. Events carry codes and numbers, never text. */
export function simulationEventLabel(event: Pick<SimulationJobEvent, 'type' | 'data'>): string | null {
  switch (event.type) {
    case 'ACCEPTED': return 'Starting…'
    case 'STEP_STARTED': return null
    case 'STEP_COMPLETED': {
      const data = event.data ?? {}
      if (data.stage === 'planned') return 'Building the scene…'
      if (data.stage === 'fragment') return 'Checking that it works…'
      if (data.stage === 'attempt') return typeof data.failed === 'number' && data.failed > 0 ? 'Fixing a problem…' : 'Checking that it works…'
      return null
    }
    case 'DEFERRED': return 'Waiting, then trying again…'
    case 'COMPLETED': return 'Placing it in your note…'
    default: return null
  }
}

/**
 * Placeholder shader energy for one job event: 0 ambles (planning), 1 breathes
 * (building, checking, waiting), 2 throbs (repairing after failed attempts).
 */
export function simulationEventEnergy(event: Pick<SimulationJobEvent, 'type' | 'data'>): 0 | 1 | 2 {
  if (event.type === 'ACCEPTED') return 0
  if (event.type === 'STEP_COMPLETED') {
    const data = event.data ?? {}
    if (data.stage === 'planned') return 0
    if (data.stage === 'attempt' && typeof data.failed === 'number' && data.failed > 0) return 2
    return 1
  }
  return 1
}

/** Progress copy for a running job's pipeline stage. */
export function simulationStageLabel(stage: SimulationStage | string | null | undefined): string {
  switch (stage) {
    case 'planning': return 'Planning your figure…'
    case 'building': return 'Building the scene…'
    case 'probing': return 'Checking that it works…'
    case 'repairing': return 'Fixing a problem…'
    case 'storing': return 'Saving the figure…'
    case 'attaching': return 'Placing it in your note…'
    default: return 'Working…'
  }
}

const STALE_SELECTION = 'The note changed while the figure was made. Select the passage again and retry.'

/**
 * Copy for a terminal job: its `failureCode`, or the status when there is none. Known codes read
 * from the shared backend-code messages; the note-revision code gets simulation context (the
 * pinned selection revision was pruned), since the generic copy talks about missing versions.
 */
export function simulationFailureMessage(code: string | null | undefined, status: SimulationJobStatus): string {
  if (code === 'NOTE_REVISION_NOT_FOUND') return STALE_SELECTION
  if (code) return apiErrorMessage(new ApiError(200, code, null, null))
  if (status === 'EXPIRED') return apiErrorMessage(new ApiError(404, 'SIMULATION_JOB_NOT_FOUND', null, null))
  return apiErrorMessage(new ApiError(500, 'SIMULATION_MODEL_FAILED', null, null))
}

/**
 * Failures where retrying the SAME request can help — a transient backend state, never an
 * input or access verdict. Retrying a refused concept or a lost note reuses the same doomed
 * request; those ask for different wording, a shorter passage, or restored access instead.
 */
const NO_RETRY = new Set([
  'SIMULATION_CONCEPT_INVALID',
  'SIMULATION_CONCEPT_TOO_LONG',
  'SIMULATION_INSTRUCTION_INVALID',
  'SIMULATION_INSTRUCTION_TOO_LONG',
  'SIMULATION_CONTEXT_TOO_LARGE',
  'SIMULATION_MODEL_REFUSED',
  'SIMULATION_CHANGE_UNCHANGED',
  'SIMULATION_PLAN_REJECTED',
  'AI_DAILY_LIMIT_REACHED',
  'NOTE_NOT_FOUND',
  'NOTE_ACCESS_DENIED',
  'NOTE_REVISION_NOT_FOUND',
])

export function canRetrySimulation(code: string | null | undefined): boolean {
  return !code || !NO_RETRY.has(code)
}

/** Whether an `/events` page means the follow loop is over. */
export function isTerminalJobStatus(status: SimulationJobStatus): boolean {
  return status === 'COMPLETED' || status === 'FAILED' || status === 'EXPIRED'
}
