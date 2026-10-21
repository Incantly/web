import { normalizeDocument, parseIncantlyDocument, validateDocument, type IncantlyDocument } from '@incantly/core/document'

export type GateResult = { ok: true; document: IncantlyDocument; repaired: boolean } | { ok: false; issues: string[] }

function describe(issues: readonly { path?: string; code?: string; message?: string }[]) {
  return issues.slice(0, 5).map((issue) => [issue.code, issue.path].filter(Boolean).join(' at ') || issue.message || 'invalid document')
}

/**
 * Load gate for every document from the server or the local cache:
 * parse (version detection + migrations) → validate → normalize. Strict first; a recovered
 * document is marked `repaired` so the UI can say content was fixed.
 */
export function loadDocument(value: unknown): GateResult {
  const strict = parseIncantlyDocument(value)
  if (strict.ok && strict.document) return { ok: true, document: normalizeDocument(strict.document), repaired: strict.appliedVersions.length > 0 }
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
