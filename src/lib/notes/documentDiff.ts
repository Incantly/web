import type { DocumentOperation, IncantlyDocument } from '@incantly/canvas-core/document'

/** A full document expressed as typed operations against a base document. */
export type DocumentDiff = { pageSetup: DocumentOperation | null; content: DocumentOperation[] }

/** Key-order-independent JSON comparison; `undefined` fields compare as absent, as in JSON. */
function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`
}

function deepEqual(left: unknown, right: unknown) {
  return stable(left) === stable(right)
}

/**
 * Expresses `mine` as operations against `server` (both validated): page setup becomes one
 * `setPageSetup`, and top-level body nodes diff by stable ID — `deleteNode` for removed ones,
 * `updateNode` (a complete replacement, so nested changes ride along) for changed ones,
 * `insertNode` for new ones, and `moveNode` when their order changed. Deletes run first;
 * inserts and moves then walk `mine` in order, each landing exactly on its final index.
 *
 * Changes no typed operation can express — the title, layout and research metadata — produce
 * no operations: a pure rename diffs to nothing. Callers must not treat that as an error.
 */
export function diffDocuments(server: IncantlyDocument, mine: IncantlyDocument): DocumentDiff {
  const pageSetup: DocumentOperation | null = deepEqual(server.metadata.pageSetup, mine.metadata.pageSetup)
    ? null
    : { type: 'setPageSetup', pageSetup: mine.metadata.pageSetup }
  const before = new Map(server.content.map((node) => [node.id, node]))
  const after = new Map(mine.content.map((node) => [node.id, node]))
  const content: DocumentOperation[] = []
  for (let index = server.content.length - 1; index >= 0; index--) {
    const node = server.content[index]
    if (!after.has(node.id)) content.push({ type: 'deleteNode', nodeId: node.id })
  }
  const beforeOrder = server.content.map((node) => node.id).filter((nodeId) => after.has(nodeId))
  const afterOrder = mine.content.map((node) => node.id).filter((nodeId) => before.has(nodeId))
  const moved = beforeOrder.some((nodeId, index) => nodeId !== afterOrder[index])
  mine.content.forEach((node, index) => {
    const previous = before.get(node.id)
    if (!previous) content.push({ type: 'insertNode', index, node })
    else {
      if (!deepEqual(previous, node)) content.push({ type: 'updateNode', nodeId: node.id, node })
      if (moved) content.push({ type: 'moveNode', nodeId: node.id, index })
    }
  })
  return { pageSetup, content }
}

/**
 * Groups a diff into transaction payloads: page setup travels alone first (a transaction
 * mixing it with content is not atomic), then content in batches of at most `maxOps`.
 * An empty diff (identical documents, or a title-only change) groups to nothing.
 */
export function diffTransactionGroups(diff: DocumentDiff, maxOps: number): DocumentOperation[][] {
  const groups: DocumentOperation[][] = []
  if (diff.pageSetup) groups.push([diff.pageSetup])
  for (let at = 0; at < diff.content.length; at += maxOps) groups.push(diff.content.slice(at, at + maxOps))
  return groups
}
