import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/errors'
import type { UploadPartInstruction, UploadReservation } from '../api/assets'
import { StorageResponseError, UploadError, assetContentType, checkUploadable, uploadAsset, type PartTransport } from './upload'

const MiB = 1024 * 1024
const file = (size: number, name = 'notes.pdf', type = 'application/pdf') => Object.assign(new Blob([new Uint8Array(size)], { type }), { name })
const part = (partNumber?: number): UploadPartInstruction => ({ method: 'PUT', url: `https://storage.test/p${partNumber ?? 1}?sig=secret`, headers: { 'Content-Type': 'application/pdf' }, expiresAt: '2030-01-01T00:00:00Z', ...(partNumber ? { partNumber } : {}) })
const ready = { id: 'asset:1', state: 'ready', filename: 'notes.pdf', contentType: 'application/pdf', byteLength: 1, checksumSha256: null, readyAt: 'now' } as const

function single(uploadId = 'up1'): UploadReservation {
  return { assetId: 'asset:1', uploadId, mode: 'single', expiresAt: '2030-01-01T00:00:00Z', parts: [part()] }
}
function multipart(size: number, uploadId = 'up1'): UploadReservation {
  const partSize = 8 * MiB
  const count = Math.ceil(size / partSize)
  return { assetId: 'asset:1', uploadId, mode: 'multipart', partSize, partCount: count, expiresAt: '2030-01-01T00:00:00Z', parts: Array.from({ length: count }, (_, index) => part(index + 1)) }
}

function fakes(reservations: UploadReservation[]) {
  const api = {
    reserve: vi.fn<(body: unknown, key: string, signal?: AbortSignal) => Promise<UploadReservation>>(async () => reservations.shift()!),
    complete: vi.fn<(uploadId: string, parts: unknown, signal?: AbortSignal) => Promise<typeof ready>>(async () => ({ ...ready })),
    abort: vi.fn(async () => {}),
  }
  const sizes: number[] = []
  let active = 0
  let peak = 0
  const transport: PartTransport & { put: ReturnType<typeof vi.fn> } = {
    put: vi.fn(async (instruction: UploadPartInstruction, body: Blob, onProgress: (loaded: number) => void) => {
      active++; peak = Math.max(peak, active)
      sizes.push(body.size)
      await new Promise((resolve) => setTimeout(resolve, 1))
      onProgress(body.size / 2)
      active--
      return `"etag-${instruction.partNumber ?? 1}"`
    }),
  }
  let keys = 0
  return { api, transport, sizes, peak: () => peak, newKey: () => `key-${++keys}` }
}

describe('assetContentType', () => {
  it('uses the allowlist, known aliases, and the extension when the browser gives no type', () => {
    expect(assetContentType({ name: 'a.png', type: 'image/png' })).toBe('image/png')
    expect(assetContentType({ name: 'a.wav', type: 'audio/x-wav' })).toBe('audio/wav')
    expect(assetContentType({ name: 'Lecture.MD', type: '' })).toBe('text/markdown')
    expect(assetContentType({ name: 'subs.srt', type: 'application/octet-stream' })).toBe('application/x-subrip')
    expect(assetContentType({ name: 'clip.mp4', type: 'video/mp4' })).toBeNull()
    expect(assetContentType({ name: 'app.exe', type: '' })).toBeNull()
  })

  it('rejects empty and over-limit files before reserving', () => {
    expect(checkUploadable({ name: 'a.pdf', type: 'application/pdf', size: 0 })).toMatchObject({ ok: false, error: { code: 'EMPTY' } })
    expect(checkUploadable({ name: 'a.pdf', type: 'application/pdf', size: 250 * MiB + 1 })).toMatchObject({ ok: false, error: { code: 'TOO_LARGE' } })
    expect(checkUploadable({ name: 'a.pdf', type: 'application/pdf', size: 250 * MiB })).toMatchObject({ ok: true })
  })
})

