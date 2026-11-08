import { normalizeDocument, parseIncantlyDocument, validateDocument, type IncantlyDocument } from '@incantly/canvas-core/document'

export type GateResult = { ok: true; document: IncantlyDocument; repaired: boolean } | { ok: false; issues: string[] }

function describe(issues: readonly { path?: string; code?: string; message?: string }[]) {
  return issues.slice(0, 5).map((issue) => [issue.code, issue.path].filter(Boolean).join(' at ') || issue.message || 'invalid document')
}

/** Key-order-independent JSON comparison; `undefined` fields compare as absent, as in JSON. */
function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`
}

/**
 * Whether a forward migration changed content beyond the version bump. A clean v1 note
 * migrates to v2 untouched, and must not report `repaired` (the UI would claim content was
 * fixed on every old note); only a migration that actually rewrote something counts.
 */
function migrationChangedContent(input: unknown, migrated: IncantlyDocument): boolean {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return true
  return stable({ ...input, schemaVersion: 0 }) !== stable({ ...migrated, schemaVersion: 0 })
}

/**
 * Load gate for every document from the server or the local cache:
 * parse (version detection + migrations) → validate → normalize. Strict first; a recovered
 * document is marked `repaired` so the UI can say content was fixed.
 */
export function loadDocument(value: unknown): GateResult {
  const strict = parseIncantlyDocument(value)
  if (strict.ok && strict.document) return { ok: true, document: normalizeDocument(strict.document), repaired: migrationChangedContent(value, strict.document) }
  const recovered = parseIncantlyDocument(value, { recover: true })
  if (recovered.ok && recovered.document) return { ok: true, document: normalizeDocument(recovered.document), repaired: true }
  return { ok: false, issues: describe(recovered.issues.length ? recovered.issues : strict.issues) }
}

/** Save gate: never send a document that fails strict validation. */
export function checkDocumentForSave(document: IncantlyDocument): GateResult {
  const result = validateDocument(document)
  return result.valid && result.document ? { ok: true, document: result.document, repaired: false } : { ok: false, issues: describe(result.issues) }
}

/** Applies a title to the canonical metadata; the server derives the note title from it. */
export function withTitle(document: IncantlyDocument, title: string): IncantlyDocument {
  return { ...document, metadata: { ...document.metadata, title } }
}
