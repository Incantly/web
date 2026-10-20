/**
 * Errors from `/v1/*`. Program logic branches on `code` only; never on messages.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly requestId: string | null,
    readonly retryAfterSeconds: number | null,
    /** Parsed error body for code-specific details. Never log it: it may echo user content. */
    readonly body: unknown = null,
  ) {
    super(code)
    this.name = 'ApiError'
  }
}

export const NETWORK_ERROR = 'NETWORK_ERROR'

export function isApiError(value: unknown, code?: string): value is ApiError {
  return value instanceof ApiError && (code === undefined || value.code === code)
}

/** Friendly copy keyed by the backend's stable codes (frontend-api-integration.md). */
const messages: Record<string, string> = {
  [NETWORK_ERROR]: 'We can’t reach Incantly right now. Check your connection and try again.',
  SESSION_REQUIRED: 'Your session has ended. Please sign in again.',
  RATE_LIMITED: 'Too many requests. Please wait a moment and try again.',
  UNTRUSTED_ORIGIN: 'This request was blocked for security. Reload the page and try again.',
  INVALID_RESOURCE_ID: 'That link doesn’t look right.',
  INVALID_CURSOR: 'The list changed while loading. Refresh to continue.',
  INVALID_IDEMPOTENCY_KEY: 'Something went wrong sending that request. Please try again.',
  IDEMPOTENCY_KEY_REUSED: 'Something went wrong sending that request. Reload and try again.',

  NOTE_NOT_FOUND: 'This note no longer exists or you don’t have access to it.',
  STALE_NOTE_REVISION: 'This note changed somewhere else. We’ve loaded the latest version.',
  NOTE_TRANSACTION_CONFLICT: 'This note changed somewhere else. Your edit is being merged.',
  NOTE_TRANSACTION_RETRYABLE: 'Saving is taking longer than usual. We’ll keep trying.',
  INVALID_NOTE_TRANSACTION: 'An edit couldn’t be saved. Copy any important text and reload the note.',

  SPACE_NOT_FOUND: 'This Space no longer exists or you don’t have access to it.',
  SPACE_NOT_ACTIVE: 'This Space is archived. Restore it to make changes.',
  SPACE_RETENTION_HOLD: 'This Space is under a retention hold and can’t be deleted right now.',

  SOURCE_NOT_FOUND: 'This source no longer exists or you don’t have access to it.',
  SOURCE_NOT_READY: 'This source is still processing. Try again when it’s ready.',
  TRANSCRIPTION_CONSENT_REQUIRED: 'Confirm you have permission to transcribe this audio.',
  YOUTUBE_VIDEO_REQUIRED: 'Add the YouTube video link for these captions.',
  REMOTE_IMPORT_UNAVAILABLE: 'Adding from a web address isn’t available here yet.',
  NOTHING_TO_RETRY: 'There’s nothing to retry. This source didn’t fail.',
  NOT_CANCELLABLE: 'This source has already finished processing.',
  PINNED_SOURCE_VERSION_INVALID: 'That version isn’t ready to pin. Choose a ready version.',

  ASSET_IN_USE: 'This file is still used in a note or the Library.',
  UPLOAD_EXPIRED: 'The upload took too long. Please try again.',
  UPLOAD_VERIFICATION_FAILED: 'This file could not be verified.',

  INVALID_IMPORT_URL: 'Enter a valid https:// web address.',
  IMPORT_URL_BLOCKED: 'That web address can’t be imported.',
  IMPORT_NOT_CANCELLABLE: 'This import has already started and can’t be cancelled.',
}

export function apiErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const known = messages[error.code]
    if (known) return known
    if (error.status === 429) return messages.RATE_LIMITED
    if (error.status === 401) return messages.SESSION_REQUIRED
    if (error.status === 404) return 'We couldn’t find that. It may have been deleted.'
    if (error.status >= 500) return 'Something went wrong on our side. Please try again shortly.'
  }
  return 'Something went wrong. Please try again.'
}