describe('uploadAsset', () => {
  it('single upload: reserves with a checksum, PUTs the whole file, completes with {}', async () => {
    const { api, transport, newKey } = fakes([single()])
    const progress = vi.fn()
    const asset = await uploadAsset(file(MiB), { api, transport, newKey, onProgress: progress })
    expect(asset.state).toBe('ready')
    expect(api.reserve).toHaveBeenCalledWith(expect.objectContaining({ contentType: 'application/pdf', byteLength: MiB, checksumSha256: expect.stringMatching(/^sha256:[a-f0-9]{64}$/) }), 'key-1', undefined)
    expect(transport.put).toHaveBeenCalledTimes(1)
    expect(api.complete).toHaveBeenCalledWith('up1', null, undefined)
    expect(progress).toHaveBeenLastCalledWith({ loaded: MiB, total: MiB })
  })

  it('multipart: slices 8 MiB parts, at most 3 at a time, and completes with every ETag in order', async () => {
    const size = 100 * MiB
    const { api, transport, sizes, peak, newKey } = fakes([multipart(size)])
    await uploadAsset(file(size), { api, transport, newKey })
    expect(api.reserve.mock.calls[0][0]).not.toHaveProperty('checksumSha256')
    expect(sizes).toHaveLength(13)
    expect(sizes.reduce((sum, value) => sum + value, 0)).toBe(size)
    expect(peak()).toBeLessThanOrEqual(3)
    const parts = api.complete.mock.calls[0][1] as { partNumber: number; entityTag: string }[]
    expect(parts.map((item) => item.partNumber)).toEqual(Array.from({ length: 13 }, (_, index) => index + 1))
    expect(parts[0].entityTag).toBe('"etag-1"')
  })

  it('fails clearly when storage hides the multipart ETag', async () => {
    const { api, transport, newKey } = fakes([multipart(20 * MiB)])
    transport.put.mockResolvedValue(null)
    await expect(uploadAsset(file(20 * MiB), { api, transport, newKey })).rejects.toMatchObject({ code: 'MISSING_ETAG' })
    expect(api.abort).toHaveBeenCalledWith('up1')
  })

  it('retries a part after a transient storage error', async () => {
    const { api, transport, newKey } = fakes([single()])
    transport.put.mockRejectedValueOnce(new StorageResponseError(0))
    await uploadAsset(file(10), { api, transport, newKey, sleep: async () => {} })
    expect(transport.put).toHaveBeenCalledTimes(2)
  })

  it('on UPLOAD_EXPIRED aborts and reserves again with a new key', async () => {
    const { api, transport, newKey } = fakes([single('up1'), single('up2')])
    api.complete.mockRejectedValueOnce(new ApiError(409, 'UPLOAD_EXPIRED', null, null))
    const asset = await uploadAsset(file(10), { api, transport, newKey })
    expect(asset.state).toBe('ready')
    expect(api.abort).toHaveBeenCalledWith('up1')
    expect(api.reserve.mock.calls.map((call) => call[1])).toEqual(['key-1', 'key-2'])
    expect(api.complete).toHaveBeenLastCalledWith('up2', null, undefined)
  })

  it('treats a 403 from storage (expired signature) the same way', async () => {
    const { api, transport, newKey } = fakes([single('up1'), single('up2')])
    transport.put.mockRejectedValueOnce(new StorageResponseError(403))
    await uploadAsset(file(10), { api, transport, newKey })
    expect(api.reserve).toHaveBeenCalledTimes(2)
  })

  it('cancel aborts the in-flight part and the reservation', async () => {
    const { api, transport, newKey } = fakes([single()])
    const controller = new AbortController()
    transport.put.mockImplementationOnce((_part: UploadPartInstruction, _body: Blob, _progress: unknown, signal: AbortSignal) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(new UploadError('CANCELLED')))
      queueMicrotask(() => controller.abort())
    }))
    await expect(uploadAsset(file(10), { api, transport, newKey, signal: controller.signal })).rejects.toMatchObject({ code: 'CANCELLED' })
    expect(api.abort).toHaveBeenCalledWith('up1')
    expect(api.complete).not.toHaveBeenCalled()
  })

  it('surfaces verification failure without aborting (the asset is quarantined)', async () => {
    const { api, transport, newKey } = fakes([single()])
    api.complete.mockRejectedValueOnce(new ApiError(422, 'UPLOAD_VERIFICATION_FAILED', null, null))
    await expect(uploadAsset(file(10), { api, transport, newKey })).rejects.toMatchObject({ code: 'UPLOAD_VERIFICATION_FAILED' })
    expect(api.abort).not.toHaveBeenCalled()
  })

  it('never reserves an unsupported file', async () => {
    const { api, transport, newKey } = fakes([single()])
    await expect(uploadAsset(file(10, 'a.exe', ''), { api, transport, newKey })).rejects.toMatchObject({ code: 'TYPE_NOT_ALLOWED' })
    expect(api.reserve).not.toHaveBeenCalled()
  })
})
