/**
 * In-memory record of recent API failures for support reports.
 * Only codes, statuses, request IDs and path templates; never bodies, query strings,
 * document text, presigned URLs, OTPs or cookies.
 */
export type DiagnosticEntry = { at: string; method: string; path: string; status: number; code: string; requestId: string | null }

const LIMIT = 50
const entries: DiagnosticEntry[] = []

/** Replaces opaque IDs in a path so entries stay comparable and carry no query data. */
export function pathTemplate(path: string) {
  return path.split('?')[0].split('/').map((segment) => (segment === '' || segment === 'v1' || /^[a-z-]+$/.test(segment) ? segment : ':id')).join('/')
}

export function recordDiagnostic(entry: Omit<DiagnosticEntry, 'at' | 'path'> & { path: string }) {
  entries.push({ ...entry, path: pathTemplate(entry.path), at: new Date().toISOString() })
  if (entries.length > LIMIT) entries.splice(0, entries.length - LIMIT)
}

export function getDiagnostics(): readonly DiagnosticEntry[] {
  return entries.slice()
}

export function clearDiagnostics() {
  entries.length = 0
}
