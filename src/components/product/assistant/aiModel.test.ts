import { describe, expect, it } from 'vitest'
import { canRetry, eventLabel, failureMessage, locatorLabel, resolveCitations, revealSegments, segmentAnswer, textLength } from './aiModel'

describe('segmentAnswer', () => {
  it('turns known refs into numbered markers and keeps unknown brackets as text', () => {
    const { segments, order } = segmentAnswer('Oxygen is released [S1E1]. See [note] and [S2E3, S1E1].', new Set(['S1E1', 'S2E3']))
    expect(order).toEqual(['S1E1', 'S2E3'])
    expect(segments).toEqual([
      { kind: 'text', text: 'Oxygen is released' },
      { kind: 'ref', ref: 'S1E1', index: 1 },
      { kind: 'text', text: '. See [note] and' },
      { kind: 'ref', ref: 'S2E3', index: 2 },
      { kind: 'ref', ref: 'S1E1', index: 1 },
      { kind: 'text', text: '.' },
    ])
  })

  it('leaves a group as text when any ref in it is unknown', () => {
    const { segments } = segmentAnswer('A [S1E1, X9]', new Set(['S1E1']))
    expect(segments).toEqual([{ kind: 'text', text: 'A [S1E1, X9]' }])
  })
})

describe('revealSegments', () => {
  const { segments } = segmentAnswer('Hello [A1] world', new Set(['A1']))
  it('cuts text at the budget and shows markers once reached', () => {
    expect(revealSegments(segments, 3)).toEqual([{ kind: 'text', text: 'Hel' }])
    expect(revealSegments(segments, 6)).toEqual([{ kind: 'text', text: 'Hello' }, { kind: 'ref', ref: 'A1', index: 1 }, { kind: 'text', text: ' ' }])
    expect(revealSegments(segments, textLength(segments))).toEqual(segments)
  })
})

describe('job copy', () => {
  it('labels progress events and ignores terminal ones', () => {
    expect(eventLabel({ type: 'STEP_STARTED', data: { step: 1 } })).toBe('Searching your material…')
    expect(eventLabel({ type: 'STEP_STARTED', data: { step: 2 } })).toBe('Writing…')
    expect(eventLabel({ type: 'WAITING_TURN', data: null })).toMatch(/Queued/)
    expect(eventLabel({ type: 'COMPLETED', data: null })).toBeNull()
    expect(eventLabel({ type: 'DEFERRED', data: { code: 'AI_PROVIDER_UNAVAILABLE' } })).toMatch(/unavailable/)
    expect(eventLabel({ type: 'DEFERRED', data: { code: 'AI_JOB_BUSY' } })).toMatch(/Busy/)
  })

  it('maps failure codes, falling back for unknown ones', () => {
    expect(failureMessage('AI_CONTEXT_TOO_LARGE')).toMatch(/Narrow/)
    expect(failureMessage('SOMETHING_NEW')).toBe('Something went wrong. Try again.')
    expect(failureMessage(null, 'EXPIRED')).toMatch(/too long/)
    expect(canRetry('AI_REFUSED')).toBe(false)
    expect(canRetry('AI_DEADLINE_EXHAUSTED')).toBe(true)
  })
})

describe('citations', () => {
  it('joins citations and passages in marker order', () => {
    const citation = { ref: 'S1E1', manifestId: 'm', evidenceId: 'E1', sourceId: 's1', noteId: null, page: 4, startMs: null }
    const passage = { ref: 'S1E1', sourceId: 's1', noteId: null, page: 4, startMs: null, endMs: null, headingPath: [], text: 'Oxygen.' }
    expect(resolveCitations(['S1E1'], [citation], [passage])).toEqual([{ ref: 'S1E1', index: 1, citation, passage }])
  })

  it('describes where a passage sits', () => {
    expect(locatorLabel({ page: 4, startMs: null })).toBe('Page 4')
    expect(locatorLabel({ page: null, startMs: 125_000 })).toBe('2:05')
    expect(locatorLabel({ page: null, startMs: null }, ['Cells', 'Mitochondria'])).toBe('Cells › Mitochondria')
    expect(locatorLabel({ page: null, startMs: null })).toBeNull()
  })
})
