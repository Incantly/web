import { describe, expect, it } from 'vitest'
import { commandGroups, matchScore, moveActive } from './commandSearchModel'
import type { NoteRecord, SourceRecord, SpaceRecord } from './model'

const note = (id: string, title: string, updatedAt = 0): NoteRecord => ({ id, title, updatedAt, spaceId: null, currentRevisionId: null })
const space = (id: string, name: string) => ({ id, name, status: 'ACTIVE' }) as SpaceRecord
const source = (id: string, title: string): SourceRecord => ({ id, kind: 'FILE', title, status: 'READY', sensitivity: 'PRIVATE', updatedAt: 0, stage: null, failureCode: null, partialReason: null, assetId: null })

const data = {
  notes: [note('n1', 'Cell biology lecture', 2), note('n2', 'Biology exam prep', 1), note('n3', 'Groceries', 3)],
  spaces: [space('s1', 'Biology')],
  sources: [source('f1', 'Molecular biology.pdf'), source('f2', 'Database Internals.pdf')],
}
const ids = (query: string) => commandGroups(query, data).map((group) => [group.id, group.items.map((item) => item.id)])

describe('matchScore', () => {
  it('ranks a leading match above a word match above a match anywhere', () => {
    expect(matchScore('Biology exam prep', 'bio')).toBeGreaterThan(matchScore('Cell biology lecture', 'bio'))
    expect(matchScore('Cell biology lecture', 'bio')).toBeGreaterThan(matchScore('Microbiology', 'bio'))
  })

  it('needs every word, in any order', () => {
    expect(matchScore('Cell biology lecture', 'lecture cell')).toBeGreaterThan(0)
    expect(matchScore('Cell biology lecture', 'cell exam')).toBe(0)
  })
})

describe('commandGroups', () => {
  it('shows recent notes and actions with no query', () => {
    expect(ids('')).toEqual([['recent', ['note:n3', 'note:n1', 'note:n2']], ['actions', ['action:new-note', 'action:new-space', 'action:add-source', 'action:settings']]])
  })

  it('puts the content search first, then name matches, then Ask AI and matching actions', () => {
    expect(ids('biology')).toEqual([
      ['content', ['content']],
      ['notes', ['note:n2', 'note:n1']],
      ['spaces', ['space:s1']],
      ['sources', ['source:f1']],
      ['actions', ['ask']],
    ])
  })

  it('offers no content search or Ask AI for a one-letter query', () => {
    expect(ids('g').map(([id]) => id)).toEqual(['notes', 'spaces', 'sources', 'actions'])
    expect(commandGroups('g', data).at(-1)?.items.some((item) => item.kind === 'ask')).toBe(false)
  })

  it('finds actions by their keywords', () => {
    expect(ids('upload').at(-1)).toEqual(['actions', ['ask', 'action:add-source']])
  })
})

describe('moveActive', () => {
  it('wraps around both ends', () => {
    expect(moveActive(2, 1, 3)).toBe(0)
    expect(moveActive(0, -1, 3)).toBe(2)
    expect(moveActive(0, 1, 0)).toBe(0)
  })
})
