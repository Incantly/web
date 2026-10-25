import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { configureApiClient } from './client'
import { apiErrorMessage, isApiError } from './errors'
import { waitlistApi } from './waitlist'
import { describeAuthError, WAITLIST_ONLY_PROBLEM } from '../auth-errors'

let fetchMock: ReturnType<typeof vi.fn>
let sleep: ReturnType<typeof vi.fn>
let restore: () => void

function reply(status: number, body: unknown, headers: Record<string, string> = {}) {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } }))
}

beforeEach(() => {
  fetchMock = vi.fn()
  sleep = vi.fn(async () => {})
  restore = configureApiClient({ fetch: fetchMock as unknown as typeof fetch, sleep, onUnauthorized: vi.fn() })
})
afterEach(() => restore())

describe('waitlistApi.join', () => {
  it('posts the name and email once to the same-origin endpoint', async () => {
    reply(202, { status: 'joined' })
    await waitlistApi.join({ name: 'Ada Lovelace', email: 'ada@example.com' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [path, init] = fetchMock.mock.calls[0]
    expect(path).toBe('/v1/waitlist')
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('include')
    expect(JSON.parse(init.body)).toEqual({ name: 'Ada Lovelace', email: 'ada@example.com' })
  })

  it('shows a rate limit instead of waiting it out', async () => {
    reply(429, { code: 'RATE_LIMITED' }, { 'Retry-After': '60' })
    const error = await waitlistApi.join({ name: 'Ada', email: 'ada@example.com' }).catch((cause: unknown) => cause)
    expect(isApiError(error, 'RATE_LIMITED')).toBe(true)
    expect(sleep).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(apiErrorMessage(error)).toMatch(/wait/i)
  })

  it.each([
    ['WAITLIST_UNAVAILABLE', 503, /try again in a few minutes/i],
    ['UNTRUSTED_PROXY', 403, /reload the page/i],
  ])('explains %s', async (code, status, message) => {
    reply(status, { code })
    const error = await waitlistApi.join({ name: 'Ada', email: 'ada@example.com' }).catch((cause: unknown) => cause)
    expect(apiErrorMessage(error)).toMatch(message)
  })
})

describe('WAITLIST_ONLY on sign-in', () => {
  it('points an unapproved email at the waitlist', () => {
    expect(describeAuthError({ code: 'WAITLIST_ONLY', status: 403 }, 'send')).toBe(WAITLIST_ONLY_PROBLEM)
    expect(WAITLIST_ONLY_PROBLEM.waitlist).toBe(true)
    expect(WAITLIST_ONLY_PROBLEM.message).toMatch(/waitlist/i)
  })
})
