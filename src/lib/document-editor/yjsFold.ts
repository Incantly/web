import type { JSONContent } from '@tiptap/core'
import { documentNodeId, type IncantlyDocument } from '@incantly/canvas-core/document'
import type { CollabMode } from '../api/live'
import { checkDocumentForSave } from '../notes/documentGate'
import type { EditorChange } from '../notes/noteSync'
import { proseMirrorToIncantlyDocument, type DocumentAdapterIssue, type DocumentAdapterReport } from './conversion'

/**
 * Phase 2 canonical fold: Yjs document state → canonical Incantly JSON → the existing
 * transaction/checkpoint pipeline. Yjs is convergence, the pipeline is persistence: the fold
 * never writes storage itself, it hands a gated canonical document to `NoteSync.record`
 * exactly like a legacy structural save, so DTOs, idempotency keys, batching, conflict
 * recovery, and server validation are all unchanged.
 *
 * The Yjs types below are structural on purpose: this module reads the live fragment through
 * `toArray`/`getAttributes`/`toDelta` only, so it compiles without the `yjs` package (pinned
 * in Phase 0) and the Phase 1 binding passes its real `Y.XmlFragment` straight in.
 */

/** Minimal read surface of `Y.XmlFragment` the fold consumes. */
export interface YjsXmlFragmentLike {
  toArray(): readonly unknown[]
}

/** Minimal read surface of `Y.XmlElement` the fold consumes. */
export interface YjsXmlElementLike {
  readonly nodeName: string
  getAttributes(): Record<string, unknown>
  toArray(): readonly unknown[]
}

/** One `Y.XmlText.toDelta()` operation. */
export interface YjsTextDeltaOp {
  insert: unknown
  attributes?: Record<string, unknown> | undefined
}

/** Minimal read surface of `Y.XmlText` the fold consumes. */
export interface YjsXmlTextLike {
  toDelta(): readonly YjsTextDeltaOp[]
}

export type YjsFoldResult =
  | { ok: true; document: IncantlyDocument; report: DocumentAdapterReport }
  | { ok: false; issues: string[] }

/** A hostile or corrupt peer can bloat room state; the fold refuses to convert past these budgets. */
const MAX_FOLD_NODES = 100_000
const MAX_FOLD_TEXT_CHARS = 10_000_000
const MAX_ATTR_DEPTH = 10
/** Element nesting past this throws: the node budget alone cannot stop stack exhaustion from deep hostile nesting. */
const MAX_ELEMENT_DEPTH = 100
/** Consecutive fold failures before the writer reports the failure as persistent (P1/P4 surfaces UI + legacy fallback). */
const MAX_CONSECUTIVE_FOLD_FAILURES = 5

class FoldLimitError extends Error {}

type FoldBudget = { nodes: number; chars: number }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const isXmlElement = (value: unknown): value is YjsXmlElementLike =>
  isRecord(value) && typeof value.nodeName === 'string' && typeof value.getAttributes === 'function' && typeof value.toArray === 'function'

const isXmlText = (value: unknown): value is YjsXmlTextLike =>
  isRecord(value) && typeof value.nodeName !== 'string' && typeof value.toDelta === 'function'

/** Peer-controlled keys that must never land on a plain object (prototype pollution / shape surprises). */
const isUnsafeKey = (key: string): boolean => key === '__proto__' || key === 'constructor' || key === 'prototype'

