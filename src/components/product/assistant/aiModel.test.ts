import { describe, expect, it } from 'vitest'
import type { AiJob, AnswerCitation } from '../../../lib/api/ai'
import { activitySteps, editsNotStored, answerBlocks, canRetry, chatModes, citationKind, citationLinks, stepsSummary, eventLabel, failureMessage, isGroundedAnswer, isNoteAssist, locatorLabel, modeRequest, paperByline, paperIds, resolveCitations, revealSegments, resolveMode, segmentAnswer, textLength, touchesApprovals } from './aiModel'

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
    expect(eventLabel({ type: 'STEP_STARTED', data: { step: 1 } })).toBe('Thinking…')
    expect(eventLabel({ type: 'STEP_COMPLETED', data: { steps: 2 } })).toBe('Thinking…')
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

describe('note assistant and approvals', () => {
  it('labels approval and tool events', () => {
    expect(eventLabel({ type: 'APPROVAL_REQUESTED', data: null })).toBe('Waiting for your OK…')
    expect(eventLabel({ type: 'REJECTED', data: null })).toBe('Continuing without that…')
    expect(eventLabel({ type: 'TOOL_WAITING', data: null })).toBe('Waiting on a tool…')
  })

  it('knows which events change the pending approvals', () => {
    expect(touchesApprovals({ type: 'APPROVAL_REQUESTED' })).toBe(true)
    expect(touchesApprovals({ type: 'APPROVAL_EXPIRED' })).toBe(true)
    expect(touchesApprovals({ type: 'STEP_STARTED' })).toBe(false)
  })

  it('recognises a note assistant result', () => {
    const job = { jobType: 'agent.note_assist', result: { answer: 'Tightened it.', citations: [], proposalIds: ['p1'] } } as unknown as AiJob
    expect(isNoteAssist(job)).toBe(true)
    expect(isGroundedAnswer(job)).toBe(false)
  })
})

describe('chat modes', () => {
  it('defaults to the note assistant on one note, and to cited answers elsewhere', () => {
    expect(resolveMode('NOTE', null).command).toBe('note.assist')
    expect(resolveMode('SPACE', null).command).toBe('ask')
    expect(resolveMode('LIBRARY', null).command).toBe('ask')
  })

  it('keeps a pick only while it is on offer', () => {
    expect(resolveMode('NOTE', 'ask').command).toBe('ask')
    expect(resolveMode('NOTE', 'practice').command).toBe('practice')
    expect(resolveMode('SPACE', 'note.assist').command).toBe('ask')
    expect(chatModes('SPACE').map((mode) => mode.command)).not.toContain('note.assist')
  })
})

