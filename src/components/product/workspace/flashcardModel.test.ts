import { describe, expect, it } from 'vitest'
import {
  REVIEW_GRADES,
  buildDeckPreferences,
  buildDeckScope,
  cardTypeLabel,
  clampElapsedMs,
  currentCard,
  dueNextCursor,
  dueQueueCopy,
  generationFailureCode,
  generationOutcome,
  generationProgressCopy,
  generationVersionId,
  isCurrentReveal,
  remainingCards,
  reviewInput,
  scopeSelectionError,
  splitCloze,
  type DeckScopeSelection,
} from './flashcardModel'
import type { DeckGeneration, DueCard, DueCards, RevealedCard } from '../../../lib/api/flashcards'

const card = (overrides: Partial<DueCard> = {}): DueCard => ({
  id: 'c1', type: 'BASIC', front: 'What is TCP?', difficulty: 'MEDIUM', conceptKey: 'tcp', tags: [], dueAt: '2026-01-01T00:00:00.000Z', stateVersion: 0, ...overrides,
})

const generation = (overrides: Partial<DeckGeneration> = {}): DeckGeneration => ({
  id: 'job_1', artifactId: 'deck_1', type: 'FLASHCARD_DECK', mode: 'CREATE', state: 'GENERATING', reused: false,
  progress: { batches: 2, completedBatches: 1, failedBatches: 0, questionsReady: 0, cardsReady: 5 },
  preview: [], createdAt: '2026-01-01T00:00:00.000Z', ...overrides,
})

describe('review grades', () => {
  it('covers exactly the four server ratings, hardest-forgotten first', () => {
    expect(REVIEW_GRADES.map((grade) => grade.rating)).toEqual(['AGAIN', 'HARD', 'GOOD', 'EASY'])
    for (const grade of REVIEW_GRADES) expect(grade.label.length).toBeGreaterThan(0)
  })

  it('builds the review body from the due response, never invented versions', () => {
    expect(reviewInput('v_1', card({ id: 'c9', stateVersion: 4 }), 'HARD', 1800)).toEqual({
      versionId: 'v_1', cardId: 'c9', rating: 'HARD', elapsedMs: 1800, expectedStateVersion: 4,
    })
  })

  it('clamps elapsed thinking time to the server range', () => {
    expect(clampElapsedMs(1000, 2800)).toBe(1800)
    expect(clampElapsedMs(5000, 1000)).toBe(0)
    expect(clampElapsedMs(0, 10_000_000)).toBe(3_600_000)
    expect(clampElapsedMs(Number.NaN, 1000)).toBe(0)
  })
})

describe('due queue', () => {
  const items = [card({ id: 'c1' }), card({ id: 'c2' }), card({ id: 'c3' })]

  it('keeps server order minus the reviewed cards', () => {
    expect(remainingCards(items, ['c1', 'c3']).map((entry) => entry.id)).toEqual(['c2'])
    expect(remainingCards(items, []).map((entry) => entry.id)).toEqual(['c1', 'c2', 'c3'])
  })

  it('picks the first remaining card, or an explicit still-due pick', () => {
    expect(currentCard(items, ['c1'], null)?.id).toBe('c2')
    expect(currentCard(items, [], 'c3')?.id).toBe('c3')
    expect(currentCard(items, ['c3'], 'c3')?.id).toBe('c1')
    expect(currentCard(items, ['c1', 'c2', 'c3'], null)).toBeNull()
  })

  it('reads the opaque next cursor past the broken codegen type', () => {
    const page = { deckId: 'd', versionId: 'v', policyVersion: 'p', items: [], nextCursor: 'cur_1' } as unknown as DueCards
    expect(dueNextCursor(page)).toBe('cur_1')
    expect(dueNextCursor({ deckId: 'd', versionId: 'v', policyVersion: 'p', items: [] })).toBeNull()
  })

  it('counts the queue with reviewed progress', () => {
    expect(dueQueueCopy(0, 0, false)).toBe('No cards due')
    expect(dueQueueCopy(5, 0, false)).toBe('5 due')
    expect(dueQueueCopy(3, 2, false)).toBe('3 of 5 left')
    expect(dueQueueCopy(0, 4, false)).toBe('All 4 reviewed')
    expect(dueQueueCopy(2, 1, true)).toBe('2 of 3 left (more loading)')
  })
})

