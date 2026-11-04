import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { configureApiClient } from './client'
import { artifactsApi, parseArtifactStreamEvent } from './artifacts'

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
const generation = {
  id: 'job_1', artifactId: 'art_1', type: 'QUIZ', mode: 'CREATE', state: 'REQUESTED', reused: false,
  progress: { batches: 2, completedBatches: 0, failedBatches: 0, questionsReady: 0 }, preview: [], createdAt: '2026-01-01T00:00:00.000Z',
}
const artifact = {
  id: 'art_1', type: 'QUIZ', title: 'B-trees quiz', status: 'READY',
  currentVersion: { id: 'v_1', versionNumber: 1, itemCount: 10, explanationsReady: true, createdAt: '2026-01-01T00:00:00.000Z' },
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('artifactsApi.generate / generation / cancel', () => {
  it('starts a quiz generation with scope, preferences, and one idempotency key', async () => {
    replies.push(json(202, { created: true, generation }))
    const accepted = await artifactsApi.generate(
      { kind: 'SELECTED_SOURCES', sourceIds: ['src_1'] },
      { topic: 'B-tree page splits', itemCount: 10 },
      'quiz-key-1',
    )
    expect(fetchMock.mock.calls[0][0]).toBe('/v1/artifacts/generations')
    const init = initOf(0)
    expect(init.method).toBe('POST')
    expect(init.headers.get('Idempotency-Key')).toBe('quiz-key-1')
    expect(JSON.parse(init.body as string)).toEqual({
      type: 'QUIZ',
      scope: { kind: 'SELECTED_SOURCES', sourceIds: ['src_1'] },
      preferences: { topic: 'B-tree page splits', itemCount: 10 },
    })
    expect(accepted.created).toBe(true)
    expect(accepted.generation.artifactId).toBe('art_1')
  })

  it('omits preferences when the learner keeps the defaults', async () => {
    replies.push(json(202, { created: true, generation }))
    await artifactsApi.generate({ kind: 'LIBRARY' }, undefined, 'quiz-key-2')
    expect(JSON.parse(initOf(0).body as string)).toEqual({ type: 'QUIZ', scope: { kind: 'LIBRARY' } })
  })

  it('replays the original generation on a same-key retry', async () => {
    replies.push(json(202, { created: false, generation }))
    const accepted = await artifactsApi.generate({ kind: 'LIBRARY' }, undefined, 'quiz-key-1')
    expect(accepted.created).toBe(false)
  })

  it('reads generation progress from the artifact-jobs route', async () => {
    replies.push(json(200, { ...generation, state: 'GENERATING', progress: { batches: 2, completedBatches: 1, failedBatches: 0, questionsReady: 5 } }))
    const read = await artifactsApi.generation('job:1')
    expect(fetchMock.mock.calls[0][0]).toBe('/v1/artifact-jobs/job%3A1')
    expect(read.state).toBe('GENERATING')
    expect(read.progress.questionsReady).toBe(5)
  })

  it('cancels a generation idempotently', async () => {
    replies.push(json(200, { ...generation, state: 'CANCELED' }))
    const stopped = await artifactsApi.cancel('job_1')
    expect(fetchMock.mock.calls[0][0]).toBe('/v1/artifact-jobs/job_1/cancel')
    expect(initOf(0).method).toBe('POST')
    expect(stopped.state).toBe('CANCELED')
  })

  it('treats an empty scope as ARTIFACT_SCOPE_EMPTY without retrying', async () => {
    replies.push(json(422, { code: 'ARTIFACT_SCOPE_EMPTY' }))
    await expect(artifactsApi.generate({ kind: 'SPACE', spaceId: 'sp_1' }, undefined, 'quiz-key-3')).rejects.toMatchObject({ code: 'ARTIFACT_SCOPE_EMPTY' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('artifactsApi.list / get / versions / version', () => {
  it('lists artifacts with type, archived, and cursor params', async () => {
    replies.push(json(200, { items: [artifact], nextCursor: 'cur_1' }))
    const page = await artifactsApi.list({ type: 'QUIZ', includeArchived: true, cursor: 'cur_0' })
    expect(fetchMock.mock.calls[0][0]).toBe('/v1/artifacts?type=QUIZ&includeArchived=true&cursor=cur_0')
    expect(page.items).toHaveLength(1)
  })

  it('lists the default page with no query string', async () => {
    replies.push(json(200, { items: [] }))
    await artifactsApi.list()
    expect(fetchMock.mock.calls[0][0]).toBe('/v1/artifacts')
  })

  it('reads one artifact', async () => {
    replies.push(json(200, artifact))
    const read = await artifactsApi.get('art_1')
    expect(fetchMock.mock.calls[0][0]).toBe('/v1/artifacts/art_1')
    expect(read.title).toBe('B-trees quiz')
  })

  it('lists versions newest first', async () => {
    replies.push(json(200, { items: [artifact.currentVersion] }))
    const versions = await artifactsApi.versions('art_1')
    expect(fetchMock.mock.calls[0][0]).toBe('/v1/artifacts/art_1/versions')
    expect(versions.items[0].versionNumber).toBe(1)
  })

  it('reads one version’s public content without answers', async () => {
    const content = {
      id: 'v_1', versionNumber: 1, itemCount: 1, explanationsReady: false, createdAt: '2026-01-01T00:00:00.000Z',
      quiz: { title: 'B-trees quiz', instructions: '', questions: [{ id: 'q1', type: 'TRUE_FALSE', prompt: 'B-trees split?', difficulty: 'EASY', points: 1 }], totalPoints: 1, passingScore: 1 },
    }
    replies.push(json(200, content))
    const read = await artifactsApi.version('art_1', 'v_1')
    expect(fetchMock.mock.calls[0][0]).toBe('/v1/artifacts/art_1/versions/v_1')
    expect(read.quiz?.questions).toHaveLength(1)
    expect(read.quiz?.questions[0]).not.toHaveProperty('correctAnswer')
  })

  it('treats another user’s artifact as ARTIFACT_NOT_FOUND without retrying', async () => {
    replies.push(json(404, { code: 'ARTIFACT_NOT_FOUND' }))
    await expect(artifactsApi.get('art_x')).rejects.toMatchObject({ code: 'ARTIFACT_NOT_FOUND' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('artifactsApi.regenerate / archive / remove', () => {
  it('replaces questions with 1–8 ids and one idempotency key', async () => {
    replies.push(json(202, { created: true, generation: { ...generation, mode: 'REGENERATE' } }))
    const accepted = await artifactsApi.regenerate('art_1', ['q3', 'q7'], 'regen-key-1')
    expect(fetchMock.mock.calls[0][0]).toBe('/v1/artifacts/art_1/regenerations')
    const init = initOf(0)
    expect(init.method).toBe('POST')
    expect(init.headers.get('Idempotency-Key')).toBe('regen-key-1')
    expect(JSON.parse(init.body as string)).toEqual({ questionIds: ['q3', 'q7'] })
    expect(accepted.generation.mode).toBe('REGENERATE')
  })

  it('surfaces a bad question pick as ARTIFACT_QUESTIONS_INVALID without retrying', async () => {
    replies.push(json(422, { code: 'ARTIFACT_QUESTIONS_INVALID' }))
    await expect(artifactsApi.regenerate('art_1', ['q99'], 'regen-key-2')).rejects.toMatchObject({ code: 'ARTIFACT_QUESTIONS_INVALID' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('archives an artifact idempotently', async () => {
    replies.push(json(200, { ...artifact, status: 'ARCHIVED' }))
    const archived = await artifactsApi.archive('art_1')
    expect(fetchMock.mock.calls[0][0]).toBe('/v1/artifacts/art_1/archive')
    expect(initOf(0).method).toBe('POST')
    expect(archived.status).toBe('ARCHIVED')
  })

  it('deletes an artifact permanently', async () => {
    replies.push(new Response(null, { status: 204 }))
    await artifactsApi.remove('art_1')
    expect(fetchMock.mock.calls[0][0]).toBe('/v1/artifacts/art_1')
    expect(initOf(0).method).toBe('DELETE')
  })

  it('treats a second delete as ARTIFACT_NOT_FOUND without retrying', async () => {
    replies.push(json(404, { code: 'ARTIFACT_NOT_FOUND' }))
    await expect(artifactsApi.remove('art_1')).rejects.toMatchObject({ code: 'ARTIFACT_NOT_FOUND' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('parseArtifactStreamEvent', () => {
  const progress = { batches: 3, completedBatches: 1, failedBatches: 0, questionsReady: 5 }

  it('parses a state event with state and progress', () => {
    expect(parseArtifactStreamEvent('state', JSON.stringify({ state: 'GENERATING', progress }))).toEqual({ type: 'state', state: 'GENERATING', progress })
  })

  it('parses a batch event with questions and no answers', () => {
    const batch = { batch: 'b1', questions: [{ slot: 's1', type: 'TRUE_FALSE', difficulty: 'EASY', prompt: 'B-trees split?' }] }
    expect(parseArtifactStreamEvent('batch', JSON.stringify(batch))).toEqual({ type: 'batch', batch })
  })

  it('parses a deck batch with card fronts', () => {
    const batch = { batch: 'b1', questions: [], cards: [{ slot: 's1', type: 'BASIC', front: 'What is TCP?', difficulty: 'MEDIUM' }] }
    const parsed = parseArtifactStreamEvent('batch', JSON.stringify(batch))
    expect(parsed?.type).toBe('batch')
  })

  it('parses a done event with artifact, version, and failure fields', () => {
    expect(parseArtifactStreamEvent('done', JSON.stringify({ state: 'COMPLETED', artifactId: 'art_1', versionId: 'v_1', failureCode: null, reused: false })))
      .toEqual({ type: 'done', state: 'COMPLETED', artifactId: 'art_1', versionId: 'v_1', failureCode: null, reused: false })
  })

  it('parses a failed done event with its stable failure code', () => {
    const parsed = parseArtifactStreamEvent('done', JSON.stringify({ state: 'FAILED', artifactId: 'art_1', versionId: null, failureCode: 'ARTIFACT_TOO_FEW_VALID_ITEMS' }))
    expect(parsed).toEqual({ type: 'done', state: 'FAILED', artifactId: 'art_1', versionId: null, failureCode: 'ARTIFACT_TOO_FEW_VALID_ITEMS', reused: false })
  })

  it('parses a timeout event and a stream error event', () => {
    expect(parseArtifactStreamEvent('timeout', JSON.stringify({ state: 'GENERATING' }))).toEqual({ type: 'timeout', state: 'GENERATING' })
    expect(parseArtifactStreamEvent('error', JSON.stringify({ code: 'ARTIFACT_STREAM_FAILED' }))).toEqual({ type: 'error', code: 'ARTIFACT_STREAM_FAILED' })
  })

  it('returns null for malformed payloads and unknown event names', () => {
    expect(parseArtifactStreamEvent('state', 'not json')).toBeNull()
    expect(parseArtifactStreamEvent('state', JSON.stringify({ state: 'GENERATING' }))).toBeNull()
    expect(parseArtifactStreamEvent('batch', JSON.stringify({ batch: 'b1' }))).toBeNull()
    expect(parseArtifactStreamEvent('done', JSON.stringify({ state: 'COMPLETED' }))).toBeNull()
    expect(parseArtifactStreamEvent('progress', JSON.stringify({ state: 'GENERATING', progress }))).toBeNull()
  })
})
