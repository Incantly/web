import { describe, expect, it } from 'vitest'
import { answerBlocks, canRetry, eventLabel, failureMessage, locatorLabel, resolveCitations, revealSegments, segmentAnswer, textLength } from './aiModel'

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

describe('answerBlocks', () => {
  const blocks = (text: string, known: string[] = []) => answerBlocks(segmentAnswer(text, new Set(known)).segments)

  it('reads headings, paragraphs, lists and code fences', () => {
    const result = blocks('### What is a B-tree?\nA **B-tree** stores keys [S1E1].\n\n* **Root:** first page\n* Child pages\n\n1. One\n2. Two\n\n```\nSELECT 1\n```', ['S1E1'])
    expect(result.map((block) => block.kind)).toEqual(['heading', 'paragraph', 'list', 'list', 'code'])
    expect(result[0]).toEqual({ kind: 'heading', level: 3, content: [{ kind: 'text', text: 'What is a B-tree?' }] })
    expect(result[1]).toEqual({ kind: 'paragraph', content: [
      { kind: 'text', text: 'A ' }, { kind: 'strong', children: [{ kind: 'text', text: 'B-tree' }] }, { kind: 'text', text: ' stores keys' }, { kind: 'ref', ref: 'S1E1', index: 1 }, { kind: 'text', text: '.' },
    ] })
    expect(result[2]).toMatchObject({ kind: 'list', ordered: false, items: [[{ kind: 'strong' }, { kind: 'text', text: ' first page' }], [{ kind: 'text', text: 'Child pages' }]] })
    expect(result[3]).toMatchObject({ kind: 'list', ordered: true })
    expect(result[4]).toEqual({ kind: 'code', text: 'SELECT 1' })
  })

  it('handles emphasis and inline code without touching snake_case or lone asterisks', () => {
    expect(blocks('Use *care* and `a_b` in file_name_here, 2 * 3 = 6')[0]).toEqual({ kind: 'paragraph', content: [
      { kind: 'text', text: 'Use ' }, { kind: 'em', children: [{ kind: 'text', text: 'care' }] }, { kind: 'text', text: ' and ' }, { kind: 'code', text: 'a_b' }, { kind: 'text', text: ' in file_name_here, 2 * 3 = 6' },
    ] })
  })

  it('reads inline and display math, but leaves prices as text', () => {
    expect(blocks('Depth is $O(\\log n)$ and \\(x^2\\).')[0]).toEqual({ kind: 'paragraph', content: [
      { kind: 'text', text: 'Depth is ' }, { kind: 'math', tex: 'O(\\log n)' }, { kind: 'text', text: ' and ' }, { kind: 'math', tex: 'x^2' }, { kind: 'text', text: '.' },
    ] })
    expect(blocks('It costs $5 and $10 today.')[0]).toEqual({ kind: 'paragraph', content: [{ kind: 'text', text: 'It costs $5 and $10 today.' }] })
    expect(blocks('Before\n$$\na^2 + b^2\n$$\nAfter').map((block) => block.kind)).toEqual(['paragraph', 'math', 'paragraph'])
    expect(blocks('$$E = mc^2$$')[0]).toEqual({ kind: 'math', tex: 'E = mc^2' })
    expect(blocks('\\[\\frac{a}{b}\\]')[0]).toEqual({ kind: 'math', tex: '\\frac{a}{b}' })
  })

  it('leaves unclosed markers literal while an answer is still revealing', () => {
    expect(blocks('A **partial')[0]).toEqual({ kind: 'paragraph', content: [{ kind: 'text', text: 'A **partial' }] })
  })
})
