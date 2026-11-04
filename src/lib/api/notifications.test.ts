import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { configureApiClient } from './client'
import { notificationsApi } from './notifications'

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

describe('notificationsApi.inbox', () => {
  it('lists the first page without parameters', async () => {
    replies.push(json(200, { items: [{ id: 'n1' }], nextCursor: 'c1' }))
    const page = await notificationsApi.inbox()
    expect(fetchMock.mock.calls[0][0]).toBe('/v1/notifications')
    expect(page).toEqual({ items: [{ id: 'n1' }], nextCursor: 'c1' })
  })

  it('passes the opaque cursor and limit through', async () => {
    replies.push(json(200, { items: [], nextCursor: null }))
    await notificationsApi.inbox({ cursor: 'opaque+cursor', limit: 50 })
    expect(fetchMock.mock.calls[0][0]).toBe('/v1/notifications?cursor=opaque%2Bcursor&limit=50')
  })
})

describe('notificationsApi.markRead / readAll', () => {
  it('marks one notification read with an empty POST', async () => {
    replies.push(json(200, { id: 'n:1', readAt: '2026-01-01T00:00:00Z' }))
    const row = await notificationsApi.markRead('n:1')
    expect(fetchMock.mock.calls[0][0]).toBe('/v1/notifications/n%3A1/read')
    expect(initOf(0).method).toBe('POST')
    expect(row.readAt).not.toBeNull()
  })

  it('treats a gone notification as NOTIFICATION_NOT_FOUND without retrying', async () => {
    replies.push(json(404, { code: 'NOTIFICATION_NOT_FOUND' }))
    await expect(notificationsApi.markRead('missing')).rejects.toMatchObject({ code: 'NOTIFICATION_NOT_FOUND' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('marks everything read', async () => {
    replies.push(json(200, { updated: 3 }))
    const result = await notificationsApi.readAll()
    expect(fetchMock.mock.calls[0][0]).toBe('/v1/notifications/read-all')
    expect(initOf(0).method).toBe('POST')
    expect(result).toEqual({ updated: 3 })
  })
})

describe('notificationsApi.preferences', () => {
  it('reads the master switch plus per-note and per-thread rows', async () => {
    replies.push(json(200, { emailEnabledAll: true, notes: [{ noteId: 'n1', emailEnabled: false }], threads: [] }))
    const prefs = await notificationsApi.preferences()
    expect(fetchMock.mock.calls[0][0]).toBe('/v1/notification-preferences')
    expect(prefs.emailEnabledAll).toBe(true)
    expect(prefs.notes).toHaveLength(1)
  })

  it('patches the master switch with { emailEnabled }', async () => {
    replies.push(json(200, { emailEnabledAll: false, notes: [], threads: [] }))
    const prefs = await notificationsApi.updatePreferences({ emailEnabled: false })
    expect(fetchMock.mock.calls[0][0]).toBe('/v1/notification-preferences')
    const init = initOf(0)
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body as string)).toEqual({ emailEnabled: false })
    expect(prefs.emailEnabledAll).toBe(false)
  })
})

describe('notificationsApi mutes', () => {
  it.each([
    ['muteNote', 'PUT', '/v1/notes/note%3A1/mute'],
    ['unmuteNote', 'DELETE', '/v1/notes/note%3A1/mute'],
  ] as const)('%s sends %s with no body', async (fn, method, path) => {
    replies.push(json(200, { noteId: 'note:1', muted: method === 'PUT' }))
    const state = await notificationsApi[fn]('note:1')
    expect(fetchMock.mock.calls[0][0]).toBe(path)
    expect(initOf(0).method).toBe(method)
    expect(state.muted).toBe(method === 'PUT')
  })

  it.each([
    ['muteThread', 'PUT', true],
    ['unmuteThread', 'DELETE', false],
  ] as const)('%s sends %s with no body', async (fn, method, muted) => {
    replies.push(json(200, { noteId: 'note:1', threadId: 'th_1', muted }))
    const state = await notificationsApi[fn]('note:1', 'th:1')
    expect(fetchMock.mock.calls[0][0]).toBe('/v1/notes/note%3A1/threads/th%3A1/mute')
    expect(initOf(0).method).toBe(method)
    expect(state).toEqual({ noteId: 'note:1', threadId: 'th_1', muted })
  })

  it('surfaces NOTE_NOT_FOUND when the note cannot be opened', async () => {
    replies.push(json(404, { code: 'NOTE_NOT_FOUND' }))
    await expect(notificationsApi.muteNote('gone')).rejects.toMatchObject({ code: 'NOTE_NOT_FOUND' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('notificationsApi.unsubscribe', () => {
  it('posts the token in the body', async () => {
    replies.push(json(200, { unsubscribed: true }))
    const result = await notificationsApi.unsubscribe('signed-token')
    expect(fetchMock.mock.calls[0][0]).toBe('/v1/email/unsubscribe')
    const init = initOf(0)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ token: 'signed-token' })
    expect(result).toEqual({ unsubscribed: true })
  })

  it('surfaces a bad or expired token without retrying', async () => {
    replies.push(json(400, { code: 'UNSUBSCRIBE_LINK_INVALID' }))
    await expect(notificationsApi.unsubscribe('stale')).rejects.toMatchObject({ code: 'UNSUBSCRIBE_LINK_INVALID' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