/** 32-bit FNV-1a; deterministic fallback IDs keep id-less peer content stable across folds. */
function hash32(value: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/**
 * Plain-JSON copy of one Yjs attribute value. Nested shared types (a `Y.Map`/`Y.Array` stored
 * as an attribute) convert through their own `toJSON`; anything else exotic is dropped so a
 * hostile peer cannot smuggle non-JSON values into the canonical document.
 */
function plainAttributeValue(value: unknown, seen: Set<object>, depth: number, path: string, issues: DocumentAdapterIssue[]): unknown {
  if (value === null || value === undefined || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value !== 'object') {
    issues.push({ code: 'invalid_content', path, message: 'Dropped a non-JSON attribute value', action: 'omitted' })
    return undefined
  }
  if (seen.has(value)) {
    issues.push({ code: 'invalid_content', path, message: 'Dropped a cyclic attribute value', action: 'omitted' })
    return undefined
  }
  if (depth > MAX_ATTR_DEPTH) {
    issues.push({ code: 'invalid_content', path, message: 'Dropped an over-nested attribute value', action: 'omitted' })
    return undefined
  }
  // A Yjs shared type nested in attributes quacks like `{ toJSON }` over internal slots;
  // plain data with a `toJSON` method is left alone (its own serialization would lie).
  const candidate = value as { toJSON?: unknown; _item?: unknown; _map?: unknown; _start?: unknown }
  if (typeof candidate.toJSON === 'function' && (candidate._item !== undefined || candidate._map !== undefined || candidate._start !== undefined)) {
    try {
      return plainAttributeValue(candidate.toJSON.call(value), seen, depth + 1, path, issues)
    } catch {
      issues.push({ code: 'invalid_content', path, message: 'Dropped an unreadable attribute value', action: 'omitted' })
      return undefined
    }
  }
  seen.add(value)
  if (Array.isArray(value)) {
    const out: unknown[] = []
    for (const item of value) {
      const converted = plainAttributeValue(item, seen, depth + 1, path, issues)
      if (converted !== undefined) out.push(converted)
    }
    seen.delete(value)
    return out
  }
  const out: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (key === 'ychange' || isUnsafeKey(key)) continue
    const converted = plainAttributeValue(item, seen, depth + 1, `${path}.${key}`, issues)
    if (converted !== undefined) out[key] = converted
  }
  seen.delete(value)
  return out
}

function markFromDeltaAttributes(attributes: Record<string, unknown>, path: string, issues: DocumentAdapterIssue[]): NonNullable<JSONContent['marks']> {
  const marks: NonNullable<JSONContent['marks']> = []
  for (const [name, value] of Object.entries(attributes)) {
    // y-prosemirror's collaborative-undo display attribute, not a mark.
    if (name === 'ychange') continue
    const attrs = plainAttributeValue(value, new Set(), 0, `${path}.marks.${name}`, issues)
    marks.push(isRecord(attrs) ? { type: name, attrs } : { type: name })
  }
  return marks
}

function textNodesFromDelta(text: YjsXmlTextLike, path: string, issues: DocumentAdapterIssue[], budget: FoldBudget): JSONContent[] {
  const nodes: JSONContent[] = []
  const delta = text.toDelta()
  // A hostile peer can pack one XmlText with a giant delta; refuse it before per-op work allocates further.
  if (delta.length > MAX_FOLD_NODES) throw new FoldLimitError('Document nodes exceed the fold budget')
  for (const op of delta) {
    if (typeof op.insert !== 'string') {
      issues.push({ code: 'unsupported_node', path, message: 'Omitted a non-text delta operation', action: 'omitted' })
      continue
    }
    // Empty inserts carry no content; with formatting attributes they would otherwise
    // materialize as empty text nodes the adapter drops anyway.
    if (!op.insert) continue
    budget.chars += op.insert.length
    if (budget.chars > MAX_FOLD_TEXT_CHARS) throw new FoldLimitError('Document text exceeds the fold budget')
    budget.nodes += 1
    if (budget.nodes > MAX_FOLD_NODES) throw new FoldLimitError('Document nodes exceed the fold budget')
    let marks: NonNullable<JSONContent['marks']> = []
    if (op.attributes === undefined || op.attributes === null) marks = []
    else if (isRecord(op.attributes)) marks = markFromDeltaAttributes(op.attributes, path, issues)
    else issues.push({ code: 'unsupported_mark', path, message: 'Omitted non-record delta attributes', action: 'omitted' })
    nodes.push({ type: 'text', text: op.insert, ...(marks.length ? { marks } : {}) })
  }
  return nodes
}

/**
 * Deterministic stand-in for an element that arrived without a usable node ID (a peer that
 * skipped the binding's ID repair, or hostile room content). Random minting here would make
 * every fold look changed and queue a save per idle window forever; the hash is stable while
 * the content is, and the Phase 1 seeding path always carries real stable IDs.
 */
