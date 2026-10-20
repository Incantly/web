import { ApiError } from '../api/errors'
import { newIdempotencyKey } from '../api/idempotency'
import { assetsApi, type AssetContentType, type AssetDto, type CompletedPart, type UploadPartInstruction, type UploadReservation } from '../api/assets'

/** The backend limit (ReserveUploadDto.byteLength). The server still decides; this only gives a friendlier error first. */
export const MAX_ASSET_BYTES = 250 * 1024 * 1024
/** Files above this upload in parts. Single uploads also send a SHA-256 so storage rejects different bytes. */
export const SINGLE_UPLOAD_MAX_BYTES = 16 * 1024 * 1024

/** From the ReserveUploadDto `contentType` enum. */
export const ASSET_CONTENT_TYPES: readonly AssetContentType[] = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf',
  'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav',
  'text/plain', 'text/markdown', 'text/vtt', 'application/x-subrip',
]

const aliases: Record<string, AssetContentType> = {
  'image/jpg': 'image/jpeg', 'image/pjpeg': 'image/jpeg',
  'audio/mp3': 'audio/mpeg', 'audio/x-mp3': 'audio/mpeg', 'audio/x-m4a': 'audio/mp4', 'audio/m4a': 'audio/mp4',
  'audio/x-wav': 'audio/wav', 'audio/wave': 'audio/wav', 'audio/vnd.wave': 'audio/wav', 'audio/opus': 'audio/ogg',
  'text/x-markdown': 'text/markdown', 'application/x-srt': 'application/x-subrip', 'text/srt': 'application/x-subrip',
}

const byExtension: Record<string, AssetContentType> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', pdf: 'application/pdf',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', wav: 'audio/wav',
  txt: 'text/plain', md: 'text/markdown', markdown: 'text/markdown', vtt: 'text/vtt', srt: 'application/x-subrip',
}

/** The allowlisted type for a file, or null. Browsers often leave `type` empty for Markdown and caption files. */
export function assetContentType(file: { name: string; type: string }): AssetContentType | null {
  const type = file.type.toLowerCase().split(';')[0].trim()
  if ((ASSET_CONTENT_TYPES as readonly string[]).includes(type)) return type as AssetContentType
  if (aliases[type]) return aliases[type]
  if (type && type !== 'application/octet-stream') return null
  const extension = file.name.toLowerCase().split('.').pop() ?? ''
  return byExtension[extension] ?? null
}

export type UploadErrorCode = 'TYPE_NOT_ALLOWED' | 'TOO_LARGE' | 'EMPTY' | 'CANCELLED' | 'STORAGE_FAILED' | 'MISSING_ETAG'

export class UploadError extends Error {
  constructor(readonly code: UploadErrorCode) {
    super(code)
    this.name = 'UploadError'
  }
}

const uploadMessages: Record<UploadErrorCode, string> = {
  TYPE_NOT_ALLOWED: 'This file type isn’t supported. Use an image, PDF, audio, text, Markdown or caption file.',
  TOO_LARGE: 'This file is larger than 250 MB.',
  EMPTY: 'This file is empty.',
  CANCELLED: 'Upload cancelled.',
  STORAGE_FAILED: 'The upload didn’t finish. Check your connection and try again.',
  MISSING_ETAG: 'The upload didn’t finish. Please try again.',
}

export function uploadErrorMessage(error: unknown): string | null {
  return error instanceof UploadError ? uploadMessages[error.code] : null
}

/** Client-side checks for friendly errors before reserving. */
export function checkUploadable(file: { name: string; type: string; size: number }): { ok: true; contentType: AssetContentType } | { ok: false; error: UploadError } {
  const contentType = assetContentType(file)
  if (!contentType) return { ok: false, error: new UploadError('TYPE_NOT_ALLOWED') }
  if (file.size <= 0) return { ok: false, error: new UploadError('EMPTY') }
  if (file.size > MAX_ASSET_BYTES) return { ok: false, error: new UploadError('TOO_LARGE') }
  return { ok: true, contentType }
}

/** Storage answered with an HTTP status (403 usually means the signed URL expired). */
export class StorageResponseError extends Error {
  constructor(readonly status: number) {
    super(`STORAGE_${status}`)
  }
}

export interface PartTransport {
  /** PUTs one byte range to a presigned URL and resolves with the provider ETag, if exposed. */
  put(part: UploadPartInstruction, body: Blob, onProgress: (loaded: number) => void, signal: AbortSignal): Promise<string | null>
}

/** Headers browsers refuse to set; the browser sends the right values itself. */
const forbiddenHeaders = new Set(['content-length', 'host', 'connection'])

/**
 * Direct-to-storage PUT with upload progress. No cookies or authorization headers:
 * exactly the returned headers are sent. The URL is never logged.
 */
export const xhrTransport: PartTransport = {
  put(part, body, onProgress, signal) {
    return new Promise((resolve, reject) => {
      if (signal.aborted) return reject(new UploadError('CANCELLED'))
      const request = new XMLHttpRequest()
      request.open(part.method, part.url)
      request.withCredentials = false
      for (const [name, value] of Object.entries(part.headers ?? {})) {
        if (!forbiddenHeaders.has(name.toLowerCase())) request.setRequestHeader(name, value)
      }
      const onAbort = () => request.abort()
      signal.addEventListener('abort', onAbort, { once: true })
      const done = () => signal.removeEventListener('abort', onAbort)
      request.upload.onprogress = (event) => onProgress(event.loaded)
      request.onload = () => {
        done()
        if (request.status >= 200 && request.status < 300) resolve(request.getResponseHeader('ETag'))
        else reject(new StorageResponseError(request.status))
      }
      request.onerror = () => { done(); reject(new StorageResponseError(0)) }
      request.onabort = () => { done(); reject(new UploadError('CANCELLED')) }
      request.send(body)
    })
  },
}

