import { describe, expect, it } from 'vitest'
import type { IncantlyDocument } from '@incantly/canvas-core/document'
import { incantlyDocumentToProseMirror, proseMirrorToIncantlyDocument } from './conversion'

const figure = {
  id: 'fig-job_1',
  type: 'figure',
  attrs: { figureId: 'job_1', sdkVersion: '0.2.0', title: 'Projectile motion', caption: 'A ball flies, drag and all.' },
}

const documentWithFigure = {
  schemaVersion: 2,
  id: 'doc_1',
  type: 'document',
  metadata: { title: 'Notes', language: 'en', tags: [], authors: [] },
  content: [
    { id: 'node_1', type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] },
    figure,
  ],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
} as unknown as IncantlyDocument

describe('figure conversion', () => {
  it('maps a canonical figure to the SDK node with its reference and display text', () => {
    const converted = incantlyDocumentToProseMirror(documentWithFigure)
    expect(converted.report.issues).toEqual([])
    expect(converted.value.content?.[1]).toEqual({
      type: 'incantlyFigure',
      attrs: {
        id: 'fig-job_1',
        figureId: 'job_1',
        sdkVersion: '0.2.0',
        concept: 'Projectile motion',
        description: 'A ball flies, drag and all.',
        meta: { generationId: 'job_1' },
      },
    })
  })

  it('round-trips a figure through the editor with its reference intact', () => {
    const pm = incantlyDocumentToProseMirror(documentWithFigure).value
    const back = proseMirrorToIncantlyDocument(pm)
    expect(back.report.unsupported).toBe(false)
    expect(back.value.content[1]).toEqual(figure)
  })

  it('persists the reference only: learner state and fragments never reach canonical JSON', () => {
    const pm = {
      type: 'doc',
      attrs: { schemaVersion: 2 },
      content: [{
        type: 'incantlyFigure',
        attrs: {
          id: 'fig-job_1', figureId: 'job_1', sdkVersion: '0.2.0', concept: 'Projectile motion',
          description: 'A ball flies.', values: { angle: 42 }, step: 2,
          fragments: { html: '<h>', css: 'c', js: 'j' }, fragmentsRef: 'sha256:abc', snapshotRef: 'sha256:def',
        },
      }],
    }
    const back = proseMirrorToIncantlyDocument(pm)
    expect(back.value.content).toEqual([{
      id: 'fig-job_1',
      type: 'figure',
      attrs: { figureId: 'job_1', sdkVersion: '0.2.0', title: 'Projectile motion', caption: 'A ball flies.' },
    }])
  })

  it('omits a figure missing its reference, with an issue, in both directions', () => {
    const broken = { ...figure, attrs: { title: 'No reference' } }
    const brokenDoc = { ...documentWithFigure, content: [broken] } as unknown as IncantlyDocument
    const forward = incantlyDocumentToProseMirror(brokenDoc)
    // The figure is omitted; the required empty paragraph takes its place.
    expect(forward.value.content?.map((node) => node.type)).toEqual(['paragraph'])
    expect(forward.report.issues.map((issue) => issue.code)).toContain('invalid_content')

    const pm = { type: 'doc', attrs: { schemaVersion: 2 }, content: [{ type: 'incantlyFigure', attrs: { id: 'fig-x', figureId: '', sdkVersion: '0.2.0' } }] }
    const back = proseMirrorToIncantlyDocument(pm)
    expect(back.value.content.map((node) => node.type)).toEqual(['paragraph'])
    expect(back.report.issues.map((issue) => issue.code)).toContain('invalid_content')
  })
})