function fallbackNodeId(nodeName: string, path: string, attrs: Record<string, unknown>, used: Set<string>): string {
  const fingerprint = `${path}|${nodeName}|${JSON.stringify(attrs)}`
  let candidate = `node:fold:${hash32(fingerprint).toString(36)}`
  let attempt = 0
  while (used.has(candidate)) {
    attempt += 1
    candidate = `node:fold:${hash32(`${fingerprint}#${attempt}`).toString(36)}`
  }
  used.add(candidate)
  return String(documentNodeId(candidate))
}

function elementToProseMirror(element: YjsXmlElementLike, path: string, issues: DocumentAdapterIssue[], budget: FoldBudget, used: Set<string>, depth = 0): JSONContent {
  if (depth > MAX_ELEMENT_DEPTH) throw new FoldLimitError('Document nesting exceeds the fold budget')
  budget.nodes += 1
  if (budget.nodes > MAX_FOLD_NODES) throw new FoldLimitError('Document nodes exceed the fold budget')
  const raw = element.getAttributes()
  const attrs: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (key === 'ychange' || isUnsafeKey(key)) continue
    const converted = plainAttributeValue(value, new Set(), 0, `${path}.attrs.${key}`, issues)
    if (converted !== undefined) attrs[key] = converted
  }
  const id = typeof attrs.id === 'string' && attrs.id.trim() ? attrs.id : fallbackNodeId(element.nodeName, path, attrs, used)
  if (typeof attrs.id === 'string' && attrs.id.trim()) {
    if (used.has(attrs.id)) {
      issues.push({ code: 'repaired_content', path, message: 'Reassigned a duplicate node ID', action: 'repaired' })
      attrs.id = fallbackNodeId(element.nodeName, `${path}#dup`, attrs, used)
    } else used.add(attrs.id)
  } else {
    issues.push({ code: 'repaired_content', path, message: 'Assigned a node ID the peer omitted', action: 'repaired' })
    attrs.id = id
  }
  const content: JSONContent[] = []
  for (const child of element.toArray()) {
    if (isXmlText(child)) content.push(...textNodesFromDelta(child, `${path}.content`, issues, budget))
    else if (isXmlElement(child)) content.push(elementToProseMirror(child, `${path}.content[${content.length}]`, issues, budget, used, depth + 1))
    else issues.push({ code: 'unsupported_node', path: `${path}.content`, message: 'Omitted an unknown shared type', action: 'omitted' })
  }
  return { type: element.nodeName, attrs, ...(content.length ? { content } : {}) }
}

/**
 * Reads the live Yjs fragment (y-prosemirror layout: block `XmlElement`s, inline `XmlText`
 * with mark formatting attributes) as ProseMirror JSON. Unknown nodes, marks, and attribute
 * values are omitted with adapter issues — never passed through — so hostile room content
 * sanitizes to the canonical schema before it can reach the pipeline.
 */
export function yjsFragmentToProseMirror(fragment: YjsXmlFragmentLike, issues: DocumentAdapterIssue[] = []): JSONContent {
  const budget: FoldBudget = { nodes: 0, chars: 0 }
  const used = new Set<string>()
  const content: JSONContent[] = []
  for (const child of fragment.toArray()) {
    if (isXmlElement(child)) content.push(elementToProseMirror(child, `$.content[${content.length}]`, issues, budget, used))
    else if (isXmlText(child)) {
      // Text directly under the fragment is not a block; folding it as one would invent
      // structure, so it is omitted loudly instead of converted silently.
      issues.push({ code: 'unsupported_node', path: '$.content', message: 'Omitted text outside any block', action: 'omitted' })
    } else issues.push({ code: 'unsupported_node', path: '$.content', message: 'Omitted an unknown shared type', action: 'omitted' })
  }
  return { type: 'doc', content }
}

/**
 * Folds the live Yjs fragment to canonical Incantly JSON. The envelope (id, version,
 * metadata, timestamps) comes from `base` — the head checkpoint the note opened from — the
 * same way the legacy checkpoint path reuses its previous document; the fragment carries
 * block content only. The result passes the client save gate; a failure returns `ok: false`
 * and must not be submitted.
 */
