import { describe, expect, it } from 'vitest'
import { ApiError, apiErrorMessage } from '../../../lib/api/errors'
import type { Artifact, ArtifactGeneration, ArtifactList, ArtifactVersion } from '../../../lib/api/artifacts'
import {
  artifactListCursor,
  artifactOpenView,
  artifactStatusCopy,
  artifactTypeCopy,
  buildArtifactScope,
  buildQuizPreferences,
  DEFAULT_QUIZ_PREFERENCES,
  generationFailureCode,
  generationOutcome,
  generationProgressCopy,
  generationProgressLine,
  generationStateCopy,
  generationVersionId,
  isCurrentVersion,
  previewItemCount,
  selectVersionId,
  versionContentTitle,
  versionLabel,
} from './artifactModel'

function generation(overrides: Partial<ArtifactGeneration> = {}): ArtifactGeneration {
  return {
    id: 'job_1',
    artifactId: 'art_1',
    type: 'QUIZ',
    mode: 'CREATE',
    state: 'GENERATING',
    reused: false,
    progress: { batches: 3, completedBatches: 1, failedBatches: 0, questionsReady: 5 },
    preview: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as ArtifactGeneration
}

describe('generationOutcome', () => {
  it('reads COMPLETED as ready and the stopped states as failed', () => {
    expect(generationOutcome('COMPLETED')).toBe('ready')
    for (const state of ['FAILED', 'CANCELED', 'EXPIRED', 'AWAITING_CLARIFICATION'] as const) {
      expect(generationOutcome(state)).toBe('failed')
    }
  })

  it('reads every working state — and any unknown state — as pending', () => {
    for (const state of ['REQUESTED', 'AUTHORIZED', 'SCOPE_RESOLVED', 'BUDGET_RESERVED', 'CONTEXT_PLANNED', 'EVIDENCE_RETRIEVED', 'ROUTED', 'GENERATING', 'VALIDATING', 'PERSISTING'] as const) {
      expect(generationOutcome(state)).toBe('pending')
    }
    expect(generationOutcome('SOMETHING_NEW' as ArtifactGeneration['state'])).toBe('pending')
  })
})

describe('generation progress copy', () => {
  it('names the batch position while writing', () => {
    expect(generationStateCopy('GENERATING', { batches: 3, completedBatches: 1, failedBatches: 0, questionsReady: 5 })).toBe('Writing questions (1 of 3 batches)…')
    expect(generationStateCopy('GENERATING')).toBe('Writing questions…')
  })

  it('maps every state family to plain words', () => {
    expect(generationStateCopy('REQUESTED')).toBe('Checking what it covers…')
    expect(generationStateCopy('EVIDENCE_RETRIEVED')).toBe('Finding material…')
    expect(generationStateCopy('PERSISTING')).toBe('Saving…')
    expect(generationStateCopy('COMPLETED')).toBe('Ready')
    expect(generationStateCopy('FAILED')).toBe('Failed')
    expect(generationStateCopy('CANCELED')).toBe('Canceled')
    expect(generationStateCopy('EXPIRED')).toBe('Expired')
    expect(generationStateCopy('SOMETHING_NEW' as ArtifactGeneration['state'])).toBe('Working…')
  })

  it('counts validated questions, preferring the preview batches when ahead', () => {
    expect(generationProgressCopy(generation())).toBe('5 questions ready…')
    expect(generationProgressCopy(generation({
      progress: { batches: 3, completedBatches: 1, failedBatches: 0, questionsReady: 1 },
      preview: [{ batch: 'b1', questions: [{ slot: 's1' }, { slot: 's2' }] }] as ArtifactGeneration['preview'],
    }))).toBe('2 questions ready…')
    expect(generationProgressCopy(generation({ progress: { batches: 0, completedBatches: 0, failedBatches: 0, questionsReady: 0 } }))).toBe('Reading your material…')
  })

  it('counts cards for deck generations', () => {
    expect(generationProgressCopy(generation({
      type: 'FLASHCARD_DECK',
      progress: { batches: 1, completedBatches: 1, failedBatches: 0, questionsReady: 0, cardsReady: 1 },
    }))).toBe('1 card ready…')
  })

  it('combines the state and the ready count on one live line', () => {
    expect(generationProgressLine(generation())).toBe('Writing questions (1 of 3 batches) · 5 questions ready…')
    expect(generationProgressLine(generation({
      state: 'EVIDENCE_RETRIEVED',
      progress: { batches: 0, completedBatches: 0, failedBatches: 0, questionsReady: 0 },
    }))).toBe('Finding material…')
  })

  it('reads the failure code and published version id from the wire shapes', () => {
    expect(generationFailureCode(generation({ state: 'FAILED', failureCode: 'ARTIFACT_TOO_FEW_VALID_ITEMS' as unknown as Record<string, never> }))).toBe('ARTIFACT_TOO_FEW_VALID_ITEMS')
    expect(generationFailureCode(generation({ state: 'GENERATING' }))).toBeNull()
    expect(generationVersionId(generation({ state: 'COMPLETED', versionId: 'v_2' as unknown as Record<string, never> }))).toBe('v_2')
    expect(generationVersionId(generation())).toBeNull()
  })

  it('totals preview items across batches', () => {
    expect(previewItemCount([])).toBe(0)
    expect(previewItemCount([
      { batch: 'b1', questions: [{ slot: 's1' }], cards: [{ slot: 'c1' }, { slot: 'c2' }] },
      { batch: 'b2', questions: [] },
    ] as ArtifactGeneration['preview'])).toBe(3)
  })
})

describe('artifact status and type copy', () => {
  it('maps every artifact status to plain words', () => {
    expect(artifactStatusCopy('GENERATING')).toBe('Generating')
    expect(artifactStatusCopy('READY')).toBe('Ready')
    expect(artifactStatusCopy('FAILED')).toBe('Failed')
    expect(artifactStatusCopy('ARCHIVED')).toBe('Archived')
  })

  it('maps every artifact type to plain words', () => {
    expect(artifactTypeCopy('QUIZ')).toBe('Quiz')
    expect(artifactTypeCopy('FLASHCARD_DECK')).toBe('Flashcard deck')
  })

  it('opens quizzes in the quiz view and decks in the deck view', () => {
    expect(artifactOpenView({ id: 'art_1', type: 'QUIZ' })).toBe('quiz:art_1')
    expect(artifactOpenView({ id: 'deck_1', type: 'FLASHCARD_DECK' })).toBe('deck:deck_1')
  })

  it('reads the list cursor as an opaque string', () => {
    expect(artifactListCursor({ items: [], nextCursor: 'cur_1' } as unknown as ArtifactList)).toBe('cur_1')
    expect(artifactListCursor({ items: [] } as ArtifactList)).toBeNull()
  })
})

describe('version selection', () => {
  const versions = [
    { id: 'v_2', versionNumber: 2 },
    { id: 'v_1', versionNumber: 1 },
  ] as ArtifactVersion[]

  it('keeps the explicit pick while listed, else shows the newest', () => {
    expect(selectVersionId(versions, 'v_1')).toBe('v_1')
    expect(selectVersionId(versions, null)).toBe('v_2')
    expect(selectVersionId(versions, 'v_gone')).toBe('v_2')
    expect(selectVersionId([], null)).toBeNull()
  })

  it('marks the artifact’s current version', () => {
    expect(isCurrentVersion({ currentVersion: { id: 'v_2' } } as Artifact, 'v_2')).toBe(true)
    expect(isCurrentVersion({ currentVersion: { id: 'v_2' } } as Artifact, 'v_1')).toBe(false)
    expect(isCurrentVersion({ currentVersion: null } as Artifact, 'v_2')).toBe(false)
  })

  it('labels versions with their number and currency', () => {
    expect(versionLabel({ versionNumber: 3 }, true)).toBe('Version 3 · current')
    expect(versionLabel({ versionNumber: 2 }, false)).toBe('Version 2')
  })

  it('titles version content from its quiz or deck, else its number', () => {
    expect(versionContentTitle({ versionNumber: 1, quiz: { title: 'B-trees quiz' } } as Parameters<typeof versionContentTitle>[0])).toBe('B-trees quiz')
    expect(versionContentTitle({ versionNumber: 2, deck: { title: 'TCP deck' } } as Parameters<typeof versionContentTitle>[0])).toBe('TCP deck')
    expect(versionContentTitle({ versionNumber: 4 } as Parameters<typeof versionContentTitle>[0])).toBe('Version 4')
  })
})

describe('quiz scope and preferences', () => {
  it('builds every scope kind, or null while the picker is incomplete', () => {
    expect(buildArtifactScope({ kind: 'NOTE', noteId: 'n_1' })).toEqual({ kind: 'NOTE', noteId: 'n_1' })
    expect(buildArtifactScope({ kind: 'NOTE', noteId: '' })).toBeNull()
    expect(buildArtifactScope({ kind: 'SPACE', spaceId: 'sp_1' })).toEqual({ kind: 'SPACE', spaceId: 'sp_1' })
    expect(buildArtifactScope({ kind: 'SELECTED_SOURCES', sourceIds: ['s_1'] })).toEqual({ kind: 'SELECTED_SOURCES', sourceIds: ['s_1'] })
    expect(buildArtifactScope({ kind: 'SELECTED_SOURCES', sourceIds: [] })).toBeNull()
    expect(buildArtifactScope({ kind: 'LIBRARY' })).toEqual({ kind: 'LIBRARY' })
  })

  it('passes the defaults through like the server', () => {
    expect(buildQuizPreferences(DEFAULT_QUIZ_PREFERENCES)).toEqual({
      language: 'en',
      difficulty: 'MIXED',
      itemCount: 10,
      questionTypes: ['SINGLE_CHOICE', 'TRUE_FALSE'],
      optionCount: 4,
    })
  })

  it('trims text, clamps counts, dedupes types, and omits an untimed quiz', () => {
    expect(buildQuizPreferences({
      ...DEFAULT_QUIZ_PREFERENCES,
      title: '  B-trees  ',
      topic: '   ',
      itemCount: 99,
      optionCount: 1,
      questionTypes: ['SINGLE_CHOICE', 'SINGLE_CHOICE'],
      durationMinutes: 999,
    })).toEqual({
      title: 'B-trees',
      language: 'en',
      difficulty: 'MIXED',
      itemCount: 30,
      questionTypes: ['SINGLE_CHOICE'],
      optionCount: 3,
      durationMinutes: 240,
    })
    expect(buildQuizPreferences({ ...DEFAULT_QUIZ_PREFERENCES, questionTypes: [] }).questionTypes).toEqual(['SINGLE_CHOICE', 'TRUE_FALSE'])
    expect(buildQuizPreferences({ ...DEFAULT_QUIZ_PREFERENCES, durationMinutes: 15 }).durationMinutes).toBe(15)
  })
})

describe('artifact error copy', () => {
  it.each([
    ['ARTIFACT_NOT_FOUND', /no longer exists or you don’t have access/],
    ['ARTIFACT_VERSION_NOT_FOUND', /no longer available.*newest version/],
    ['ARTIFACT_NOT_READY', /isn’t ready yet/],
    ['ARTIFACT_QUESTIONS_INVALID', /up to 8 current questions/],
    ['ARTIFACT_EVIDENCE_NOT_FOUND', /another topic or a wider scope/],
    ['ARTIFACT_TOO_FEW_VALID_ITEMS', /fewer questions/],
    ['ARTIFACT_REGENERATION_FAILED', /Nothing changed/],
    ['ARTIFACT_EVIDENCE_EXPIRED', /Generate a new quiz/],
    ['CONTEXT_ACCESS_REVOKED', /removed or restricted/],
    ['AI_JOB_AUTHORIZATION_UNAVAILABLE', /try again later/],
    ['AI_DAILY_LIMIT_REACHED', /allowance is used up/],
    ['AI_JOB_BUDGET_EXHAUSTED', /more than its limit/],
    ['ARTIFACT_PLAN_INVALID', /more than its limit/],
    ['ARTIFACT_STREAM_FAILED', /Progress continues below/],
  ] as const)('maps %s to friendly copy', (code, pattern) => {
    expect(apiErrorMessage(new ApiError(500, code, 'req-1', null))).toMatch(pattern)
  })
})
