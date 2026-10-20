import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/errors'
import { MemoryPendingCommandStore } from '../api/idempotency'
import { ServerAssetHost, abortAbandonedUploads, type AssetPreviewCache } from './serverAssetHost'

class MemoryPreviews implements AssetPreviewCache {
  items = new Map<string, { blob: Blob; filename: string | null }>()
  async get(key: string) { return this.items.get(key) }
  async put(key: string, value: { blob: Blob; filename: string | null }) { this.items.set(key, value) }
}

const ready = (id: string, contentType: string) => ({ id, state: 'ready' as const, filename: 'a', contentType, byteLength: 3, checksumSha256: null, readyAt: '2030-01-01T00:00:00Z' })

function setup() {
  let clock = 1_000_000
  let counter = 0
  const api = {
    reserve: vi.fn(), complete: vi.fn(), abort: vi.fn(async () => {}), remove: vi.fn(async () => {}),
    download: vi.fn(async () => ({ url: `https://storage.test/a?sig=${++counter}`, expiresAt: new Date(clock + 5 * 60_000).toISOString() })),
  }
  const previews = new MemoryPreviews()
  const pending = new MemoryPendingCommandStore()
  const upload = vi.fn(async (_file: unknown, options: { onReserved?: (reservation: never) => void }) => {
    options.onReserved?.({ uploadId: 'up1', expiresAt: new Date(clock + 15 * 60_000).toISOString() } as never)
    expect((await pending.list('u1', 'asset-upload')).length).toBe(1)
    return ready('asset:img', 'image/png')
  })
  const host = new ServerAssetHost({ userId: 'u1', api, previews, pending, upload: upload as never, now: () => clock })
  return { host, api, previews, pending, upload, advance: (ms: number) => { clock += ms } }
}

describe('ServerAssetHost', () => {
  it('reuses a download URL until shortly before it expires, then asks again', async () => {
    const { host, api, advance } = setup()
    const first = await host.resolveUrl('asset:pdf')
    expect(await host.resolveUrl('asset:pdf')).toBe(first)
    advance(4 * 60_000 + 40_000)
    const second = await host.resolveUrl('asset:pdf')
    expect(second).not.toBe(first)
    expect(api.download).toHaveBeenCalledTimes(2)
  })

  it('refresh skips the cached URL (after a media error)', async () => {
    const { host, api } = setup()
    await host.resolveUrl('asset:pdf')
    await host.resolveUrl('asset:pdf', { refresh: true })
    expect(api.download).toHaveBeenCalledTimes(2)
  })

  it('keeps an offline preview of uploaded images, scoped to the user, and clears the pending record', async () => {
    const { host, previews, pending, api } = setup()
    globalThis.URL.createObjectURL ??= () => 'blob:preview'
    const record = await host.upload(new File([new Uint8Array(3)], 'a.png', { type: 'image/png' }), { signal: new AbortController().signal, onProgress: () => {} })
    expect(record).toMatchObject({ id: 'asset:img', mimeType: 'image/png', storageKey: 'asset:img' })
    expect(previews.items.has('u1:asset:img')).toBe(true)
    expect(await pending.list('u1', 'asset-upload')).toEqual([])
    expect(await host.resolveUrl('asset:img')).toMatch(/^blob:/)
    expect(api.download).not.toHaveBeenCalled()
    expect(host.assetName('asset:img')).toBe('a')
    // A broken preview (media error) falls back to the server copy.
    expect(await host.resolveUrl('asset:img', { refresh: true })).toMatch(/^https:\/\/storage\.test/)
  })

  it('maps upload and API errors to friendly copy', () => {
    const { host } = setup()
    expect(host.describeError(new ApiError(422, 'UPLOAD_VERIFICATION_FAILED', null, null))).toBe('This file could not be verified.')
    expect(host.describeError(new ApiError(409, 'ASSET_IN_USE', null, null))).toBe('This file is still used in a note or the Library.')
  })
})

describe('abortAbandonedUploads', () => {
  it('aborts unexpired reservations left behind and forgets expired ones', async () => {
    const pending = new MemoryPendingCommandStore()
    const now = 1_000_000
    const api = { abort: vi.fn(async () => {}) }
    await pending.put({ id: 'asset-upload:a', userId: 'u1', kind: 'asset-upload', idempotencyKey: 'k', payload: { uploadId: 'a', expiresAt: new Date(now + 60_000).toISOString() }, createdAt: now })
    await pending.put({ id: 'asset-upload:b', userId: 'u1', kind: 'asset-upload', idempotencyKey: 'k', payload: { uploadId: 'b', expiresAt: new Date(now - 60_000).toISOString() }, createdAt: now })
    await abortAbandonedUploads('u1', { api, pending, now: () => now })
    // Without Web Locks (this test runtime) only expired reservations count as abandoned.
    if (!navigator.locks) {
      expect(api.abort).not.toHaveBeenCalled()
      expect((await pending.list('u1')).map((item) => item.id)).toEqual(['asset-upload:a'])
    } else {
      expect(api.abort).toHaveBeenCalledWith('a')
      expect(await pending.list('u1')).toEqual([])
    }
  })
})
