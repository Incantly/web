import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { configureApiClient } from './client'
import { sharingApi } from './sharing'

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

describe('sharingApi.collaborators', () => {
  it('lists the owner, grants and invitations', async () => {
    replies.push(json(200, { owner: { id: 'u1' }, grants: [], invitations: [] }))
    const collaborators = await sharingApi.collaborators('note:1')
    expect(fetchMock.mock.calls[0][0]).toBe('/v1/notes/note%3A1/grants')
    expect(collaborators.owner).toEqual({ id: 'u1' })
  })

  it('treats NOTE_NOT_FOUND as no access without retrying', async () => {
    replies.push(json(404, { code: 'NOTE_NOT_FOUND' }))
    await expect(sharingApi.collaborators('note:gone')).rejects.toMatchObject({ code: 'NOTE_NOT_FOUND' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('sharingApi.share', () => {
  it('posts the email and uppercase role with one idempotency key', async () => {
    replies.push(json(201, { type: 'grant', grant: { id: 'g1' } }))
    const result = await sharingApi.share('note:1', { email: 'ada@example.com', role: 'EDITOR' }, 'key-1')
    expect(fetchMock.mock.calls[0][0]).toBe('/v1/notes/note%3A1/grants')
    const init = initOf(0)
    expect(init.method).toBe('POST')
    expect(init.headers.get('Idempotency-Key')).toBe('key-1')
    expect(JSON.parse(init.body as string)).toEqual({ email: 'ada@example.com', role: 'EDITOR' })
    expect(result).toEqual({ type: 'grant', grant: { id: 'g1' } })
  })

  it('surfaces an invitation result unchanged', async () => {
    replies.push(json(201, { type: 'invitation', invitation: { id: 'i1', email: 'new@example.com' } }))
    const result = await sharingApi.share('note:1', { email: 'new@example.com', role: 'VIEWER' }, 'key-2')
    expect(result).toEqual({ type: 'invitation', invitation: { id: 'i1', email: 'new@example.com' } })
  })

  it('routes limit and target errors to the caller without retrying', async () => {
    replies.push(json(403, { code: 'COLLABORATOR_LIMIT_REACHED' }))
    await expect(sharingApi.share('note:1', { email: 'b@example.com', role: 'VIEWER' }, 'key-3')).rejects.toMatchObject({ code: 'COLLABORATOR_LIMIT_REACHED' })
    replies.push(json(422, { code: 'SHARE_TARGET_INVALID' }))
    await expect(sharingApi.share('note:1', { email: 'me@example.com', role: 'VIEWER' }, 'key-4')).rejects.toMatchObject({ code: 'SHARE_TARGET_INVALID' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('sharingApi.changeRole', () => {
  it('patches the grant role', async () => {
    replies.push(json(200, { grant: { id: 'g1', role: 'VIEWER' } }))
    const result = await sharingApi.changeRole('note:1', 'grant:1', { role: 'VIEWER' })
    expect(fetchMock.mock.calls[0][0]).toBe('/v1/notes/note%3A1/grants/grant%3A1')
    const init = initOf(0)
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body as string)).toEqual({ role: 'VIEWER' })
    expect(result.grant.role).toBe('VIEWER')
  })
})

describe('sharingApi.revokeGrant', () => {
  it('deletes the grant and surfaces a leave', async () => {
    replies.push(json(200, { left: true }))
    const result = await sharingApi.revokeGrant('note:1', 'grant:mine')
    expect(fetchMock.mock.calls[0][0]).toBe('/v1/notes/note%3A1/grants/grant%3Amine')
    expect(initOf(0).method).toBe('DELETE')
    expect(result).toEqual({ left: true })
  })
})

describe('sharingApi.revokeInvitation', () => {
  it('deletes the invitation with no body', async () => {
    replies.push(new Response(null, { status: 204 }))
    await sharingApi.revokeInvitation('note:1', 'inv:1')
    expect(fetchMock.mock.calls[0][0]).toBe('/v1/notes/note%3A1/invitations/inv%3A1')
    expect(initOf(0).method).toBe('DELETE')
  })
})

describe('sharingApi.myInvitations', () => {
  it('lists my pending invitations', async () => {
    replies.push(json(200, { items: [{ id: 'i1' }] }))
    const items = await sharingApi.myInvitations()
    expect(fetchMock.mock.calls[0][0]).toBe('/v1/note-invitations')
    expect(items).toEqual([{ id: 'i1' }])
  })
})

describe('sharingApi.acceptInvitation', () => {
  it('accepts with POST and an empty body', async () => {
    replies.push(json(200, { grant: { id: 'g9' } }))
    const result = await sharingApi.acceptInvitation('inv:1')
    expect(fetchMock.mock.calls[0][0]).toBe('/v1/note-invitations/inv%3A1/accept')
    const init = initOf(0)
    expect(init.method).toBe('POST')
    expect(init.body).toBeUndefined()
    expect(result).toEqual({ grant: { id: 'g9' } })
  })

  it('keeps email-mismatch and invalid distinct without retrying', async () => {
    replies.push(json(403, { code: 'INVITATION_EMAIL_MISMATCH' }))
    await expect(sharingApi.acceptInvitation('inv:2')).rejects.toMatchObject({ code: 'INVITATION_EMAIL_MISMATCH' })
    replies.push(json(404, { code: 'INVITATION_INVALID' }))
    await expect(sharingApi.acceptInvitation('inv:3')).rejects.toMatchObject({ code: 'INVITATION_INVALID' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('sharingApi.createShareLink', () => {
  it('posts the default body and returns the once-only token', async () => {
    replies.push(json(201, { id: 'l1', token: 'tok-abc', capability: 'VIEW', expiresAt: '2027-01-01T00:00:00.000Z' }))
    const link = await sharingApi.createShareLink('note:1')
    expect(fetchMock.mock.calls[0][0]).toBe('/v1/notes/note%3A1/share-links')
    const init = initOf(0)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({})
    expect(link.token).toBe('tok-abc')
  })

  it('passes an explicit expiry through', async () => {
    replies.push(json(201, { id: 'l2', token: 'tok-def', capability: 'VIEW', expiresAt: '2026-12-01T00:00:00.000Z' }))
    await sharingApi.createShareLink('note:1', { expiresAt: '2026-12-01T00:00:00.000Z' })
    expect(JSON.parse(initOf(0).body as string)).toEqual({ expiresAt: '2026-12-01T00:00:00.000Z' })
  })
})

describe('sharingApi.revokeShareLink', () => {
  it('deletes the link', async () => {
    replies.push(new Response(null, { status: 204 }))
    await sharingApi.revokeShareLink('note:1', 'link:1')
    expect(fetchMock.mock.calls[0][0]).toBe('/v1/notes/note%3A1/share-links/link%3A1')
    expect(initOf(0).method).toBe('DELETE')
  })
})

describe('sharingApi.sharedCheckpoint', () => {
  it('reads the public checkpoint for the token', async () => {
    replies.push(json(200, { note: { title: 'Shared' }, revision: {}, document: {} }))
    const checkpoint = await sharingApi.sharedCheckpoint('tok-abc')
    expect(fetchMock.mock.calls[0][0]).toBe('/v1/shared/tok-abc')
    expect(checkpoint.note).toEqual({ title: 'Shared' })
  })

  it('encodes the token and treats an invalid link as final', async () => {
    replies.push(json(404, { code: 'SHARE_LINK_INVALID' }))
    await expect(sharingApi.sharedCheckpoint('tok/abc')).rejects.toMatchObject({ code: 'SHARE_LINK_INVALID' })
    expect(fetchMock.mock.calls[0][0]).toBe('/v1/shared/tok%2Fabc')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
