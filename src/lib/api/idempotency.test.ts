import { describe, expect, it, vi } from 'vitest'
import { MemoryPendingCommandStore, idempotentAction, newIdempotencyKey } from './idempotency'

describe('idempotency', () => {
  it('creates keys within the backend 8–128 character range', () => {
    const key = newIdempotencyKey()
    expect(key.length).toBeGreaterThanOrEqual(8)
    expect(key.length).toBeLessThanOrEqual(128)
    expect(newIdempotencyKey()).not.toBe(key)
  })

  it('reuses one key for every retry of an action', async () => {
    const action = idempotentAction()
    const send = vi.fn(async (key: string) => key)
    await action.run(send)
    await action.run(send)
    expect(send.mock.calls[0][0]).toBe(action.key)
    expect(send.mock.calls[1][0]).toBe(action.key)
  })

  it('scopes pending commands per user', async () => {
    const store = new MemoryPendingCommandStore()
    await store.put({ id: 'a', userId: 'u1', kind: 'file-import', idempotencyKey: 'k1-aaaaaaaa', payload: {}, createdAt: 1 })
    await store.put({ id: 'b', userId: 'u2', kind: 'file-import', idempotencyKey: 'k2-aaaaaaaa', payload: {}, createdAt: 2 })
    expect((await store.list('u1')).map((item) => item.id)).toEqual(['a'])
    await store.remove('a')
    expect(await store.list('u1')).toEqual([])
  })
})