describe('web search modes', () => {
  const base = { manifestId: 'm', evidenceId: 'E1', sourceId: null, noteId: null, page: null, startMs: null } as const
  const web: AnswerCitation = { ref: 'W1R2', ...base, kind: 'web', url: 'https://example.com/guide', title: 'A field guide' }
  const paper: AnswerCitation = {
    ref: 'W1R3', ...base, kind: 'web', url: 'https://example.com/paper', title: 'Attention Is All You Need',
    paper: { authors: ['Ashish Vaswani', 'Illia Polosukhin'], year: 2017, venue: 'NeurIPS', citedBy: 120_000, doi: '10.5555/3295222', arxivId: '1706.03762', pdfUrl: 'https://example.com/paper.pdf' },
  }

  it('maps each mode to its request: webSearch only for the web modes', () => {
    for (const kind of ['NOTE', 'SPACE', 'LIBRARY'] as const) {
      const modes = chatModes(kind)
      expect(modes.map((mode) => mode.key)).toEqual(kind === 'NOTE'
        ? ['note.assist', 'ask', 'web', 'papers', 'practice']
        : ['ask', 'web', 'papers', 'practice'])
      expect(new Set(modes.map((mode) => mode.key)).size).toBe(modes.length)
      expect(modeRequest(modes.find((mode) => mode.key === 'ask')!)).toEqual({ command: 'ask' })
      expect(modeRequest(modes.find((mode) => mode.key === 'web')!)).toEqual({ command: 'ask', webSearch: true, webScope: 'web' })
      expect(modeRequest(modes.find((mode) => mode.key === 'papers')!)).toEqual({ command: 'ask', webSearch: true, webScope: 'papers' })
    }
    const modes = chatModes('LIBRARY')
    expect(modeRequest(modes.find((mode) => mode.key === 'practice')!)).toEqual({ command: 'practice' })
  })

  it('resolves the web modes by key in every scope, and normal modes stop sending webSearch', () => {
    expect(resolveMode('NOTE', 'web').key).toBe('web')
    expect(resolveMode('SPACE', 'papers').key).toBe('papers')
    expect(resolveMode('LIBRARY', 'web').key).toBe('web')
    expect(resolveMode('NOTE', 'ask').key).toBe('ask')
    expect(modeRequest(resolveMode('NOTE', 'ask'))).not.toHaveProperty('webSearch')
    expect(resolveMode('SPACE', 'note.assist').key).toBe('ask')
  })

  it('routes citations to web, paper, note, source, or plain material', () => {
    expect(citationKind(web)).toBe('web')
    expect(citationKind(paper)).toBe('paper')
    expect(citationKind({ ...web, sourceId: 's1' })).toBe('source')
    expect(citationKind({ ...web, noteId: 'n1' })).toBe('note')
    expect(citationKind({ ref: 'S1E1', ...base })).toBe('material')
    // A stored library passage wins over a url: it is the user's material.
    expect(citationKind(web, { ref: 'W1R2', sourceId: 's1', noteId: null, page: null, startMs: null, endMs: null, headingPath: [], text: 't' })).toBe('source')
  })

  it('links only url and pdfUrl: doi and arXiv ids stay plain text', () => {
    expect(citationLinks(web)).toEqual({ href: 'https://example.com/guide' })
    expect(citationLinks(paper)).toEqual({ href: 'https://example.com/paper', pdfUrl: 'https://example.com/paper.pdf' })
    const links = citationLinks(paper)
    expect(JSON.stringify(links)).not.toContain('doi')
    expect(JSON.stringify(links)).not.toContain('arxiv')
    expect(citationLinks({ ...paper, sourceId: 's1' })).toEqual({})
    expect(citationLinks({ ref: 'S1E1', ...base })).toEqual({})
  })

  it('formats paper metadata as text', () => {
    expect(paperByline(paper.paper!)).toBe('Ashish Vaswani, Illia Polosukhin · 2017 · NeurIPS · Cited by 120,000')
    expect(paperIds(paper.paper!)).toBe('DOI 10.5555/3295222 · arXiv 1706.03762')
    expect(paperByline({})).toBeUndefined()
    expect(paperIds({})).toBeUndefined()
    expect(paperByline({ authors: ['Solo'] })).toBe('Solo')
  })

  it('words web allowance limits plainly, with no retry implied', () => {
    const finish = (reason: string) => activitySteps([], { type: 'TOOL_FINISHED', data: { step: 1, callId: 'w', tool: 'web_search', effect: 'read', outcome: 'failed', reason } })
    expect(finish('AI_WEB_RATE_LIMITED')[0]).toMatchObject({ state: 'failed', label: 'Couldn’t search the web', detail: 'Web search is busy right now' })
    expect(finish('AI_WEB_QUOTA_EXHAUSTED')[0]).toMatchObject({ state: 'failed', detail: 'Today’s free web searches are used up' })
  })
})

