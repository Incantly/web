import type { SourceDto, SourceProcessingDto } from '../../../lib/api/library'

export type ProcessingStage = NonNullable<SourceDto['versions'][number]['processingStage']>

const stages: Record<ProcessingStage, string> = {
  VALIDATING: 'Validating',
  QUEUED_FOR_PROCESSOR: 'Queued',
  FETCHING: 'Fetching',
  PARSING: 'Parsing',
  TRANSCRIBING: 'Transcribing',
  NORMALIZING: 'Normalizing',
  AWAITING_PROCESSOR: 'Added, not searchable',
}

export function stageLabel(stage: string | null | undefined) {
  return stage && stage in stages ? stages[stage as ProcessingStage] : null
}

const partialReasons: Record<string, string> = {
  PDF_PAGE_LIMIT: 'Only the first pages of this PDF were read; the rest is too long to process.',
  WEB_CONTENT_LIMIT: 'Only the first part of this page was kept; the rest was too long.',
  TRANSCRIPT_INCOMPLETE: 'Part of this recording couldn’t be transcribed.',
}

export function partialText(reason: string | null | undefined) {
  if (!reason) return 'Part of this source couldn’t be processed.'
  return partialReasons[reason] ?? 'Part of this source couldn’t be processed.'
}

/** Words for the stable `failureCode`s (frontend-api-integration.md, "Library Sources and versions"). */
const failures: Record<string, string> = {
  CANCELED_BY_USER: 'You cancelled processing.',
  PDF_NO_TEXT_LAYER: 'This looks like a scanned PDF with no text to read.',
  PDF_ENCRYPTED: 'This PDF is password-protected.',
  PDF_TOO_LARGE: 'This PDF is too large to process.',
  PDF_MALFORMED: 'This PDF is damaged and couldn’t be read.',
  PDF_UNREADABLE: 'This PDF couldn’t be read.',
  PDF_PARSE_TIMEOUT: 'This PDF took too long to read.',
  PDF_RESOURCE_LIMIT: 'This PDF is too complex to process.',
  AUDIO_TOO_LARGE: 'This recording is too large to transcribe.',
  AUDIO_NOT_SPLITTABLE: 'This long recording can’t be split for transcription. Try MP3 or WAV.',
  AUDIO_DURATION_LIMIT: 'This recording is longer than the transcription limit.',
  AUDIO_DURATION_UNKNOWN: 'We couldn’t tell how long this recording is.',
  TRANSCRIPTION_DISABLED: 'Transcription isn’t available here.',
  TRANSCRIPTION_POLICY_RESTRICTED: 'Restricted sources are never sent to an external transcription service.',
  TRANSCRIPTION_UNAVAILABLE: 'Transcription is unavailable right now. Try again later.',
  TRANSCRIPTION_RATE_LIMITED: 'Too many transcriptions at once. Try again later.',
  TRANSCRIPTION_TIMEOUT: 'Transcription took too long. Try again.',
  TRANSCRIPTION_REJECTED: 'The transcription service couldn’t process this recording.',
  CAPTIONS_INVALID: 'This caption file couldn’t be read. Use a .vtt or .srt file.',
  CAPTIONS_TOO_LARGE: 'This caption file is too large.',
  WEB_PAGE_NO_TEXT: 'This page has no readable text.',
  REMOTE_IMPORT_UNAVAILABLE: 'Web pages aren’t available here yet.',
  REMOTE_URL_BLOCKED: 'That web address can’t be fetched.',
  REMOTE_AUTH_REQUIRED: 'That page needs a sign-in, so it can’t be fetched.',
  REMOTE_FETCH_TIMEOUT: 'That page took too long to respond.',
  REMOTE_CONTENT_TOO_LARGE: 'That page is too large.',
  REMOTE_CONTENT_TYPE_REJECTED: 'That address isn’t a web page that can be read.',
  SOURCE_CONTENT_EMPTY: 'There’s no text in this source.',
  SOURCE_TEXT_TOO_LARGE: 'This text is too long.',
  SOURCE_PROCESSING_RETRIES_EXHAUSTED: 'Processing kept failing. Try again later.',
  SOURCE_INGESTION_RETRIES_EXHAUSTED: 'Processing kept failing. Try again later.',
  SOURCE_PROCESSOR_UNAVAILABLE: 'Processing is unavailable right now. Try again later.',
}

export function failureText(code: string | null | undefined) {
  if (!code) return 'Processing failed.'
  if (failures[code]) return failures[code]
  if (code.startsWith('REMOTE_')) return 'That page couldn’t be fetched.'
  return 'Processing failed.'
}

/** What the reader sees about a Source's processing, in one line. */
export function processingSummary(status: SourceDto['status'], version?: { processingStage?: string | null; failureCode?: string | null; partialReason?: string | null } | null) {
  if (version?.processingStage === 'AWAITING_PROCESSOR') return 'Added, not searchable: text can’t be read from images yet.'
  switch (status) {
    case 'PENDING': return 'Waiting to be processed.'
    case 'PROCESSING': return `${stageLabel(version?.processingStage) ?? 'Processing'}…`
    case 'READY': return 'Ready to use in notes and Spaces.'
    case 'PARTIALLY_READY': return partialText(version?.partialReason)
    case 'FAILED': return failureText(version?.failureCode)
    case 'QUARANTINED': return 'This file didn’t pass a safety check, so it can’t be used. It can’t be retried.'
    case 'ARCHIVED': return 'Archived. It’s left out of answers until you restore it.'
    case 'DELETED': return 'Deleted.'
  }
}

/** Still moving: poll until it settles. Images parked at AWAITING_PROCESSOR are settled. */
export function isProcessing(status: SourceDto['status'], stage?: string | null) {
  return (status === 'PENDING' || status === 'PROCESSING') && stage !== 'AWAITING_PROCESSOR'
}

export function processingSettled(state: Pick<SourceProcessingDto, 'sourceStatus' | 'version'>) {
  return !isProcessing(state.sourceStatus, state.version?.processingStage)
}

/** Poll delay: 1 s growing 1.5× to 5 s, matching `poll()`. */
export function pollDelay(attempt: number) {
  return Math.min(1000 * 1.5 ** attempt, 5000)
}
