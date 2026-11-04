import { applyDocumentTransaction, createDocument, createParagraph, type IncantlyDocument } from '@incantly/canvas-core/document'
import { describe, expect, it } from 'vitest'
import { diffDocuments, diffTransactionGroups } from './documentDiff'

const para = (id: string, text: string) => createParagraph({ id, text })

function doc(paragraphs: { id: string; text: string }[], title = 'Note') {
  return createDocument({ id: 'doc-1', title, content: paragraphs.map((item) => para(item.id, item.text)), now: '2026-01-01T00:00:00.000Z' })
}

/** Applies diff ops to `server` exactly as the backend would, and returns the resulting document. */
function apply(server: IncantlyDocument, mine: IncantlyDocument) {
  const diff = diffDocuments(server, mine)
  const operations = [...(diff.pageSetup ? [diff.pageSetup] : []), ...diff.content]
  const applied = applyDocumentTransaction(server, {
    id: 'txn:test' as never,
    documentId: server.id,
    origin: 'user',
    timestamp: mine.updatedAt,
    operations,
  })
  expect(applied.ok).toBe(true)
  return applied.document
}

describe('diffDocuments', () => {
  it('diffs identical documents to nothing', () => {
    const server = doc([{ id: 'paragraph:a', text: 'hello' }])
    expect(diffDocuments(server, structuredClone(server))).toEqual({ pageSetup: null, content: [] })
  })

  it('diffs a title-only change to nothing: no typed operation sets the title', () => {
    const server = doc([{ id: 'paragraph:a', text: 'hello' }], 'Before')
    const mine = { ...structuredClone(server), metadata: { ...server.metadata, title: 'After' } }
    expect(diffDocuments(server, mine)).toEqual({ pageSetup: null, content: [] })
  })

  it('replaces a changed paragraph with one updateNode', () => {
    const server = doc([{ id: 'paragraph:a', text: 'hello' }])
    const mine = doc([{ id: 'paragraph:a', text: 'hello world' }])
    const diff = diffDocuments(server, mine)
    expect(diff.pageSetup).toBeNull()
    expect(diff.content).toHaveLength(1)
    expect(diff.content[0]).toMatchObject({ type: 'updateNode', nodeId: 'paragraph:a' })
    expect(apply(server, mine)).toEqual(mine)
  })

  it('inserts, deletes and moves paragraphs, and round-trips through apply', () => {
    const server = doc([
      { id: 'paragraph:a', text: 'a' },
      { id: 'paragraph:gone', text: 'doomed' },
      { id: 'paragraph:b', text: 'b' },
      { id: 'paragraph:c', text: 'c' },
    ])
    const mine = doc([
      { id: 'paragraph:c', text: 'c' },
      { id: 'paragraph:a', text: 'a' },
      { id: 'paragraph:new', text: 'new' },
      { id: 'paragraph:b', text: 'b!' },
    ])
    const diff = diffDocuments(server, mine)
    expect(diff.content.filter((op) => op.type === 'deleteNode')).toMatchObject([{ nodeId: 'paragraph:gone' }])
    expect(diff.content.filter((op) => op.type === 'insertNode')).toHaveLength(1)
    expect(diff.content.filter((op) => op.type === 'updateNode')).toMatchObject([{ nodeId: 'paragraph:b' }])
    expect(diff.content.some((op) => op.type === 'moveNode')).toBe(true)
    expect(apply(server, mine)).toEqual(mine)
  })

  it('carries nested inline changes on the parent updateNode', () => {
    const server = doc([{ id: 'paragraph:a', text: 'plain' }])
    const mine = structuredClone(server)
    mine.content[0] = { ...para('paragraph:a', 'bold'), content: [{ type: 'text', text: 'bold', marks: [{ type: 'bold' }] }] }
    const diff = diffDocuments(server, mine)
    expect(diff.content).toHaveLength(1)
    expect(diff.content[0]).toMatchObject({ type: 'updateNode', nodeId: 'paragraph:a' })
    expect(apply(server, mine)).toEqual(mine)
  })

  it('emits a lone setPageSetup when only page setup changed', () => {
    const server = doc([{ id: 'paragraph:a', text: 'hello' }])
    const mine = structuredClone(server)
    mine.metadata.pageSetup = { ...mine.metadata.pageSetup, orientation: mine.metadata.pageSetup.orientation === 'portrait' ? 'landscape' : 'portrait' }
    const diff = diffDocuments(server, mine)
    expect(diff.pageSetup).toMatchObject({ type: 'setPageSetup' })
    expect(diff.content).toEqual([])
    expect(apply(server, mine)).toEqual(mine)
  })

  it('ignores key order when comparing nodes', () => {
    const server = doc([{ id: 'paragraph:a', text: 'hello' }])
    const mine = structuredClone(server)
    const [node] = mine.content
    if (node.type !== 'paragraph') throw new Error('test setup: expected a paragraph')
    mine.content = [{ content: node.content, type: node.type, id: node.id }]
    expect(diffDocuments(server, mine).content).toEqual([])
  })
})

describe('diffTransactionGroups', () => {
  it('sends page setup alone first, then content in maxOps batches', () => {
    const server = doc([{ id: 'paragraph:a', text: 'a' }])
    const mine = structuredClone(server)
    mine.content = [...server.content, para('paragraph:b', 'b'), para('paragraph:c', 'c')]
    mine.metadata.pageSetup = { ...mine.metadata.pageSetup, columns: mine.metadata.pageSetup.columns === 1 ? 2 : 1 }
    const groups = diffTransactionGroups(diffDocuments(server, mine), 1)
    expect(groups[0]).toHaveLength(1)
    expect(groups[0][0]).toMatchObject({ type: 'setPageSetup' })
    expect(groups.slice(1).every((group) => group.length <= 1)).toBe(true)
    expect(groups.flat()).toHaveLength(3)
  })

  it('groups an empty diff to nothing', () => {
    const server = doc([{ id: 'paragraph:a', text: 'a' }])
    expect(diffTransactionGroups(diffDocuments(server, structuredClone(server)), 1000)).toEqual([])
  })
})