describe('reveal state', () => {
  it('splits a cloze front on its marker', () => {
    expect(splitCloze('TCP [[c1]] delivery.')).toEqual([
      { kind: 'text', text: 'TCP ' },
      { kind: 'blank', id: 'c1' },
      { kind: 'text', text: ' delivery.' },
    ])
  })

  it('leaves plain fronts as one text run', () => {
    expect(splitCloze('What is TCP?')).toEqual([{ kind: 'text', text: 'What is TCP?' }])
  })

  it('labels card types with the reverse direction under test', () => {
    expect(cardTypeLabel(card({ type: 'BASIC' }))).toBe('Basic')
    expect(cardTypeLabel(card({ type: 'CLOZE' }))).toBe('Fill in the blank')
    expect(cardTypeLabel(card({ type: 'REVERSE', direction: 'FORWARD' }))).toBe('Reversible · front to back')
    expect(cardTypeLabel(card({ type: 'REVERSE', direction: 'REVERSE' }))).toBe('Reversible · back to front')
  })

  it('draws only reveals belonging to the card under review', () => {
    const revealed = { id: 'c1', versionId: 'v_1' } as RevealedCard
    expect(isCurrentReveal(revealed, 'v_1', 'c1')).toBe(true)
    expect(isCurrentReveal(revealed, 'v_2', 'c1')).toBe(false)
    expect(isCurrentReveal(revealed, 'v_1', 'c2')).toBe(false)
  })
})

describe('generation progress', () => {
  it('maps states to pending, ready, or failed', () => {
    for (const state of ['REQUESTED', 'GENERATING', 'VALIDATING', 'PERSISTING'] as const) expect(generationOutcome(state)).toBe('pending')
    expect(generationOutcome('COMPLETED')).toBe('ready')
    for (const state of ['FAILED', 'CANCELED', 'EXPIRED', 'AWAITING_CLARIFICATION'] as const) expect(generationOutcome(state)).toBe('failed')
  })

  it('counts validated cards from progress or previews', () => {
    expect(generationProgressCopy(generation())).toBe('5 cards ready…')
    expect(generationProgressCopy(generation({ progress: { batches: 1, completedBatches: 0, failedBatches: 0, questionsReady: 0 } }))).toBe('Reading your material…')
    expect(generationProgressCopy(generation({
      progress: { batches: 1, completedBatches: 0, failedBatches: 0, questionsReady: 0 },
      preview: [{ batch: 'b1', questions: [], cards: [{ slot: 's1', type: 'BASIC', front: 'Q?', difficulty: 'EASY' }] }],
    }))).toBe('1 card ready…')
  })

  it('reads failure codes and version ids past the broken codegen types', () => {
    expect(generationFailureCode(generation({ failureCode: 'FLASHCARD_TOO_FEW_VALID_CARDS' as unknown as Record<string, never> }))).toBe('FLASHCARD_TOO_FEW_VALID_CARDS')
    expect(generationFailureCode(generation())).toBeNull()
    expect(generationVersionId(generation({ versionId: 'v_9' as unknown as Record<string, never> }))).toBe('v_9')
  })
})

describe('generation form', () => {
  it.each([
    [{ kind: 'NOTE', noteId: 'n_1' }, { kind: 'NOTE', noteId: 'n_1' }],
    [{ kind: 'SPACE', spaceId: 'sp_1' }, { kind: 'SPACE', spaceId: 'sp_1' }],
    [{ kind: 'SELECTED_SOURCES', sourceIds: ['s1', 's2'] }, { kind: 'SELECTED_SOURCES', sourceIds: ['s1', 's2'] }],
    [{ kind: 'LIBRARY' }, { kind: 'LIBRARY' }],
  ] as const)('builds the %s scope', (selection, expected) => {
    expect(buildDeckScope(selection as DeckScopeSelection)).toEqual(expected)
  })

  it('leaves incomplete scopes unbuilt with a reason', () => {
    expect(buildDeckScope({ kind: 'NOTE', noteId: '' })).toBeNull()
    expect(scopeSelectionError({ kind: 'NOTE', noteId: '' })).toMatch(/note/)
    expect(buildDeckScope({ kind: 'SPACE', spaceId: '' })).toBeNull()
    expect(scopeSelectionError({ kind: 'SPACE', spaceId: '' })).toMatch(/Space/)
    expect(buildDeckScope({ kind: 'SELECTED_SOURCES', sourceIds: [] })).toBeNull()
    expect(scopeSelectionError({ kind: 'SELECTED_SOURCES', sourceIds: [] })).toMatch(/at least one source/)
    expect(scopeSelectionError({ kind: 'LIBRARY' })).toBeNull()
  })

  it('trims, clamps, and defaults preferences like the server', () => {
    expect(buildDeckPreferences({ title: '  Bio  ', topic: '', language: '', difficulty: 'HARD', itemCount: 200, cardTypes: [] })).toEqual({
      title: 'Bio', language: 'en', difficulty: 'HARD', itemCount: 40, cardTypes: ['BASIC'],
    })
    expect(buildDeckPreferences({ title: '', topic: 'cells', language: 'fr', difficulty: 'MIXED', itemCount: 2, cardTypes: ['CLOZE', 'CLOZE', 'BASIC'] })).toEqual({
      topic: 'cells', language: 'fr', difficulty: 'MIXED', itemCount: 5, cardTypes: ['CLOZE', 'BASIC'],
    })
  })
})