describe('activity steps', () => {
  const started = (callId: string, tool: string) => ({ type: 'TOOL_STARTED' as const, data: { step: 1, callId, tool, effect: 'read' } })
  const finished = (callId: string, tool: string, extra: Record<string, unknown>) => ({ type: 'TOOL_FINISHED' as const, data: { step: 1, callId, tool, effect: 'read', ...extra } })

  it('adds a running step, then finishes it with its counts', () => {
    let steps = activitySteps([], started('a', 'read_note_blocks'))
    expect(steps).toEqual([{ id: 'a', tool: 'read_note_blocks', state: 'running', label: 'Reading your note' }])
    steps = activitySteps(steps, started('b', 'knowledge_search'))
    steps = activitySteps(steps, finished('a', 'read_note_blocks', { outcome: 'ok', blocks: 2, totalBlocks: 2 }))
    steps = activitySteps(steps, finished('b', 'knowledge_search', { outcome: 'ok', evidence: 0, sufficiency: 'NOT_FOUND' }))
    expect(steps.map((step) => [step.state, step.label, step.detail])).toEqual([
      ['done', 'Read your note', '2 paragraphs'],
      ['done', 'Searched your material', 'nothing relevant'],
    ])
  })

  it('says plainly when a step was refused or failed', () => {
    const steps = activitySteps(activitySteps([], started('c', 'propose_note_edits')), finished('c', 'propose_note_edits', { outcome: 'refused', reason: 'UNKNOWN_BLOCK' }))
    expect(steps[0]).toMatchObject({ state: 'refused', label: 'Couldn’t prepare the edits' })
    expect(steps[0].detail).toBeUndefined()
    expect(stepsSummary(steps)).toBe('1 step · 1 didn’t work')
  })

  it('reads unknown tools as working and ignores other events', () => {
    const steps = activitySteps([], started('d', 'brand_new_tool'))
    expect(steps[0].label).toBe('Working')
    expect(activitySteps(steps, { type: 'STEP_STARTED', data: { step: 2 } })).toBe(steps)
    expect(activitySteps(steps, started('d', 'brand_new_tool'))).toBe(steps)
  })

  it('keeps a finished step whose start was missed', () => {
    expect(activitySteps([], finished('e', 'web_search', { outcome: 'ok', results: 5 }))).toEqual([{ id: 'e', tool: 'web_search', state: 'done', label: 'Searched the web', detail: '5 results' }])
    expect(stepsSummary([{ id: 'a', tool: 't', state: 'done', label: 'x' }, { id: 'b', tool: 't', state: 'done', label: 'y' }])).toBe('2 steps')
  })
})

describe('editsNotStored', () => {
  const step = (state: 'done' | 'refused' | 'failed' | 'running', tool = 'propose_note_edits') => ({ id: `${tool}-${state}`, tool, state, label: '' })
  it('flags a reply whose every edit attempt was refused', () => {
    expect(editsNotStored([], [step('done', 'read_note_blocks'), step('refused'), step('failed')])).toBe(true)
  })
  it('stays quiet when an edit was stored or never attempted', () => {
    expect(editsNotStored(['p1'], [step('refused'), step('done')])).toBe(false)
    expect(editsNotStored([], [step('refused'), step('done')])).toBe(false)
    expect(editsNotStored([], [step('done', 'read_note_blocks')])).toBe(false)
    expect(editsNotStored([], undefined)).toBe(false)
  })
})

describe('rich edit activity', () => {
  it('labels image lookups and explains refusals', () => {
    const images = activitySteps([], { type: 'TOOL_FINISHED', data: { callId: 'i', tool: 'list_images', outcome: 'ok', images: 3 } })
    expect(images[0]).toMatchObject({ label: 'Looked through your images', detail: '3 images' })
    const refused = activitySteps([], { type: 'TOOL_FINISHED', data: { callId: 'p', tool: 'propose_note_edits', outcome: 'refused', reason: 'invalid_math' } })
    expect(refused[0]).toMatchObject({ state: 'refused', label: 'Couldn’t prepare the edits', detail: 'the maths didn’t parse' })
    const unknown = activitySteps([], { type: 'TOOL_FINISHED', data: { callId: 'q', tool: 'propose_note_edits', outcome: 'refused', reason: 'brand_new' } })
    expect(unknown[0].detail).toBeUndefined()
  })
})
