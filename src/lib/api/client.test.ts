import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch, configureApiClient } from './client'
import { ApiError, NETWORK_ERROR } from './errors'
import { clearDiagnostics, getDiagnostics } from './diagnostics'

type Reply = { status: number; body?: unknown; headers?: Record<string, string> } | Error

function json(status: number, body?: unknown, headers: Record<string, string> = {}) {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
}

let replies: Reply[]
let fetchMock: ReturnType<typeof vi.fn>
let sleep: ReturnType<typeof vi.fn>
let onUnauthorized: ReturnType<typeof vi.fn>
let restore: () => void

beforeEach(() => {
  replies = []
  fetchMock = vi.fn(async () => {
    const reply = replies.shift()
    if (!reply) throw new Error('no reply queued')
    if (reply instanceof Error) throw reply
    return json(reply.status, reply.body, reply.headers)
  })
  sleep = vi.fn(async () => {})
  onUnauthorized = vi.fn()
  restore = configureApiClient({ fetch: fetchMock as unknown as typeof fetch, sleep, onUnauthorized })
  clearDiagnostics()
})
afterEach(() => restore())

const headerOf = (call: number, name: string) => (fetchMock.mock.calls[call][1] as RequestInit & { headers: Headers }).headers.get(name)

describe('apiFetch', () => {
  it('returns parsed JSON with the request ID', async () => {
    replies.push({ status: 200, body: { items: [] }, headers: { 'X-Request-Id': 'req-1' } })
    await expect(apiFetch('/v1/notes')).resolves.toEqual({ status: 200, data: { items: [] }, requestId: 'req-1' })
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: 'include', method: 'GET' })
  })

  it('returns undefined data for 204', async () => {
    replies.push({ status: 204 })
    await expect(apiFetch('/v1/notes/n1', { method: 'DELETE' })).resolves.toMatchObject({ status: 204, data: undefined })
  })

  it('sends JSON bodies and the idempotency key', async () => {
    replies.push({ status: 201, body: { id: 'n1' } })
    await apiFetch('/v1/notes', { method: 'POST', body: { title: 'A' }, idempotencyKey: 'key-12345678' })
    expect(fetchMock.mock.calls[0][1].body).toBe('{"title":"A"}')
    expect(headerOf(0, 'Content-Type')).toBe('application/json')
    expect(headerOf(0, 'Idempotency-Key')).toBe('key-12345678')
  })

  it('maps error bodies to ApiError with code, request ID and Retry-After', async () => {
    replies.push({ status: 404, body: { code: 'NOTE_NOT_FOUND', message: 'x' }, headers: { 'X-Request-Id': 'req-9' } })
    const error = await apiFetch('/v1/notes/n1').catch((e) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 404, code: 'NOTE_NOT_FOUND', requestId: 'req-9', retryAfterSeconds: null })
  })

  it('falls back to HTTP_<status> when the body has no code', async () => {
    replies.push({ status: 500, body: { message: 'boom' } })
    await expect(apiFetch('/v1/notes')).rejects.toMatchObject({ code: 'HTTP_500' })
  })

  it('retries 429 after Retry-After with the identical request and key', async () => {
    replies.push({ status: 429, body: { code: 'RATE_LIMITED' }, headers: { 'Retry-After': '2' } }, { status: 201, body: { id: 'n1' } })
    const result = await apiFetch('/v1/notes', { method: 'POST', body: { title: 'A' }, idempotencyKey: 'key-12345678' })
    expect(result.status).toBe(201)
    expect(sleep).toHaveBeenCalledWith(2000, undefined)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(headerOf(1, 'Idempotency-Key')).toBe('key-12345678')
    expect(fetchMock.mock.calls[1][1].body).toBe(fetchMock.mock.calls[0][1].body)
  })

  it('retries a retryable 503 code and gives up after maxAttempts', async () => {
    for (let i = 0; i < 3; i++) replies.push({ status: 503, body: { code: 'NOTE_TRANSACTION_RETRYABLE' } })
    await expect(apiFetch('/v1/notes/n1/transactions', { method: 'POST', body: {}, maxAttempts: 3 })).rejects.toMatchObject({ code: 'NOTE_TRANSACTION_RETRYABLE' })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('does not retry a 503 without Retry-After or a retryable code', async () => {
    replies.push({ status: 503, body: { code: 'AI_ALLOWANCE_UNAVAILABLE' } })
    await expect(apiFetch('/v1/ai/allowance')).rejects.toMatchObject({ status: 503 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each([400, 403, 404, 409, 422])('never retries %i', async (status) => {
    replies.push({ status, body: { code: `CODE_${status}` } })
    await expect(apiFetch('/v1/notes', { method: 'POST', body: {}, idempotencyKey: 'key-12345678' })).rejects.toMatchObject({ status })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
  })

  it('calls onUnauthorized once for repeated 401s and does not retry', async () => {
    replies.push({ status: 401, body: { code: 'SESSION_REQUIRED' } }, { status: 401, body: { code: 'SESSION_REQUIRED' } })
    await expect(apiFetch('/v1/notes')).rejects.toMatchObject({ status: 401 })
    await expect(apiFetch('/v1/spaces')).rejects.toMatchObject({ status: 401 })
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('retries network failures only when the request is safe to repeat', async () => {
    replies.push(new TypeError('offline'), { status: 200, body: {} })
    await expect(apiFetch('/v1/notes')).resolves.toMatchObject({ status: 200 })

    replies.push(new TypeError('offline'))
    await expect(apiFetch('/v1/notes/n1/restore', { method: 'POST', body: {} })).rejects.toMatchObject({ code: NETWORK_ERROR, status: 0 })

    replies.push(new TypeError('offline'), { status: 201, body: {} })
    await expect(apiFetch('/v1/notes', { method: 'POST', body: {}, idempotencyKey: 'key-12345678' })).resolves.toMatchObject({ status: 201 })
  })

  it('does not retry after the caller aborts', async () => {
    const controller = new AbortController()
    controller.abort(new DOMException('stop', 'AbortError'))
    replies.push(new DOMException('stop', 'AbortError'))
    await expect(apiFetch('/v1/notes', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('rejects paths outside /v1', async () => {
    await expect(apiFetch('/api/auth/get-session')).rejects.toThrow('/v1/')
  })

  it('records diagnostics without query strings or IDs', async () => {
    replies.push({ status: 404, body: { code: 'NOTE_NOT_FOUND' }, headers: { 'X-Request-Id': 'req-2' } })
    await apiFetch('/v1/notes/note_01ABC/checkpoint?cursor=secret').catch(() => {})
    expect(getDiagnostics()).toEqual([expect.objectContaining({ method: 'GET', path: '/v1/notes/:id/checkpoint', status: 404, code: 'NOTE_NOT_FOUND', requestId: 'req-2' })])
  })
})
