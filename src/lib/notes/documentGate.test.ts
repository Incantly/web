import { describe, expect, it } from 'vitest'
import { loadDocument } from './documentGate'

const paragraph = { id: 'node_1', type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }
const pageSetup = { mode: 'continuous', size: 'a4', orientation: 'portrait', margins: { top: 72, right: 72, bottom: 72, left: 72 }, columns: 1 }
const envelope = {
  id: 'doc_1',
  type: 'document',
  metadata: { title: 'Notes', language: 'en', tags: [], authors: [], pageSetup },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('documentGate', () => {
  it('migrates a clean v1 note to v2 without reporting a repair', () => {
    const gate = loadDocument({ ...envelope, schemaVersion: 1, content: [paragraph] })
    expect(gate.ok).toBe(true)
    if (!gate.ok) return
    expect(gate.document.schemaVersion).toBe(2)
    expect(gate.document.content).toHaveLength(1)
    expect(gate.repaired).toBe(false)
  })

  it('loads a v2 note with a figure untouched', () => {
    const figure = { id: 'fig-job_1', type: 'figure', attrs: { figureId: 'job_1', sdkVersion: '0.2.0', title: 'Flight' } }
    const gate = loadDocument({ ...envelope, schemaVersion: 2, content: [paragraph, figure] })
    expect(gate.ok).toBe(true)
    if (!gate.ok) return
    expect(gate.repaired).toBe(false)
    expect(gate.document.content[1]).toEqual(figure)
  })

  it('still reports a repair when content was actually rewritten', () => {
    const gate = loadDocument({ ...envelope, schemaVersion: 1, content: [paragraph, { id: 'x', type: 'nope' }] })
    expect(gate.ok).toBe(true)
    if (!gate.ok) return
    expect(gate.repaired).toBe(true)
    expect(gate.document.content.map((node) => node.type)).toEqual(['paragraph'])
  })

  it('rejects what cannot be recovered', () => {
    expect(loadDocument({ nope: true }).ok).toBe(false)
  })
})
