import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { configureApiClient } from './client'
import { flashcardsApi } from './flashcards'

function json(status: number, body?: unknown, headers: Record<string, string> = {}) {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
}

let replies: Response[]
let fetchMock: ReturnType<typeof vi.fn>
let restore: () => void

beforeEach(() => {
  replies = []
  fetchMock = vi.fn(async () => replies.shift() ?? json(500, { code: 'HTTP_500' }))
  restore = configureApiClient({ fetch: fetchMock as unknown as typeof fetch, sleep: async () => {} })
})
afterEach(() => restore())

const initOf = (call: number) => fetchMock.mock.calls[call][1] as RequestInit & { headers: Headers }
const generation = { id: 'job_1', artifactId: 'deck_1', type: 'FLASHCARD_DECK', mode: 'CREATE', state: 'REQUESTED', reused: false, progress: { batches: 1, completedBatches: 0, failedBatches: 0, questionsReady: 0 }, preview: [], createdAt: '2026-01-01T00:00:00.000Z' }

describe('flashcardsApi.generate / generation', () => {
  it('generates a deck from a scope with preferences and one idempotency key', async () => {
    replies.push(json(202, { created: true, generation }))
    const accepted = await flashcardsApi.generate(
      { kind: 'SELECTED_SOURCES', sourceIds: ['src_1'] },
      { topic: 'network protocols', itemCount: 6 },
      'deck-key-1',
    )
    expect(fetchMock.mock.calls[0][0]).toBe('/v1/flashcard-decks/generations')
    const init = initOf(0)
    expect(init.method).toBe('POST')
    expect(init.headers.get('Idempotency-Key')).toBe('deck-key-1')
    expect(JSON.parse(init.body as string)).toEqual({
      scope: { kind: 'SELECTED_SOURCES', sourceIds: ['src_1'] },
      preferences: { topic: 'network protocols', itemCount: 6 },
    })
    expect(accepted.created).toBe(true)
    expect(accepted.generation.artifactId).toBe('deck_1')
  })

  it('omits preferences when the learner keeps the defaults', async () => {
    replies.push(json(202, { created: true, generation }))
    await flashcardsApi.generate({ kind: 'LIBRARY' }, undefined, 'deck-key-2')
    expect(JSON.parse(initOf(0).body as string)).toEqual({ scope: { kind: 'LIBRARY' } })
  })

  it('replays the same generation on a same-key retry', async () => {
    replies.push(json(202, { created: false, generation }))
    const accepted = await flashcardsApi.generate({ kind: 'LIBRARY' }, undefined, 'deck-key-1')
    expect(accepted.created).toBe(false)
  })

  it('reads generation progress from the shared artifact-jobs route', async () => {
    replies.push(json(200, { ...generation, state: 'GENERATING', progress: { batches: 2, completedBatches: 1, failedBatches: 0, questionsReady: 0, cardsReady: 5 } }))
    const read = await flashcardsApi.generation('job:1')
    expect(fetchMock.mock.calls[0][0]).toBe('/v1/artifact-jobs/job%3A1')
    expect(read.state).toBe('GENERATING')
    expect(read.progress.cardsReady).toBe(5)
  })

  it('treats an empty scope as ARTIFACT_SCOPE_EMPTY without retrying', async () => {
    replies.push(json(422, { code: 'ARTIFACT_SCOPE_EMPTY' }))
    await expect(flashcardsApi.generate({ kind: 'SPACE', spaceId: 'sp_1' }, undefined, 'deck-key-3')).rejects.toMatchObject({ code: 'ARTIFACT_SCOPE_EMPTY' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('flashcardsApi.due / reveal', () => {
  const duePage = { deckId: 'deck_1', versionId: 'v_1', policyVersion: 'flashcard-intervals-v1', items: [{ id: 'c1', type: 'BASIC', front: 'What is TCP?', difficulty: 'MEDIUM', conceptKey: 'tcp', tags: [], dueAt: '2026-01-01T00:00:00.000Z', stateVersion: 0 }] }

  it('reads due card fronts with limit and cursor', async () => {
    replies.push(json(200, duePage))
    const due = await flashcardsApi.due('deck_1', { limit: 20, cursor: 'cur_1' })
    expect(fetchMock.mock.calls[0][0]).toBe('/v1/flashcard-decks/deck_1/due?limit=20&cursor=cur_1')
    expect(due.items).toHaveLength(1)
    expect(due.items[0]).not.toHaveProperty('back')
  })

  it('reads the first due page with no query string', async () => {
    replies.push(json(200, duePage))
    await flashcardsApi.due('deck_1')
    expect(fetchMock.mock.calls[0][0]).toBe('/v1/flashcard-decks/deck_1/due')
  })

  it('reveals one card answer through the version-scoped route', async () => {
    replies.push(json(200, { id: 'c1', type: 'BASIC', front: 'What is TCP?', difficulty: 'MEDIUM', conceptKey: 'tcp', tags: [], versionId: 'v_1', back: 'A transport protocol.', citations: [] }))
    const revealed = await flashcardsApi.reveal('deck_1', 'v_1', 'c1')
    expect(fetchMock.mock.calls[0][0]).toBe('/v1/flashcard-decks/deck_1/versions/v_1/cards/c1')
    expect(revealed.back).toBe('A transport protocol.')
  })

  it('treats an unfinished deck as FLASHCARD_DECK_NOT_READY without retrying', async () => {
    replies.push(json(409, { code: 'FLASHCARD_DECK_NOT_READY' }))
    await expect(flashcardsApi.due('deck_1')).rejects.toMatchObject({ code: 'FLASHCARD_DECK_NOT_READY' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('flashcardsApi.review / regenerate', () => {
  const schedule = { dueAt: '2026-01-02T00:00:00.000Z', reviewedAt: '2026-01-01T00:00:00.000Z', intervalMinutes: 1440, successStreak: 1, stateVersion: 1 }

  it('reviews with the rating and state version from the due response', async () => {
    replies.push(json(200, { id: 'rev_1', versionId: 'v_1', cardId: 'c1', policyVersion: 'flashcard-intervals-v1', schedule }))
    const reviewed = await flashcardsApi.review('deck_1', { versionId: 'v_1', cardId: 'c1', rating: 'GOOD', elapsedMs: 1800, expectedStateVersion: 0 }, 'review-key-1')
    expect(fetchMock.mock.calls[0][0]).toBe('/v1/flashcard-decks/deck_1/reviews')
    const init = initOf(0)
    expect(init.method).toBe('POST')
    expect(init.headers.get('Idempotency-Key')).toBe('review-key-1')
    expect(JSON.parse(init.body as string)).toEqual({ versionId: 'v_1', cardId: 'c1', rating: 'GOOD', elapsedMs: 1800, expectedStateVersion: 0 })
    expect(reviewed.schedule.successStreak).toBe(1)
  })

  it('surfaces a stale card state as FLASHCARD_REVIEW_CONFLICT without retrying', async () => {
    replies.push(json(409, { code: 'FLASHCARD_REVIEW_CONFLICT' }))
    await expect(flashcardsApi.review('deck_1', { versionId: 'v_1', cardId: 'c1', rating: 'GOOD', elapsedMs: 5, expectedStateVersion: 0 }, 'review-key-2')).rejects.toMatchObject({ code: 'FLASHCARD_REVIEW_CONFLICT' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('replaces cards with 1–8 ids and one idempotency key', async () => {
    replies.push(json(202, { created: true, generation: { ...generation, mode: 'REGENERATE' } }))
    const accepted = await flashcardsApi.regenerate('deck_1', ['c1', 'c3'], 'regen-key-1')
    expect(fetchMock.mock.calls[0][0]).toBe('/v1/flashcard-decks/deck_1/regenerations')
    const init = initOf(0)
    expect(init.method).toBe('POST')
    expect(init.headers.get('Idempotency-Key')).toBe('regen-key-1')
    expect(JSON.parse(init.body as string)).toEqual({ cardIds: ['c1', 'c3'] })
    expect(accepted.generation.mode).toBe('REGENERATE')
  })

  it('surfaces a version change during review as FLASHCARD_VERSION_CHANGED', async () => {
    replies.push(json(409, { code: 'FLASHCARD_VERSION_CHANGED' }))
    await expect(flashcardsApi.review('deck_1', { versionId: 'v_0', cardId: 'c1', rating: 'AGAIN', elapsedMs: 5, expectedStateVersion: 0 }, 'review-key-3')).rejects.toMatchObject({ code: 'FLASHCARD_VERSION_CHANGED' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
