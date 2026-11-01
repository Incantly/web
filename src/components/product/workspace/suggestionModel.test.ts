import { describe, expect, it } from 'vitest'
import type { NoteProposal, ProposalChange } from '../../../lib/api/proposals'
import { decisionNotice, editorSuggestions, parseSuggestionKey, suggestionBlockId, suggestionCountLabel, suggestionKey } from './suggestionModel'

const change = (overrides: Partial<ProposalChange>): ProposalChange => ({ id: 'c1', kind: 'editText', state: null, undoable: false, nodeId: 'p1', baseText: 'old', text: 'new', ...overrides })

const proposal = (id: string, changes: ProposalChange[], overrides: Partial<NoteProposal> = {}): NoteProposal => ({
  id, jobId: 'j', noteId: 'n', status: 'PROPOSED', summary: 'Tightened the intro', fromUntrusted: false, baseRevisionNumber: 3,
  createdAt: '2026-10-31T10:00:00Z', expiresAt: null, changes, ...overrides,
})

describe('editorSuggestions', () => {
  it('lists only undecided changes, oldest proposal first', () => {
    const newest = proposal('p-new', [change({ id: 'c1' })])
    const oldest = proposal('p-old', [change({ id: 'c1', state: 'ACCEPTED' }), change({ id: 'c2', kind: 'deleteBlock' })], { fromUntrusted: true })
    expect(editorSuggestions([newest, oldest]).map((item) => [item.key, item.label, item.fromWeb])).toEqual([
      ['p-old:c2', 'Suggested removal', true],
      ['p-new:c1', 'Suggested edit', false],
    ])
  })

  it('counts new paragraphs in the label', () => {
    expect(editorSuggestions([proposal('p', [change({ kind: 'insertBlocks', nodeId: undefined, texts: ['a', 'b'], position: { afterNodeId: 'p1' } })])])[0].label).toBe('Suggested 2 new paragraphs')
  })
})

describe('suggestion keys', () => {
  it('round-trip a proposal and change id', () => {
    expect(parseSuggestionKey(suggestionKey('8d1f-uuid', 'c12'))).toEqual({ proposalId: '8d1f-uuid', changeId: 'c12' })
  })
  it('find the block to scroll to', () => {
    expect(suggestionBlockId(change({}))).toBe('p1')
    expect(suggestionBlockId(change({ nodeId: undefined, position: { beforeNodeId: 'p9' } }))).toBe('p9')
  })
})

describe('decisionNotice', () => {
  it('says what was applied and dismissed', () => {
    expect(decisionNotice({ changes: [{ id: 'c1', state: 'ACCEPTED' }, { id: 'c2', state: 'ACCEPTED' }] }, ['c1', 'c2'])).toEqual({ tone: 'done', text: '2 changes applied.', accepted: ['c1', 'c2'] })
    expect(decisionNotice({ changes: [{ id: 'c1', state: 'REJECTED' }] }, ['c1']).text).toBe('Suggestion dismissed.')
  })

  it('explains a stale change and ignores changes not decided now', () => {
    const notice = decisionNotice({ changes: [{ id: 'c1', state: 'STALE', reason: 'overlapping_edit' }, { id: 'c2', state: 'ACCEPTED' }] }, ['c1'])
    expect(notice.tone).toBe('warning')
    expect(notice.text).toMatch(/you edited the same words/)
    expect(notice.accepted).toEqual([])
  })

  it('pluralises the count', () => {
    expect(suggestionCountLabel(1)).toBe('1 suggested change')
    expect(suggestionCountLabel(4)).toBe('4 suggested changes')
  })
})

describe('rich suggestions', () => {
  const paragraph = (id: string, text: string) => ({ id, type: 'paragraph', content: [{ type: 'text', text }] })
  const list = { id: 'l1', type: 'bulletList', content: [] }

  it('maps replaceBlocks with checked blocks and labels it by its new content', () => {
    const change = { id: 'c1', kind: 'replaceBlocks', state: null, undoable: false, nodeIds: ['p1', 'p2'], baseTexts: ['a', 'b'], blocks: [list], texts: ['a\nb'] } as unknown as ProposalChange
    const [suggestion] = editorSuggestions([proposal('p', [change])], (blocks) => blocks as never)
    expect(suggestion).toMatchObject({ kind: 'replaceBlocks', nodeIds: ['p1', 'p2'], baseTexts: ['a', 'b'], label: 'Suggested rewrite as a list' })
    expect(suggestion.blocks).toEqual([list])
  })

  it('names a replacement by its main block, not a heading above it', () => {
    const change = { id: 'c1', kind: 'replaceBlocks', state: null, undoable: false, nodeIds: ['p1'], baseTexts: ['x'], blocks: [{ id: 'h', type: 'heading' }, list], texts: [] } as unknown as ProposalChange
    expect(editorSuggestions([proposal('p', [change])])[0].label).toBe('Suggested rewrite as a list')
    const plain = { ...change, blocks: [paragraph('n1', 'a'), paragraph('n2', 'b')] } as unknown as ProposalChange
    expect(editorSuggestions([proposal('p', [plain])])[0].label).toBe('Suggested rewrite')
  })

  it('calls a same-ID one-for-one replacement an edit', () => {
    const change = { id: 'c1', kind: 'replaceBlocks', state: null, undoable: false, nodeIds: ['p1'], baseTexts: ['old'], blocks: [paragraph('p1', 'new')], texts: ['new'] } as unknown as ProposalChange
    expect(editorSuggestions([proposal('p', [change])])[0].label).toBe('Suggested edit')
  })

  it('falls back to plain text when blocks fail the gate', () => {
    const change = { id: 'c1', kind: 'insertBlocks', state: null, undoable: false, position: { afterNodeId: 'p1' }, blocks: [{ type: 'table' }], texts: ['A | B'] } as unknown as ProposalChange
    const [suggestion] = editorSuggestions([proposal('p', [change])], () => null)
    expect(suggestion).toMatchObject({ kind: 'insertBlocks', label: 'Suggested new table', texts: ['A | B'] })
    expect(suggestion.blocks).toBeUndefined()
  })

  it('offers an unknown kind as a generic change with its text', () => {
    const change = { id: 'c9', kind: 'splitBlock', state: null, undoable: false, texts: ['one', 'two'] } as unknown as ProposalChange
    expect(editorSuggestions([proposal('p', [change])])[0]).toMatchObject({ kind: 'other', label: 'Suggested change', texts: ['one', 'two'] })
  })

  it('says a suggestion that no longer applies, plainly', () => {
    expect(decisionNotice({ changes: [{ id: 'c1', state: 'STALE', reason: 'invalid_now' }] }, ['c1'])).toMatchObject({ tone: 'warning', text: 'This suggestion no longer applies.' })
  })
})
