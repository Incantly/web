import { Extension } from '@tiptap/core'
import { createDocumentNodeId } from '@incantly/core/document'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { INCANTLY_NODE_ID_TYPES } from './nodes'

export const incantlyNodeIdPluginKey = new PluginKey('incantlyDocumentNodeIds')

export interface DocumentNodeIdRepair { pos: number; id: string }

export function findDocumentNodeIdRepairs(doc: ProseMirrorNode): DocumentNodeIdRepair[] {
  const used = new Set<string>()
  const repairs: DocumentNodeIdRepair[] = []
  doc.descendants((node, pos) => {
    if (!INCANTLY_NODE_ID_TYPES.has(node.type.name)) return
    const current = typeof node.attrs.id === 'string' && node.attrs.id.trim() ? node.attrs.id : null
    if (current && !used.has(current)) {
      used.add(current)
      return
    }
    let id = String(createDocumentNodeId())
    while (used.has(id)) id = String(createDocumentNodeId())
    used.add(id)
    repairs.push({ pos, id })
  })
  return repairs
}

/** Repairs missing or duplicate IDs without changing IDs that are already stable. */
export const IncantlyNodeIds = Extension.create({
  name: 'incantlyNodeIds',
  addProseMirrorPlugins() {
    return [new Plugin({
      key: incantlyNodeIdPluginKey,
      appendTransaction: (_transactions, _oldState, newState) => {
        const repairs = findDocumentNodeIdRepairs(newState.doc)
        if (!repairs.length) return null
        const transaction = newState.tr
        for (const repair of repairs) {
          const node = transaction.doc.nodeAt(repair.pos)
          if (node) transaction.setNodeMarkup(repair.pos, undefined, { ...node.attrs, id: repair.id }, node.marks)
        }
        return transaction.setMeta(incantlyNodeIdPluginKey, { repaired: repairs.length })
      },
    })]
  },
})
