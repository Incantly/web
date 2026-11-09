import { afterEach, describe, expect, it, vi } from 'vitest'
import { exportAfterVersion, recordExportVersion } from './exportVersion'

afterEach(() => { vi.useRealTimers() })

describe('exportAfterVersion', () => {
  it('attempts the flush before the export', async () => {
    const order: string[] = []
    const flush = vi.fn(async () => { order.push('flush'); return { status: 'saved', pending: 0, revisionNumber: 3 } })
    const result = await exportAfterVersion(flush, () => { order.push('export'); return 'done' })
    expect(order).toEqual(['flush', 'export'])
    expect(result).toBe('done')
  })

  it('still exports when the flush rejects', async () => {
    const run = vi.fn(() => 'done')
    await expect(exportAfterVersion(() => Promise.reject(new Error('offline')), run)).resolves.toBe('done')
    expect(run).toHaveBeenCalledOnce()
  })

  it('still exports when the flush throws synchronously', async () => {
    const run = vi.fn(() => 'done')
    await expect(exportAfterVersion(() => { throw new Error('boom') }, run)).resolves.toBe('done')
    expect(run).toHaveBeenCalledOnce()
  })

  it('still exports when the flush reports pending edits', async () => {
    const run = vi.fn(() => 'done')
    await exportAfterVersion(async () => ({ status: 'saving', pending: 1, revisionNumber: 2 }), run)
    expect(run).toHaveBeenCalledOnce()
  })

  it('exports after the timeout when the flush never settles', async () => {
    vi.useFakeTimers()
    const run = vi.fn(() => 'done')
    const flush = vi.fn(() => new Promise<never>(() => undefined))
    const pending = exportAfterVersion(flush, run, 3000)
    await vi.advanceTimersByTimeAsync(2999)
    expect(flush).toHaveBeenCalledOnce()
    expect(run).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await expect(pending).resolves.toBe('done')
    expect(run).toHaveBeenCalledOnce()
  })

  it('exports right away without a flush (legacy notes)', async () => {
    const run = vi.fn(() => 'done')
    await expect(exportAfterVersion(undefined, run)).resolves.toBe('done')
    await expect(recordExportVersion(undefined)).resolves.toBeUndefined()
  })
})
