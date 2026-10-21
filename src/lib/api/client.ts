import { ApiError, NETWORK_ERROR } from './errors'
import { recordDiagnostic } from './diagnostics'

export type ApiResponse<T> = { status: number; data: T; requestId: string | null }

export type ApiFetchInit = Omit<RequestInit, 'body' | 'credentials'> & {
  /** Serialized as JSON. */
  body?: unknown
  /** Required by create, upload-reservation and import commands. Reused unchanged on every retry. */
  idempotencyKey?: string
  /** Total attempts including the first (default 5). */
  maxAttempts?: number
}

const DEFAULT_MAX_ATTEMPTS = 5
const MAX_BACKOFF_MS = 8_000
/** 503 codes the backend documents as safe to retry with the identical request. */
const RETRYABLE_503 = new Set(['NOTE_TRANSACTION_RETRYABLE', 'DEPENDENCY_UNAVAILABLE', 'SERVICE_DRAINING'])
const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD', 'PUT', 'DELETE', 'OPTIONS'])

type Hooks = {
  /** Called once per 401. Stops background work and routes to sign-in. */
  onUnauthorized: (error: ApiError) => void
  sleep: (ms: number, signal?: AbortSignal | null) => Promise<void>
  fetch: typeof fetch
}

function defaultUnauthorized() {
  if (typeof window === 'undefined') return
  const next = window.location.pathname + window.location.search
  window.location.assign(new URL(`/auth?next=${encodeURIComponent(next)}`, window.location.origin).href)
}

export function abortableSleep(ms: number, signal?: AbortSignal | null) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason)
    const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve() }, ms)
    const onAbort = () => { clearTimeout(timer); reject(signal?.reason) }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

const hooks: Hooks = { onUnauthorized: defaultUnauthorized, sleep: abortableSleep, fetch: (...args) => globalThis.fetch(...args) }
let unauthorizedNotified = false

/** Test and provider seam. Returns a function that restores the previous hooks. */
export function configureApiClient(next: Partial<Hooks>) {
  const previous = { ...hooks }
  Object.assign(hooks, next)
  unauthorizedNotified = false
  return () => { Object.assign(hooks, previous); unauthorizedNotified = false }
}

function parseRetryAfter(value: string | null) {
  if (!value) return null
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return seconds
  const date = Date.parse(value)
  return Number.isFinite(date) ? Math.max(0, (date - Date.now()) / 1000) : null
}

function backoffMs(attempt: number) {
  const base = Math.min(MAX_BACKOFF_MS, 500 * 2 ** attempt)
  return base / 2 + Math.random() * (base / 2)
}

function isRetryable(error: ApiError) {
  if (error.status === 429) return true
  if (error.status === 503) return error.retryAfterSeconds !== null || RETRYABLE_503.has(error.code)
  return false
}

async function toApiError(response: Response): Promise<ApiError> {
  const body: unknown = await response.json().catch(() => null)
  const code = body && typeof body === 'object' && typeof (body as { code?: unknown }).code === 'string' ? (body as { code: string }).code : `HTTP_${response.status}`
  return new ApiError(response.status, code, response.headers.get('X-Request-Id'), parseRetryAfter(response.headers.get('Retry-After')), body)
}

/**
 * The single entry point for `/v1/*` calls (same-origin; the web server proxies to the backend).
 * - Retries 429 and retryable 503 after `Retry-After` (or backoff) with the identical request and key.
 * - Retries network failures only when the request is safe to repeat (idempotent method or key).
 * - Never retries 400/401/403/404/409/422; callers handle 409 by code.
 */
export async function apiFetch<T>(path: string, init: ApiFetchInit = {}): Promise<ApiResponse<T>> {
  if (!path.startsWith('/v1/')) throw new Error('apiFetch only calls /v1/* paths')
  const { body, idempotencyKey, maxAttempts = DEFAULT_MAX_ATTEMPTS, headers: initHeaders, ...rest } = init
  const method = (rest.method ?? 'GET').toUpperCase()
  const headers = new Headers(initHeaders)
  headers.set('Accept', 'application/json')
  if (body !== undefined) headers.set('Content-Type', 'application/json')
  if (idempotencyKey) headers.set('Idempotency-Key', idempotencyKey)
  const payload = body === undefined ? undefined : JSON.stringify(body)
  const canRepeat = IDEMPOTENT_METHODS.has(method) || Boolean(idempotencyKey)

  for (let attempt = 0; ; attempt++) {
    let response: Response
    try {
      response = await hooks.fetch(path, { ...rest, method, headers, body: payload, credentials: 'include' })
    } catch (cause) {
      if (rest.signal?.aborted) throw cause
      const error = new ApiError(0, NETWORK_ERROR, null, null)
      if (!canRepeat || attempt + 1 >= maxAttempts) {
        recordDiagnostic({ method, path, status: 0, code: NETWORK_ERROR, requestId: null })
        throw error
      }
      await hooks.sleep(backoffMs(attempt), rest.signal)
      continue
    }

    const requestId = response.headers.get('X-Request-Id')
    if (response.ok) {
      if (response.status === 204) return { status: 204, data: undefined as T, requestId }
      const data = (await response.json().catch(() => undefined)) as T
      return { status: response.status, data, requestId }
    }

    const error = await toApiError(response)
    recordDiagnostic({ method, path, status: error.status, code: error.code, requestId: error.requestId })
    if (error.status === 401) {
      if (!unauthorizedNotified) { unauthorizedNotified = true; hooks.onUnauthorized(error) }
      throw error
    }
    if (error.code === 'IDEMPOTENCY_KEY_REUSED') console.error('[api] Idempotency-Key reused with a different request', { path, requestId: error.requestId })
    if (!isRetryable(error) || attempt + 1 >= maxAttempts) throw error
    await hooks.sleep(error.retryAfterSeconds !== null ? error.retryAfterSeconds * 1000 : backoffMs(attempt), rest.signal)
  }
}
