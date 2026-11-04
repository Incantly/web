import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { configureApiClient } from './client'
import { quizApi } from './quiz'

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
const attempt = { attemptId: 'att_1', quizId: 'quiz_1', state: 'IN_PROGRESS', questions: [], answers: {} }

describe('quizApi.start / history', () => {
  it('starts an attempt with one idempotency key per press', async () => {
    replies.push(json(201, { created: true, attempt }))
    const started = await quizApi.start('quiz:1', 'key-1')
    expect(fetchMock.mock.calls[0][0]).toBe('/v1/quizzes/quiz%3A1/attempts')
    const init = initOf(0)
    expect(init.method).toBe('POST')
    expect(init.headers.get('Idempotency-Key')).toBe('key-1')
    expect(started.created).toBe(true)
  })

  it('replays the same attempt on a same-key retry', async () => {
    replies.push(json(200, { created: false, attempt }))
    const started = await quizApi.start('quiz_1', 'key-1')
    expect(started.created).toBe(false)
    expect(started.attempt.attemptId).toBe('att_1')
  })

  it('lists attempt history newest first', async () => {
    replies.push(json(200, { items: [{ attemptId: 'att_2' }, { attemptId: 'att_1' }] }))
    const items = await quizApi.history('quiz_1')
    expect(fetchMock.mock.calls[0][0]).toBe('/v1/quizzes/quiz_1/attempts')
    expect(items.map((item) => item.attemptId)).toEqual(['att_2', 'att_1'])
  })

  it('treats another user\u2019s quiz as QUIZ_NOT_FOUND without retrying', async () => {
    replies.push(json(404, { code: 'QUIZ_NOT_FOUND' }))
    await expect(quizApi.history('someone-else')).rejects.toMatchObject({ code: 'QUIZ_NOT_FOUND' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('quizApi.getAttempt / saveAnswers', () => {
  it('resumes the attempt with questions and saved answers', async () => {
    replies.push(json(200, { ...attempt, answers: { q1: 'b' } }))
    const resumed = await quizApi.getAttempt('att_1')
    expect(fetchMock.mock.calls[0][0]).toBe('/v1/quiz-attempts/att_1')
    expect(resumed.answers).toEqual({ q1: 'b' })
  })

  it('merges answers with PUT, null clearing one question', async () => {
    replies.push(json(200, attempt))
    await quizApi.saveAnswers('att_1', { q1: 'c', q2: true, q3: null })
    expect(fetchMock.mock.calls[0][0]).toBe('/v1/quiz-attempts/att_1/answers')
    const init = initOf(0)
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body as string)).toEqual({ answers: { q1: 'c', q2: true, q3: null } })
  })

  it('sends array and map answers in the type-specific shapes', async () => {
    replies.push(json(200, attempt))
    await quizApi.saveAnswers('att_1', { q3: ['b', 'd'], q5: { l1: 'r2' }, q6: ['o1', 'o2', 'o3'] })
    expect(JSON.parse(initOf(0).body as string)).toEqual({ answers: { q3: ['b', 'd'], q5: { l1: 'r2' }, q6: ['o1', 'o2', 'o3'] } })
  })

  it('surfaces a save after the deadline as QUIZ_ATTEMPT_EXPIRED', async () => {
    replies.push(json(409, { code: 'QUIZ_ATTEMPT_EXPIRED' }))
    await expect(quizApi.saveAnswers('att_1', { q1: 'b' })).rejects.toMatchObject({ code: 'QUIZ_ATTEMPT_EXPIRED' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('quizApi.submit / result', () => {
  const result = { attemptId: 'att_1', score: 2, maxScore: 3, passed: true, explanationsComplete: true, questions: [] }

  it('submits with the last answers merged and one idempotency key', async () => {
    replies.push(json(200, result))
    const graded = await quizApi.submit('att_1', { answers: { q1: 'b' } }, 'submit-key-1')
    expect(fetchMock.mock.calls[0][0]).toBe('/v1/quiz-attempts/att_1/submit')
    const init = initOf(0)
    expect(init.method).toBe('POST')
    expect(init.headers.get('Idempotency-Key')).toBe('submit-key-1')
    expect(JSON.parse(init.body as string)).toEqual({ answers: { q1: 'b' } })
    expect(graded.score).toBe(2)
  })

  it('submits with an empty body when everything is already saved', async () => {
    replies.push(json(200, result))
    await quizApi.submit('att_1', {}, 'submit-key-2')
    expect(JSON.parse(initOf(0).body as string)).toEqual({})
  })

  it('reads the scored result after submit', async () => {
    replies.push(json(200, result))
    const read = await quizApi.result('att_1')
    expect(fetchMock.mock.calls[0][0]).toBe('/v1/quiz-attempts/att_1/result')
    expect(read.passed).toBe(true)
  })

  it('treats reading before submit as QUIZ_ATTEMPT_NOT_SUBMITTED', async () => {
    replies.push(json(409, { code: 'QUIZ_ATTEMPT_NOT_SUBMITTED' }))
    await expect(quizApi.result('att_1')).rejects.toMatchObject({ code: 'QUIZ_ATTEMPT_NOT_SUBMITTED' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
