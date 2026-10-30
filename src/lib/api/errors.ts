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
  UNTRUSTED_PROXY: 'This request was blocked for security. Reload the page and try again.',
  WAITLIST_UNAVAILABLE: 'We couldn’t add you just now. Please try again in a few minutes.',
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
  SPACE_DELETED: 'This Space was deleted.',
  SPACE_NAME_REQUIRED: 'Give your Space a name.',
  SPACE_SOURCE_LIMIT_REACHED: 'This Space already has the maximum of 200 linked sources. Unlink one first.',
  SPACE_SOURCE_NOT_FOUND: 'That source isn’t linked to this Space any more.',
  NOTE_NOT_IN_SPACE: 'That note isn’t in this Space any more.',
  INVALID_HOME_NOTE: 'Only an active note in this Space can be its home note.',

  SOURCE_NOT_FOUND: 'This source no longer exists or you don’t have access to it.',
  SOURCE_NOT_READY: 'This source is still processing. Try again when it’s ready.',
  TRANSCRIPTION_CONSENT_REQUIRED: 'Confirm you have permission to transcribe this audio.',
  YOUTUBE_VIDEO_REQUIRED: 'Add the YouTube video link for these captions.',
  REMOTE_IMPORT_UNAVAILABLE: 'Web pages aren’t available here yet.',
  NOTHING_TO_RETRY: 'There’s nothing to retry. This source didn’t fail.',
  NOT_CANCELLABLE: 'This source has already finished processing.',
  SOURCE_RETENTION_HOLD: 'This source is under a retention hold and can’t be deleted right now.',
  SOURCE_DELETED: 'This source was deleted.',
  SOURCE_TEXT_TOO_LARGE: 'Pasted text can be up to 512 KB.',
  SOURCE_TEXT_REQUIRED: 'Paste some text to add.',
  SOURCE_ASSET_TYPE_MISMATCH: 'This file type can’t be added as that kind of source.',
  SOURCE_ASSET_UNAVAILABLE: 'That file isn’t ready yet. Try again in a moment.',
  INVALID_SOURCE_URL: 'Enter a valid https:// web address.',
  SOURCE_URL_BLOCKED: 'That web address can’t be added.',
  NOTE_REVISION_NOT_FOUND: 'That note has no saved version yet. Write something first.',
  SOURCE_PROCESSING_BUSY: 'This source is busy. Try again in a moment.',
  SOURCE_INGESTION_BUSY: 'This source is busy. Try again in a moment.',
  PINNED_SOURCE_VERSION_INVALID: 'That version isn’t ready to pin. Choose a ready version.',
  PINNED_SOURCE_VERSION_REQUIRED: 'Choose a ready version to keep.',
  PINNED_SOURCE_VERSION_NOT_ALLOWED: 'A source that follows the latest version can’t also keep one.',
  NOTE_CONTEXT_BINDING_LIMIT_REACHED: 'This note already has the maximum of 50 sources. Remove one first.',
  NOTE_CONTEXT_BINDING_NOT_FOUND: 'That source isn’t attached to this note any more.',

  ASSET_IN_USE: 'This file is still used in a note or the Library.',
  UPLOAD_EXPIRED: 'The upload took too long. Please try again.',
  UPLOAD_VERIFICATION_FAILED: 'This file could not be verified.',

  INVALID_IMPORT_URL: 'Enter a valid https:// web address.',
  IMPORT_URL_BLOCKED: 'That web address can’t be imported.',
  IMPORT_NOT_CANCELLABLE: 'This import has already started and can’t be cancelled.',
  IMPORT_NOT_FOUND: 'This import no longer exists.',
  IMPORT_TYPE_NOT_SUPPORTED: 'Only plain text (.txt) and Markdown (.md) files can be imported as a note.',
  IMPORT_TOO_LARGE: 'Files imported as a note can be up to 10 MB.',
  IMPORT_OBJECT_TOO_LARGE: 'Files imported as a note can be up to 10 MB.',
  IMPORT_CONTENT_LIMIT: 'This file has more content than a note can hold. Split it and import the parts.',
  IMPORT_SOURCE_MISSING: 'The uploaded file is no longer available. Upload it again.',
  IMPORT_OBJECT_REPOSITORY: 'The uploaded file couldn’t be read. Try again shortly.',
  IMPORT_PROCESSING_FAILED: 'The file couldn’t be turned into a note. Check it’s UTF-8 text and try again.',
  ASSET_NOT_FOUND: 'The uploaded file is no longer available. Upload it again.',

  SELECTION_NODE_NOT_FOUND: 'Part of your selection changed. Select the text again.',
  CONTEXT_SCOPE_INVALID: 'Choose what to search first.',
  CONTEXT_SCOPE_TOO_LARGE: 'That’s too much to search at once. Narrow it down.',
  CONTEXT_QUERY_INVALID: 'Type what you’re looking for (up to 1,000 characters).',
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
