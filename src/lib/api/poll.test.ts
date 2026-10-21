import { describe, expect, it, vi } from 'vitest'
import { poll } from './poll'

describe('poll', () => {
  it('backs off 1s → 5s and returns when done', async () => {
    const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {})
    let calls = 0
    const value = await poll(async () => ++calls, (count) => count === 7, { sleep, isHidden: () => false })
    expect(value).toBe(7)
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([1000, 1500, 2250, 3375, 5000, 5000])
  })

  it('stops with the abort reason', async () => {
    const controller = new AbortController()
    const read = vi.fn(async () => { controller.abort(new Error('unmounted')); return 1 })
    const sleep = vi.fn(async (_ms: number, signal?: AbortSignal) => { if (signal?.aborted) throw signal.reason })
    await expect(poll(read, () => false, { signal: controller.signal, sleep, isHidden: () => false })).rejects.toThrow('unmounted')
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('waits while the tab is hidden before reading', async () => {
    let hidden = true
    const order: string[] = []
    const waitUntilVisible = vi.fn(async () => { order.push('wait'); hidden = false })
    await poll(async () => { order.push('read'); return true }, Boolean, { isHidden: () => hidden, waitUntilVisible, sleep: async () => {} })
    expect(order).toEqual(['wait', 'read'])
  })
})
