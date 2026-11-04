import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { configureApiClient } from './client'
import { liveApi } from './live'

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

describe('liveApi.authorize', () => {
  it('posts the note id and returns the token with the current room id', async () => {
    replies.push(json(200, { token: 'tok', roomId: 'note:n1:0' }))
    const result = await liveApi.authorize('n1')
    expect(fetchMock.mock.calls[0][0]).toBe('/v1/liveblocks/authorize')
    const init = initOf(0)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ noteId: 'n1' })
    expect(init.credentials).toBe('include')
    expect(result).toEqual({ token: 'tok', roomId: 'note:n1:0' })
  })

  it('routes definitive failures to the caller without retrying', async () => {
    replies.push(json(409, { code: 'NOTE_NOT_SHARED' }))
    await expect(liveApi.authorize('n1')).rejects.toMatchObject({ code: 'NOTE_NOT_SHARED' })
    replies.push(json(403, { code: 'NOTE_ACCESS_DENIED' }))
    await expect(liveApi.authorize('n1')).rejects.toMatchObject({ code: 'NOTE_ACCESS_DENIED' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('liveApi.resolveUsers', () => {
  it('posts the user ids and returns the resolved profiles in order', async () => {
    replies.push(json(200, [{ id: 'user:u1', name: 'Ada', color: '#2b62d9' }]))
    const users = await liveApi.resolveUsers(['user:u1', 'user:stranger'])
    expect(fetchMock.mock.calls[0][0]).toBe('/v1/liveblocks/users')
    expect(JSON.parse(initOf(0).body as string)).toEqual({ userIds: ['user:u1', 'user:stranger'] })
    // Strangers are silently omitted: the result can be shorter than the request.
    expect(users).toEqual([{ id: 'user:u1', name: 'Ada', color: '#2b62d9' }])
  })
})

describe('liveApi.liveStatus', () => {
  it('reads the live-or-saved-sync decision for a note', async () => {
    replies.push(json(200, { mode: 'live', roomId: 'note:n1:0', offlineEnabled: false }))
    const status = await liveApi.liveStatus('note:1')
    expect(fetchMock.mock.calls[0][0]).toBe('/v1/notes/note%3A1/live-status')
    expect(status.mode).toBe('live')
  })

  it('surfaces a saved-sync pause with its reason', async () => {
    replies.push(json(200, { mode: 'saved_sync', reason: 'BUDGET_EXHAUSTED', resetsAt: '2026-12-01T00:00:00.000Z', offlineEnabled: false }))
    const status = await liveApi.liveStatus('note:1')
    expect(status).toMatchObject({ mode: 'saved_sync', reason: 'BUDGET_EXHAUSTED' })
  })
})

describe('liveApi.mentionSuggestions', () => {
  it('lists mentionable collaborators without a filter', async () => {
    replies.push(json(200, [{ id: 'user:u1', name: 'Ada', color: '#2b62d9' }]))
    const suggestions = await liveApi.mentionSuggestions('note:1')
    expect(fetchMock.mock.calls[0][0]).toBe('/v1/notes/note%3A1/mention-suggestions')
    expect(suggestions).toHaveLength(1)
  })

  it('passes the prefix filter and limit through', async () => {
    replies.push(json(200, []))
    await liveApi.mentionSuggestions('note:1', { q: 'ad', limit: 5 })
    expect(fetchMock.mock.calls[0][0]).toBe('/v1/notes/note%3A1/mention-suggestions?q=ad&limit=5')
  })
})
