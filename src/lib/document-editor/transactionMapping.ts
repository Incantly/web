import type { JSONContent } from '@tiptap/core'
import { matchFontFamilyKey, parseFontSizeToPt } from './schema/fonts'
import type { Node as ProseMirrorNode, Slice } from '@tiptap/pm/model'
import type { Transaction } from '@tiptap/pm/state'
import { ReplaceStep } from '@tiptap/pm/transform'
import {
  applyDocumentTransaction,
  citationId,
  createDocumentTransactionId,
  documentNodeId,
  type DocumentOperation,
  type DocumentTransaction,
  type DocumentTransactionOrigin,
  type IncantlyDocument,
  type ReplaceDocumentTextOperation,
  type TextMark,
} from '@incantly/core/document'
import {
  proseMirrorToIncantlyDocument,
  type DocumentAdapterReport,
} from './conversion'

export const INCANTLY_TRANSACTION_META = 'incantlyDocumentTransaction'

export type DocumentHistoryAction = 'undo' | 'redo'

export interface IncantlyEditorTransactionMeta {
  origin: DocumentTransactionOrigin
  historyAction?: DocumentHistoryAction
  forceCheckpoint?: boolean
}

export type DocumentCheckpointReason = 'structural' | 'history' | 'periodic' | 'forced'

export interface DocumentCheckpointPolicyOptions {
  maxIncrementalTransactions?: number
  maxIntervalMs?: number
  initialTimestamp?: number
}

export interface DocumentCheckpointDecision {
  create: boolean
  reason?: DocumentCheckpointReason
}

/** Per-editor checkpoint state. Do not share one tracker between editor instances. */
export class DocumentCheckpointTracker {
  readonly maxIncrementalTransactions: number
  readonly maxIntervalMs: number
  private incrementalTransactions = 0
  private lastCheckpointAt: number

  constructor(options: DocumentCheckpointPolicyOptions = {}) {
    this.maxIncrementalTransactions = Math.max(1, options.maxIncrementalTransactions ?? 100)
    this.maxIntervalMs = Math.max(1, options.maxIntervalMs ?? 30_000)
    this.lastCheckpointAt = options.initialTimestamp ?? Date.now()
  }

  decide(input: { incremental: boolean; meta: IncantlyEditorTransactionMeta; timestamp: number }): DocumentCheckpointDecision {
    let reason: DocumentCheckpointReason | undefined
    if (input.meta.forceCheckpoint) reason = 'forced'
    else if (input.meta.historyAction) reason = 'history'
    else if (!input.incremental) reason = 'structural'
    else if (this.incrementalTransactions + 1 >= this.maxIncrementalTransactions
      || input.timestamp - this.lastCheckpointAt >= this.maxIntervalMs) reason = 'periodic'

    if (reason) {
      this.incrementalTransactions = 0
      this.lastCheckpointAt = input.timestamp
      return { create: true, reason }
    }
    this.incrementalTransactions++
    return { create: false }
  }

  markCheckpoint(timestamp = Date.now()): void {
    this.incrementalTransactions = 0
    this.lastCheckpointAt = timestamp
  }
}

export interface MapProseMirrorTransactionOptions {
  document: IncantlyDocument
  transaction: Transaction
  checkpointTracker?: DocumentCheckpointTracker
  timestamp?: string
}

export interface CanonicalDocumentChangeEvent {
  origin: DocumentTransactionOrigin
  historyAction?: DocumentHistoryAction
  mode: 'none' | 'incremental' | 'checkpoint'
  operations: readonly DocumentOperation[]
  changedNodeIds: readonly string[]
  document: IncantlyDocument
  canonicalTransaction?: DocumentTransaction
  checkpointReason?: DocumentCheckpointReason
  adapterReport?: DocumentAdapterReport
}

const DEFAULT_META: IncantlyEditorTransactionMeta = { origin: 'user' }

export function setIncantlyTransactionMeta(
  transaction: Transaction,
  meta: IncantlyEditorTransactionMeta,
): Transaction {
  return transaction.setMeta(INCANTLY_TRANSACTION_META, meta)
}

