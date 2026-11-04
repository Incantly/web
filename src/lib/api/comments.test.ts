import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { configureApiClient } from './client'
import { commentsApi } from './comments'

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

describe('commentsApi.create', () => {
  it('starts a thread with paragraphs and the idempotency key', async () => {
    replies.push(json(201, { threadId: 'th_1', commentId: 'c_1' }))
    const result = await commentsApi.create(
      'note:1',
      { paragraphs: [[{ type: 'text', text: 'Looks good' }]] },
      { idempotencyKey: 'key-1' },
    )
    expect(fetchMock.mock.calls[0][0]).toBe('/v1/notes/note%3A1/comments')
    const init = initOf(0)
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('include')
    expect(init.headers.get('Idempotency-Key')).toBe('key-1')
    expect(JSON.parse(init.body as string)).toEqual({ paragraphs: [[{ type: 'text', text: 'Looks good' }]] })
    expect(result).toEqual({ threadId: 'th_1', commentId: 'c_1' })
  })

  it('replies into a thread with mentions and an anchor is omitted', async () => {
    replies.push(json(201, { threadId: 'th_1', commentId: 'c_2' }))
    await commentsApi.create(
      'n1',
      { threadId: 'th_1', paragraphs: [[{ type: 'text', text: 'Thanks, ' }, { type: 'mention', userId: 'u_ada' }]] },
      { idempotencyKey: 'key-2' },
    )
    expect(JSON.parse(initOf(0).body as string)).toEqual({
      threadId: 'th_1',
      paragraphs: [[{ type: 'text', text: 'Thanks, ' }, { type: 'mention', userId: 'u_ada' }]],
    })
  })

  it('retries a 503 with the same key and returns the stored comment', async () => {
    replies.push(json(503, { code: 'LIVE_COLLABORATION_UNAVAILABLE' }, { 'Retry-After': '1' }))
    replies.push(json(200, { threadId: 'th_1', commentId: 'c_1' }))
    const result = await commentsApi.create('n1', { paragraphs: [[{ type: 'text', text: 'Hi' }]] }, { idempotencyKey: 'key-3' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(initOf(0).headers.get('Idempotency-Key')).toBe('key-3')
    expect(initOf(1).headers.get('Idempotency-Key')).toBe('key-3')
    expect(result).toEqual({ threadId: 'th_1', commentId: 'c_1' })
  })

  it('surfaces stable comment failures without retrying', async () => {
    replies.push(json(403, { code: 'COMMENTS_NOT_ALLOWED' }))
    await expect(commentsApi.create('n1', { paragraphs: [] }, { idempotencyKey: 'key-4' })).rejects.toMatchObject({ code: 'COMMENTS_NOT_ALLOWED' })
    replies.push(json(404, { code: 'THREAD_NOT_FOUND' }))
    await expect(commentsApi.create('n1', { threadId: 'th_gone', paragraphs: [] }, { idempotencyKey: 'key-5' })).rejects.toMatchObject({ code: 'THREAD_NOT_FOUND' })
    replies.push(json(400, { code: 'COMMENT_MENTION_INVALID' }))
    await expect(commentsApi.create('n1', { paragraphs: [] }, { idempotencyKey: 'key-6' })).rejects.toMatchObject({ code: 'COMMENT_MENTION_INVALID' })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})