export function foldYjsToCanonical(
  fragment: YjsXmlFragmentLike,
  base: IncantlyDocument,
  options: { updatedAt?: string } = {},
): YjsFoldResult {
  const issues: DocumentAdapterIssue[] = []
  let proseMirror: JSONContent
  try {
    proseMirror = yjsFragmentToProseMirror(fragment, issues)
  } catch (error) {
    return { ok: false, issues: [error instanceof Error ? error.message : 'The shared document couldn’t be read.'] }
  }
  const converted = proseMirrorToIncantlyDocument(proseMirror, { fallbackDocument: base })
  const document = { ...converted.value, updatedAt: options.updatedAt ?? new Date().toISOString() }
  const gate = checkDocumentForSave(document)
  if (!gate.ok) return { ok: false, issues: gate.issues }
  const merged = [...issues, ...converted.report.issues]
  return {
    ok: true,
    document: gate.document,
    report: { issues: merged, repaired: merged.some((issue) => issue.action === 'repaired' || issue.action === 'defaulted'), unsupported: merged.some((issue) => issue.code === 'unsupported_node' || issue.code === 'unsupported_mark') },
  }
}

// ---------------------------------------------------------------------------
// Single-writer guard: the fold and the legacy noteSync send path are never both
// constructed for one open note (contract §2/Phase 0). Both construction sites acquire
// here; a second, different writer for the same note throws instead of dual-writing.
// ---------------------------------------------------------------------------

export type NoteWriterKind = 'legacy-sync' | 'yjs-fold'

const noteWriters = new Map<string, { kind: NoteWriterKind; count: number }>()

/**
 * Whether acquiring the single writer slot would succeed, without acquiring.
 * Pure read for render-phase checks; the acquire itself still happens in an
 * effect (single-threaded, one scope per note, so peek-then-acquire cannot
 * race — but `acquireNoteWriter` stays the enforcement point and still throws
 * on mismatch).
 */
export function canAcquireNoteWriter(noteId: string, kind: NoteWriterKind): boolean {
  const held = noteWriters.get(noteId)
  return !held || held.kind === kind
}

/** Acquires the single writer slot for an open note. The returned function releases it. */
export function acquireNoteWriter(noteId: string, kind: NoteWriterKind): () => void {
  const held = noteWriters.get(noteId)
  if (held && held.kind !== kind) {
    throw new Error(`[yjs-fold] note ${noteId} already has a ${held.kind} writer; refusing to construct ${kind}`)
  }
  noteWriters.set(noteId, { kind, count: (held?.count ?? 0) + 1 })
  let released = false
  return () => {
    if (released) return
    released = true
    const current = noteWriters.get(noteId)
    if (!current) return
    if (current.count <= 1) noteWriters.delete(noteId)
    else noteWriters.set(noteId, { kind: current.kind, count: current.count - 1 })
  }
}

/**
 * Which writer an opening note gets for the Phase 0 `CollabMode` (read it with
 * `collabModeOf` in `lib/api/live` — that stays the single flag read point).
 */
export function writerKindForCollabMode(mode: CollabMode): NoteWriterKind {
  return mode === 'yjs' ? 'yjs-fold' : 'legacy-sync'
}

// ---------------------------------------------------------------------------
// Debounced fold submission through the existing pipeline.
// ---------------------------------------------------------------------------

export type YjsFoldWriterOptions = {
  noteId: string
  /** Reads the current Yjs state and folds it; the caller closes over the doc/fragment/base. */
  fold: () => YjsFoldResult
  /** The pipeline's record (`NoteSync.record`): the fold submits as a structural save. */
  record: (change: EditorChange) => void
  /** The pipeline's immediate send (`NoteSync.flushNow`). */
  flushPipeline: () => Promise<void>
  /** Idle time before folding after the last Yjs update (default 1000 ms, as today). */
  idleMs?: number
  /**
   * Longest a pending fold waits while updates keep arriving (default 8000 ms). A
   * compromised peer streaming continuous remote updates must not starve persistence:
   * once a fold has waited this long it runs on the next scheduled update instead of
   * re-arming the idle timer.
   */
  maxDeferMs?: number
  schedule?: (fn: () => void, ms: number) => () => void
  now?: () => number
  /**
   * Fold failures (gate rejections, hostile content, budget overruns); nothing is submitted.
   * Render these as text (React default escaping), never via dangerouslySetInnerHTML: gate
   * messages can carry validator output shaped by hostile room content.
   */
  onFoldIssue?: (issues: readonly string[]) => void
  /**
   * Fired once when consecutive fold failures reach the threshold (5): hostile room content
   * may be blocking all persistence for the note. P1/P4 surfaces this in the UI and offers
   * the legacy send-path fallback. Resets on the next successful fold.
   */
  onPersistentFoldFailure?: (issues: readonly string[]) => void
}