export function getIncantlyTransactionMeta(transaction: Transaction): IncantlyEditorTransactionMeta {
  const value = transaction.getMeta(INCANTLY_TRANSACTION_META) as Partial<IncantlyEditorTransactionMeta> | undefined
  const origins = new Set<DocumentTransactionOrigin>(['user', 'remote', 'ai', 'import', 'migration', 'system'])
  if (!value || !origins.has(value.origin as DocumentTransactionOrigin)) return DEFAULT_META
  return {
    origin: value.origin as DocumentTransactionOrigin,
    ...(value.historyAction === 'undo' || value.historyAction === 'redo' ? { historyAction: value.historyAction } : {}),
    ...(value.forceCheckpoint === true ? { forceCheckpoint: true } : {}),
  }
}

/**
 * Map one ProseMirror mark to zero or more canonical marks. A stock
 * textStyle mark can carry color and family together, so the result is a
 * list. `null` means unmapped: the incremental fast path bails out to a
 * full checkpoint instead of persisting something partial.
 */
function proseMirrorMarks(mark: { type: { name: string }; attrs: Record<string, unknown> }): TextMark[] | null {
  switch (mark.type.name) {
    case 'bold': case 'italic': case 'underline': case 'strike': case 'code': return [{ type: mark.type.name }]
    case 'link': return typeof mark.attrs.href === 'string'
      ? [{ type: 'link', href: mark.attrs.href, ...(typeof mark.attrs.title === 'string' ? { title: mark.attrs.title } : {}) }]
      : null
    // Stock textStyle mark carries canonical textColor and/or fontFamily.
    case 'textStyle': {
      const out: TextMark[] = []
      const color = typeof mark.attrs.color === 'string' ? mark.attrs.color.trim() : ''
      if (color) out.push({ type: 'textColor', color })
      const family = typeof mark.attrs.fontFamily === 'string' ? matchFontFamilyKey(mark.attrs.fontFamily) : null
      // Unknown families are dropped (paste styles are sanitized away, so
      // nothing live can produce one); normalizeTextMarks is the backstop.
      if (family) out.push({ type: 'fontFamily', family })
      const size = typeof mark.attrs.fontSize === 'string' ? parseFontSizeToPt(mark.attrs.fontSize) : null
      if (size !== null) out.push({ type: 'fontSize', size })
      return out
    }
    case 'highlight': return typeof mark.attrs.color === 'string'
      ? [{ type: mark.type.name, color: mark.attrs.color }]
      : null
    case 'citation': return typeof mark.attrs.citationId === 'string'
      ? [{ type: 'citation', citationId: citationId(mark.attrs.citationId) }]
      : null
    case 'inlineMathMark': return typeof mark.attrs.latex === 'string'
      ? [{ type: 'inlineMath', latex: mark.attrs.latex }]
      : null
    default: return null
  }
}

function insertedText(slice: Slice): { text: string; marks?: TextMark[] } | null {
  if (slice.openStart !== 0 || slice.openEnd !== 0) return null
  let text = ''
  let commonMarks: TextMark[] | undefined
  let valid = true
  slice.content.forEach((node) => {
    if (node.isText) {
      const converted: TextMark[] = []
      for (const mark of node.marks) {
        const mapped = proseMirrorMarks(mark)
        // Unmapped marks bail to the checkpoint path; a bare textStyle
        // (no attrs) skips silently, matching the adapter.
        if (mapped === null) { valid = false; return }
        converted.push(...mapped)
      }
      if (commonMarks === undefined) commonMarks = converted
      else if (JSON.stringify(commonMarks) !== JSON.stringify(converted)) { valid = false; return }
      text += node.text ?? ''
    } else if (node.type.name === 'hardBreak') text += '\n'
    else valid = false
  })
  return valid ? { text, ...(commonMarks?.length ? { marks: commonMarks } : {}) } : null
}