export type AssetsUploadApi = Pick<typeof assetsApi, 'reserve' | 'complete' | 'abort'>

export interface UploadOptions {
  signal?: AbortSignal
  onProgress?: (progress: { loaded: number; total: number }) => void
  /** Called with each reservation so a caller can abort it after a reload. */
  onReserved?: (reservation: UploadReservation) => void
  api?: AssetsUploadApi
  transport?: PartTransport
  newKey?: () => string
  concurrency?: number
  partAttempts?: number
  sleep?: (ms: number) => Promise<void>
}

async function sha256(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return `sha256:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

/** A reservation that can no longer be used: reserve again with a new key. */
const isExpired = (error: unknown) =>
  (error instanceof ApiError && error.code === 'UPLOAD_EXPIRED') || (error instanceof StorageResponseError && error.status === 403)

const isTransientStorageError = (error: unknown) =>
  error instanceof StorageResponseError && (error.status === 0 || error.status === 408 || error.status === 429 || error.status >= 500)

/**
 * Reserve → PUT parts directly to storage (3 at a time, ETags kept) → complete.
 * An expired reservation is aborted and reserved again once with a new key. Cancelling aborts the
 * in-flight requests and the reservation. Resolves only with a READY asset.
 */
export async function uploadAsset(file: Blob & { name: string }, options: UploadOptions = {}): Promise<AssetDto> {
  const { signal, api = assetsApi, transport = xhrTransport, newKey = newIdempotencyKey, concurrency = 3, partAttempts = 3 } = options
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const check = checkUploadable(file)
  if (!check.ok) throw check.error
  const checksumSha256 = file.size <= SINGLE_UPLOAD_MAX_BYTES ? await sha256(file) : undefined
  const throwIfCancelled = () => { if (signal?.aborted) throw new UploadError('CANCELLED') }

  for (let reservationAttempt = 0; ; reservationAttempt++) {
    throwIfCancelled()
    const reservation = await api.reserve({ filename: file.name.slice(0, 255) || undefined, contentType: check.contentType, byteLength: file.size, ...(checksumSha256 ? { checksumSha256 } : {}) }, newKey(), signal)
    options.onReserved?.(reservation)
    const controller = new AbortController()
    const forward = () => controller.abort()
    signal?.addEventListener('abort', forward, { once: true })
    try {
      const parts = await sendParts(file, reservation, { transport, signal: controller.signal, abort: forward, concurrency, partAttempts, sleep, onProgress: options.onProgress })
      throwIfCancelled()
      const asset = await api.complete(reservation.uploadId, reservation.mode === 'multipart' ? parts : null, signal)
      if (asset.state !== 'ready') throw new ApiError(422, 'UPLOAD_VERIFICATION_FAILED', null, null)
      return asset
    } catch (error) {
      controller.abort()
      const verificationFailed = error instanceof ApiError && error.code === 'UPLOAD_VERIFICATION_FAILED'
      // A verified failure leaves a quarantined asset (not a pending upload); anything else frees the reservation.
      if (!verificationFailed) void api.abort(reservation.uploadId).catch(() => {})
      if (signal?.aborted) throw new UploadError('CANCELLED')
      if (isExpired(error) && reservationAttempt === 0) continue
      if (error instanceof StorageResponseError) throw new UploadError('STORAGE_FAILED')
      throw error
    } finally {
      signal?.removeEventListener('abort', forward)
    }
  }
}

async function sendParts(file: Blob, reservation: UploadReservation, context: {
  transport: PartTransport; signal: AbortSignal; abort: () => void; concurrency: number; partAttempts: number
  sleep: (ms: number) => Promise<void>; onProgress?: UploadOptions['onProgress']
}): Promise<CompletedPart[]> {
  const multipart = reservation.mode === 'multipart'
  const partSize = reservation.partSize ?? file.size
  const loaded = new Map<number, number>()
  const report = () => context.onProgress?.({ loaded: Math.min(file.size, [...loaded.values()].reduce((sum, value) => sum + value, 0)), total: file.size })
  const queue = reservation.parts.map((part, index) => ({ part, number: part.partNumber ?? index + 1 }))
  const done: CompletedPart[] = []

  const sendOne = async ({ part, number }: (typeof queue)[number]) => {
    const body = multipart ? file.slice((number - 1) * partSize, Math.min(number * partSize, file.size)) : file
    for (let attempt = 0; ; attempt++) {
      try {
        const etag = await context.transport.put(part, body, (value) => { loaded.set(number, value); report() }, context.signal)
        loaded.set(number, body.size); report()
        if (multipart) {
          if (!etag) throw new UploadError('MISSING_ETAG')
          done.push({ partNumber: number, entityTag: etag })
        }
        return
      } catch (error) {
        loaded.set(number, 0); report()
        if (context.signal.aborted || !isTransientStorageError(error) || attempt + 1 >= context.partAttempts) throw error
        await context.sleep(500 * 2 ** attempt)
      }
    }
  }

  let failure: unknown = null
  const worker = async () => {
    while (queue.length && !failure) {
      const next = queue.shift()!
      // The first failure stops the other parts too.
      try { await sendOne(next) } catch (error) { failure ??= error; context.abort() }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(context.concurrency, queue.length)) }, worker))
  if (failure) throw failure
  return done.sort((left, right) => left.partNumber - right.partNumber)
}
