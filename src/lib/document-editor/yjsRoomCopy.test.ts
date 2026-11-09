import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { getSchema } from '@tiptap/core'
import type { Room } from '@liveblocks/client'

// IndexedDB is a browser API: the offline copy's persistence is replaced by one whose load the test controls.
const persistences: { name: string; load: () => void; destroyed: boolean }[] = []
vi.mock('y-indexeddb', () => {
  class IndexeddbPersistence {
    whenSynced: Promise<unknown>
    destroyed = false
    constructor(public name: string, public doc: Y.Doc) {
      let load = () => {}
      this.whenSynced = new Promise((resolve) => { load = () => resolve(this) })
      const entry = { name, load, destroyed: false }
      persistences.push(entry)
      Object.defineProperty(this, 'entry', { value: entry })
    }
    destroy() { (this as unknown as { entry: { destroyed: boolean } }).entry.destroyed = true; return Promise.resolve() }
    clearData() { return this.destroy() }
  }
  return { IndexeddbPersistence }
})
vi.mock('@liveblocks/yjs', () => ({
  LiveblocksYjsProvider: class {
    on() {}
    off() {}
    getStatus() { return 'loading' }
    destroy() {}
    clearOfflineData() { return Promise.resolve() }
  },
}))

const { createYjsNoteBinding, discardRoomCopies, editsSince, openYjsRoomCopy, YJS_TEXT_FIELD } = await import('./yjsBinding')
const { createIncantlyDocumentExtensions } = await import('./schema/extensions')
const { incantlyBlocksToProseMirror } = await import('./conversion')
const { prosemirrorJSONToYXmlFragment } = await import('y-prosemirror')
const { createDocument } = await import('@incantly/canvas-core/document')

const room = (id: string) => ({ id }) as unknown as Room
const schema = getSchema(createIncantlyDocumentExtensions({ collaboration: { document: new Y.Doc() } }))
const paragraph = (id: string, text: string) => ({ id, type: 'paragraph', content: [{ type: 'text', text }] }) as never

/** Writes canonical blocks into a doc the way the room holds them (what the offline copy loads). */
function seed(doc: Y.Doc, blocks: unknown[]) {
  const staging = new Y.Doc()
  prosemirrorJSONToYXmlFragment(schema, { type: 'doc', content: incantlyBlocksToProseMirror(blocks as never) }, staging.getXmlFragment(YJS_TEXT_FIELD))
  Y.applyUpdate(doc, Y.encodeStateAsUpdate(staging))
}

describe('room copy (instant editing before the first sync)', () => {
  afterEach(() => { persistences.length = 0 })

  it('reports its offline load as loaded only with content, empty otherwise', async () => {
    const full = openYjsRoomCopy('n', 'note:n:1')
    const blank = openYjsRoomCopy('n', 'note:n:2')
    seed(full.doc, [paragraph('p1', 'hello')])
    persistences[0]?.load(); persistences[1]?.load()
    await Promise.resolve(); await Promise.resolve()
    expect(full.offlineState()).toBe('loaded')
    expect(blank.offlineState()).toBe('empty')
    full.destroy(); blank.destroy()
  })

  it('opens only the offline database named after its own room ID, and keeps the trust decision', () => {
    const copy = openYjsRoomCopy('n', 'note:n:7', { offlineTrusted: true })
    expect(persistences.map((entry) => entry.name)).toEqual(['note:n:7'])
    expect(copy.offlineTrusted).toBe(true)
    expect(openYjsRoomCopy('n', 'note:n:8').offlineTrusted).toBe(false)
  })

  it('is never attached to a room with another ID', () => {
    const copy = openYjsRoomCopy('n', 'note:n:1')
    expect(() => createYjsNoteBinding('n', room('note:n:2'), { copy })).toThrow()
    copy.destroy()
    expect(() => createYjsNoteBinding('n', room('note:n:1'), { copy })).toThrow()
  })

  it('adoption keeps the doc and its ID, and hands local edits to the room callback (the copy guard stops)', () => {
    const copyGuard = vi.fn()
    const roomAck = vi.fn()
    const copy = openYjsRoomCopy('n', 'note:n:1', { onLocalUpdate: copyGuard })
    copy.writeTitle('Before')
    expect(copyGuard).toHaveBeenCalledTimes(1)
    const binding = createYjsNoteBinding('n', room('note:n:1'), { copy, onLocalUpdate: roomAck })
    expect(binding.id).toBe(copy.id)
    expect(binding.doc).toBe(copy.doc)
    binding.writeTitle('After')
    expect(copyGuard).toHaveBeenCalledTimes(1)
    expect(roomAck).toHaveBeenCalledTimes(1)
    binding.destroy()
  })

  it('turns what was typed after the offline load into carry-over edits against what loaded', async () => {
    const copy = openYjsRoomCopy('n', 'note:n:1')
    seed(copy.doc, [paragraph('p1', 'hello'), paragraph('p2', 'world')])
    persistences[0]?.load()
    await Promise.resolve(); await Promise.resolve()
    expect(copy.strandedEdits(schema)).toEqual([])
    // A local edit: the second block changes.
    const staging = new Y.Doc()
    prosemirrorJSONToYXmlFragment(schema, { type: 'doc', content: incantlyBlocksToProseMirror([paragraph('p2', 'world!')] as never) }, staging.getXmlFragment('x'))
    const replacement = (staging.getXmlFragment('x').toArray()[0] as Y.XmlElement).clone()
    copy.doc.transact(() => { copy.fragment.delete(1, 1); copy.fragment.insert(1, [replacement]) })
    const edits = copy.strandedEdits(schema)
    expect(edits).toHaveLength(1)
    expect(edits[0]?.operation.type).toBe('updateNode')
    expect((edits[0]?.head as { id: string } | null)?.id).toBe('p2')
    copy.destroy()
  })
})

describe('discardRoomCopies (access lost)', () => {
  it('destroys unadopted copies of that room ID with their offline data, and leaves other rooms alone', async () => {
    persistences.length = 0
    const lost = openYjsRoomCopy('n', 'note:n:1')
    const other = openYjsRoomCopy('m', 'note:m:1')
    await discardRoomCopies('note:n:1')
    expect(persistences[0]?.destroyed).toBe(true)
    expect(persistences[1]?.destroyed).toBe(false)
    expect(() => createYjsNoteBinding('n', room('note:n:1'), { copy: lost })).toThrow()
    other.destroy()
  })
})

describe('editsSince', () => {
  it('carries inserts, and updates or deletes with the block they were made against', () => {
    const base = { ...createDocument(), content: [paragraph('a', 'one'), paragraph('b', 'two')] }
    const current = { ...base, content: [paragraph('a', 'one!'), paragraph('c', 'three')] }
    const edits = editsSince(base as never, current as never)
    const byType = Object.fromEntries(edits.map((edit) => [edit.operation.type, edit]))
    expect((byType.updateNode?.head as { id: string } | null)?.id).toBe('a')
    expect((byType.deleteNode?.head as { id: string } | null)?.id).toBe('b')
    expect(byType.insertNode?.head).toBeNull()
  })
})