function textOperationForStep(step: ReplaceStep, before: ProseMirrorNode): ReplaceDocumentTextOperation | null {
  const from = before.resolve(step.from)
  const to = before.resolve(step.to)
  if (!from.sameParent(to) || !['paragraph', 'heading', 'codeBlock'].includes(from.parent.type.name)) return null
  const id = from.parent.attrs.id
  if (typeof id !== 'string' || !id.trim()) return null
  const inserted = insertedText(step.slice)
  if (!inserted || (from.parent.type.name === 'codeBlock' && inserted.marks?.length)) return null
  return {
    type: 'replaceText',
    nodeId: documentNodeId(id),
    from: from.parentOffset,
    to: to.parentOffset,
    text: inserted.text,
    ...(inserted.marks?.length ? { marks: inserted.marks } : {}),
  }
}

function incrementalOperations(transaction: Transaction): DocumentOperation[] | null {
  const operations: DocumentOperation[] = []
  for (let index = 0; index < transaction.steps.length; index++) {
    const step = transaction.steps[index]
    if (!(step instanceof ReplaceStep)) return null
    const operation = textOperationForStep(step, transaction.docs[index])
    if (!operation) return null
    operations.push(operation)
  }
  return operations.length ? operations : null
}

function checkpointDocument(
  transaction: Transaction,
  previous: IncantlyDocument,
  timestamp: string,
): { document: IncantlyDocument; report: DocumentAdapterReport } {
  const converted = proseMirrorToIncantlyDocument(transaction.doc.toJSON() as JSONContent, { fallbackDocument: previous })
  return { document: { ...converted.value, updatedAt: timestamp }, report: converted.report }
}

function checkpointChangedNodeIds(before: ProseMirrorNode, after: ProseMirrorNode): string[] {
  const snapshots = (doc: ProseMirrorNode): Map<string, string> => {
    const output = new Map<string, string>()
    doc.descendants((node) => {
      if (typeof node.attrs.id === 'string' && node.attrs.id) output.set(node.attrs.id, JSON.stringify(node.toJSON()))
    })
    return output
  }
  const previous = snapshots(before)
  const next = snapshots(after)
  const changed = new Set<string>()
  for (const [id, snapshot] of previous) if (next.get(id) !== snapshot) changed.add(id)
  for (const [id, snapshot] of next) if (previous.get(id) !== snapshot) changed.add(id)
  return [...changed]
}

export function mapProseMirrorTransaction(options: MapProseMirrorTransactionOptions): CanonicalDocumentChangeEvent {
  const { transaction, document } = options
  const meta = getIncantlyTransactionMeta(transaction)
  const history = meta.historyAction ? { historyAction: meta.historyAction } : {}
  if (!transaction.docChanged) {
    return { origin: meta.origin, ...history, mode: 'none', operations: [], changedNodeIds: [], document }
  }

  const timestamp = options.timestamp ?? new Date().toISOString()
  const timestampMs = Date.parse(timestamp)
  const operations = incrementalOperations(transaction)
  const tracker = options.checkpointTracker ?? new DocumentCheckpointTracker({ initialTimestamp: timestampMs })
  const decision = tracker.decide({ incremental: operations !== null, meta, timestamp: timestampMs })

  if (operations) {
    const canonicalTransaction: DocumentTransaction = {
      id: createDocumentTransactionId(),
      documentId: document.id,
      origin: meta.origin,
      timestamp,
      operations,
    }
    const applied = applyDocumentTransaction(document, canonicalTransaction)
    if (applied.ok) {
      return {
        origin: meta.origin,
        ...history,
        mode: decision.create ? 'checkpoint' : 'incremental',
        operations,
        changedNodeIds: applied.changedNodeIds,
        document: applied.document,
        canonicalTransaction,
        ...(decision.reason ? { checkpointReason: decision.reason } : {}),
      }
    }
  }

  const checkpoint = checkpointDocument(transaction, document, timestamp)
  return {
    origin: meta.origin,
    ...history,
    mode: 'checkpoint',
    operations: [],
    changedNodeIds: checkpointChangedNodeIds(transaction.before, transaction.doc),
    document: checkpoint.document,
    checkpointReason: decision.reason ?? 'structural',
    adapterReport: checkpoint.report,
  }
}