export type YjsFoldWriter = {
  /** The binding calls this on every Yjs update, local or remote; the fold itself is debounced. */
  scheduleFold: () => void
  /** Folds immediately and sends through the pipeline (explicit save, reconnect, teardown). */
  flush: () => Promise<void>
  /** Stops timers and releases the writer slot. Queued pipeline work still belongs to NoteSync. */
  dispose: () => void
}

const defaultSchedule = (fn: () => void, ms: number) => { const timer = setTimeout(fn, ms); return () => clearTimeout(timer) }

/** Key-order-independent JSON comparison; `undefined` fields compare as absent, as in JSON. */
function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`
}

/** Whether two folded documents hold the same content (`updatedAt` is stamped per fold). */
function sameFoldedDocument(left: IncantlyDocument, right: IncantlyDocument): boolean {
  return stable({ ...left, updatedAt: '' }) === stable({ ...right, updatedAt: '' })
}

/**
 * Debounced fold submission for one `yjs` note. Local keystrokes converge through the room
 * without touching this path; ~1s after the Yjs state goes idle the fold runs and a changed
 * canonical document is recorded as a checkpoint-mode change — on shared notes the pipeline
 * diffs it into transaction batches, on unshared notes it saves as a checkpoint, both with
 * the same idempotency and recovery as today. Unchanged folds submit nothing, so an idle
 * open note never mints revisions.
 *
 * The writer closes over one fragment/base pair: on room-ID rotation or reseed the Phase 1
 * binding must `dispose()` it and construct a fresh one — never reuse a writer across rooms.
 */
export function createYjsFoldWriter(options: YjsFoldWriterOptions): YjsFoldWriter {
  const release = acquireNoteWriter(options.noteId, 'yjs-fold')
  const idleMs = options.idleMs ?? 1000
  const maxDeferMs = options.maxDeferMs ?? 8000
  const schedule = options.schedule ?? defaultSchedule
  const now = options.now ?? Date.now
  let cancelIdle: (() => void) | null = null
  let disposed = false
  let lastSubmitted: IncantlyDocument | null = null
  let lastIssueSignature: string | null = null
  let firstScheduledAt: number | null = null
  let consecutiveFailures = 0
  let persistentReported = false

  const runFold = () => {
    if (disposed) return
    let result: YjsFoldResult
    try {
      result = options.fold()
    } catch (error) {
      result = { ok: false, issues: [error instanceof Error ? error.message : 'The shared document couldn’t be read.'] }
    }
    if (!result.ok) {
      // Consecutive identical failures report once; the next changed Yjs state retries.
      const signature = stable(result.issues)
      if (signature !== lastIssueSignature) {
        lastIssueSignature = signature
        options.onFoldIssue?.(result.issues)
      }
      consecutiveFailures += 1
      if (consecutiveFailures >= MAX_CONSECUTIVE_FOLD_FAILURES && !persistentReported) {
        persistentReported = true
        options.onPersistentFoldFailure?.(result.issues)
      }
      return
    }
    lastIssueSignature = null
    consecutiveFailures = 0
    persistentReported = false
    if (lastSubmitted && sameFoldedDocument(lastSubmitted, result.document)) return
    lastSubmitted = result.document
    options.record({ mode: 'checkpoint', operations: [], document: result.document })
  }

  return {
    scheduleFold: () => {
      if (disposed) return
      const at = now()
      if (firstScheduledAt === null) firstScheduledAt = at
      if (at - firstScheduledAt >= maxDeferMs) {
        cancelIdle?.(); cancelIdle = null
        firstScheduledAt = null
        runFold()
        return
      }
      cancelIdle?.()
      cancelIdle = schedule(() => { cancelIdle = null; firstScheduledAt = null; runFold() }, idleMs)
    },
    flush: async () => {
      cancelIdle?.(); cancelIdle = null
      firstScheduledAt = null
      runFold()
      await options.flushPipeline()
    },
    dispose: () => {
      disposed = true
      cancelIdle?.(); cancelIdle = null
      firstScheduledAt = null
      release()
    },
  }
}
