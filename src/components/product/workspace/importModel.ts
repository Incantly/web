import { IMPORT_MAX_BYTES, type ImportJobDto } from '../../../lib/api/imports'
import { assetContentType } from '../../../lib/assets/upload'

/** What this device remembers about an import so a reload resumes polling. Never document text. */
export type TrackedImport = {
  id: string
  /** The file name, or only the host of an imported web address. */
  label: string
  /** Set when importing into an existing note. */
  intoNoteId: string | null
  startedAt: number
  dismissed?: boolean
}

const MAX_AGE_MS = 24 * 60 * 60 * 1000
const MAX_TRACKED = 20

export function importStorageKey(userId: string) {
  return `incantly-imports:${userId}`
}

/** Parses stored imports defensively: anything malformed or older than a day is dropped. */
export function parseTracked(raw: string | null, now = Date.now()): TrackedImport[] {
  if (!raw) return []
  try {
    const value: unknown = JSON.parse(raw)
    if (!Array.isArray(value)) return []
    return value.filter((item): item is TrackedImport => Boolean(item) && typeof item.id === 'string' && typeof item.label === 'string' && typeof item.startedAt === 'number' && (item.intoNoteId === null || typeof item.intoNoteId === 'string'))
      .filter((item) => now - item.startedAt < MAX_AGE_MS)
      .slice(-MAX_TRACKED)
  } catch {
    return []
  }
}

export function validateImportFile(file: { name: string; type: string; size: number }): string | null {
  const type = assetContentType(file)
  if (type !== 'text/plain' && type !== 'text/markdown') return 'Choose a plain text (.txt) or Markdown (.md) file.'
  if (file.size <= 0) return 'This file is empty.'
  if (file.size > IMPORT_MAX_BYTES) return 'Files imported as a note can be up to 10 MB.'
  return null
}

/** Only https addresses can be imported; returns the host to show, or an error message. */
export function validateImportUrl(value: string): { ok: true; url: string; host: string } | { ok: false; message: string } {
  const text = value.trim()
  if (!text) return { ok: false, message: 'Enter a web address.' }
  let url: URL
  try { url = new URL(text) } catch { return { ok: false, message: 'Enter a full web address, starting with https://' } }
  if (url.protocol !== 'https:') return { ok: false, message: 'Only https:// addresses can be imported.' }
  if (text.length > 2048) return { ok: false, message: 'That web address is too long.' }
  return { ok: true, url: url.href, host: url.host }
}

export function importStatusText(job: Pick<ImportJobDto, 'status'> | undefined, into: boolean) {
  switch (job?.status) {
    case 'queued': return 'Waiting to start'
    case 'running': return 'Importing…'
    case 'completed': return into ? 'Added to the note' : 'Imported as a new note'
    case 'failed': return 'Import failed'
    case 'cancelled': return 'Cancelled'
    default: return 'Checking…'
  }
}

/** Import jobs ask to be polled every 2–5 seconds. */
export function importPollDelay(attempt: number) {
  return Math.min(2000 * 1.25 ** attempt, 5000)
}
