import { describe, expect, it } from 'vitest'
import {
  canRetrySimulation,
  conceptFromSelection,
  isTerminalJobStatus,
  simulationEventLabel,
  simulationFailureMessage,
  simulationFigureNodeId,
  simulationStageLabel,
} from './simulationModel'

describe('conceptFromSelection', () => {
  it('folds whitespace like the server and rejects an empty result', () => {
    expect(conceptFromSelection('  Projectile\n  motion\twith\ndrag  ')).toEqual({ concept: 'Projectile motion with drag' })
    expect(conceptFromSelection('   \n  ')).toEqual({ error: 'Select some text in the note first.' })
  })

  it('rejects concepts past the DTO limit before any request', () => {
    const result = conceptFromSelection('x'.repeat(2001))
    expect('error' in result && result.error).toBe('That selection is too long for one figure. Select a shorter passage.')
    expect(conceptFromSelection('x'.repeat(2000))).toEqual({ concept: 'x'.repeat(2000) })
  })
})

describe('simulationFigureNodeId', () => {
  it('derives the stable node ID from the job ID', () => {
    expect(simulationFigureNodeId('job_1')).toBe('fig-job_1')
  })
})

describe('simulationEventLabel', () => {
  it('narrates the pipeline from event codes, never text', () => {
    expect(simulationEventLabel({ type: 'ACCEPTED', data: null })).toBe('Starting…')
    expect(simulationEventLabel({ type: 'STEP_STARTED', data: { attempt: 1 } })).toBeNull()
    expect(simulationEventLabel({ type: 'STEP_COMPLETED', data: { stage: 'planned' } })).toBe('Building the scene…')
    expect(simulationEventLabel({ type: 'STEP_COMPLETED', data: { stage: 'fragment' } })).toBe('Checking that it works…')
    expect(simulationEventLabel({ type: 'STEP_COMPLETED', data: { stage: 'attempt', failed: 0 } })).toBe('Checking that it works…')
    expect(simulationEventLabel({ type: 'STEP_COMPLETED', data: { stage: 'attempt', failed: 2 } })).toBe('Fixing a problem…')
    expect(simulationEventLabel({ type: 'DEFERRED', data: { code: 'x' } })).toBe('Waiting, then trying again…')
    expect(simulationEventLabel({ type: 'COMPLETED', data: { fallback: false } })).toBe('Placing it in your note…')
    expect(simulationEventLabel({ type: 'FAILED', data: { code: 'x' } })).toBeNull()
  })

  it('labels every pipeline stage', () => {
    expect([
      simulationStageLabel('planning'),
      simulationStageLabel('building'),
      simulationStageLabel('probing'),
      simulationStageLabel('repairing'),
      simulationStageLabel('storing'),
      simulationStageLabel('attaching'),
      simulationStageLabel(null),
    ]).toEqual([
      'Planning your figure…',
      'Building the scene…',
      'Checking that it works…',
      'Fixing a problem…',
      'Saving the figure…',
      'Placing it in your note…',
      'Working…',
    ])
  })
})

describe('simulationFailureMessage', () => {
  it('reads known failure codes and contextualizes the revision code', () => {
    expect(simulationFailureMessage('SIMULATION_SCENE_FAILED', 'FAILED')).toBe('The figure didn’t pass its checks. Try again, or pick another passage.')
    expect(simulationFailureMessage('AI_DAILY_LIMIT_REACHED', 'FAILED')).toBe('Today’s AI allowance is used up. Try again after it resets.')
    expect(simulationFailureMessage('NOTE_REVISION_NOT_FOUND', 'FAILED')).toBe('The note changed while the figure was made. Select the passage again and retry.')
  })

  it('covers a missing code by status', () => {
    expect(simulationFailureMessage(null, 'EXPIRED')).toBe('That generation is gone. Start a new one.')
    expect(simulationFailureMessage(undefined, 'FAILED')).toBe('Figure generation failed. Try again shortly.')
  })
})

describe('canRetrySimulation', () => {
  it('allows retry only where the same request could succeed', () => {
    for (const code of ['SIMULATION_PROVIDER_UNAVAILABLE', 'SIMULATION_DEADLINE_EXCEEDED', 'SIMULATION_SCENE_FAILED', 'SIMULATION_MODEL_FAILED', 'RATE_LIMITED', null]) {
      expect(canRetrySimulation(code)).toBe(true)
    }
    for (const code of [
      'SIMULATION_CONCEPT_INVALID', 'SIMULATION_CONCEPT_TOO_LONG', 'SIMULATION_CONTEXT_TOO_LARGE',
      'SIMULATION_MODEL_REFUSED', 'SIMULATION_PLAN_REJECTED', 'AI_DAILY_LIMIT_REACHED',
      'NOTE_NOT_FOUND', 'NOTE_ACCESS_DENIED', 'NOTE_REVISION_NOT_FOUND',
    ]) {
      expect(canRetrySimulation(code)).toBe(false)
    }
  })
})

describe('isTerminalJobStatus', () => {
  it('treats completed, failed, and expired as terminal', () => {
    expect(['COMPLETED', 'FAILED', 'EXPIRED'].map((status) => isTerminalJobStatus(status as 'COMPLETED'))).toEqual([true, true, true])
    expect(['ACCEPTED', 'RUNNING', 'WAITING'].map((status) => isTerminalJobStatus(status as 'RUNNING'))).toEqual([false, false, false])
  })
})
