import { describe, expect, it } from 'vitest'
import { ApiError } from '../../../lib/api/errors'
import type { EvidenceDto, IndexStatusDto } from '../../../lib/api/context'
import { formatTimestamp, groupEvidence, indexBadge, indexStillBuilding, locatorLabel, previewBanners, retryAfterSeconds, youtubeLink } from './contextModel'

const status = (overrides: Partial<IndexStatusDto>): IndexStatusDto => ({ lexicalReady: false, vectorReady: false, building: false, indexedVersion: 0, passageCount: 0, failureCode: null, ...overrides })

function evidence(id: string, citation: Partial<EvidenceDto['citation']>): EvidenceDto {
  return { evidenceId: id, text: `text ${id}`, tokenCount: 3, citation: { kind: 'SOURCE', noteId: null, noteRevisionId: null, sourceId: null, sourceVersionId: null, title: 'T', headingPath: [], blockId: 'b', endBlockId: 'b', page: null, startMs: null, endMs: null, sourceKind: null, assetId: null, locator: { type: 'BLOCK' }, ...citation } as EvidenceDto['citation'] }
}

describe('index badge', () => {
  it('maps index states to plain labels', () => {
    expect(indexBadge(status({ building: true }), 'note')?.label).toBe('Indexing')
    expect(indexBadge(status({ lexicalReady: true, passageCount: 1 }), 'note')).toMatchObject({ label: 'Keyword-ready', tone: 'ready' })
    expect(indexBadge(status({ lexicalReady: true, vectorReady: true, passageCount: 3 }), 'source')?.detail).toContain('3 passages')
    expect(indexBadge(status({ failureCode: 'X' }), 'note')?.tone).toBe('danger')
    expect(indexBadge(undefined, 'note')).toBeNull()
  })
  it('keeps polling only while building or not yet indexed', () => {
    expect(indexStillBuilding(status({ building: true, lexicalReady: true }))).toBe(true)
    expect(indexStillBuilding(status({}))).toBe(true)
    expect(indexStillBuilding(status({ lexicalReady: true }))).toBe(false)
    expect(indexStillBuilding(status({ failureCode: 'X' }))).toBe(false)
  })
})

describe('preview results', () => {
  it('explains not found, staleness, keyword-only and sensitivity honestly', () => {
    const texts = previewBanners({ manifestId: 'm', sufficiency: 'NOT_FOUND', degraded: true, stale: true, sensitivity: 'RESTRICTED', evidence: [] }).map((banner) => banner.text)
    expect(texts[0]).toMatch(/Nothing in this scope/)
    expect(texts.join(' ')).toMatch(/changed after it was indexed/)
    expect(texts.join(' ')).toMatch(/keyword only/)
    expect(texts.join(' ')).toMatch(/never sent to an external AI/)
    expect(previewBanners({ manifestId: 'm', sufficiency: 'SUFFICIENT', degraded: false, stale: false, sensitivity: 'PRIVATE', evidence: [] })).toEqual([])
  })
  it('groups passages by note or source in ranking order', () => {
    const groups = groupEvidence([
      evidence('E1', { sourceId: 's1', title: 'Handout' }),
      evidence('E2', { kind: 'SELECTION', noteId: 'n1', title: '' }),
      evidence('E4', { kind: 'NOTE', noteId: 'n1', title: 'Biology' }),
      evidence('E3', { sourceId: 's1' }),
    ])
    expect(groups.map((group) => [group.key, group.items.map((item) => item.evidenceId)])).toEqual([['source:s1', ['E1', 'E3']], ['note:n1', ['E2', 'E4']]])
    expect(groups[1].title).toBe('Biology')
    expect(groupEvidence([evidence('E5', { kind: 'NOTE', noteId: 'n2', title: '' })])[0].title).toBe('Untitled note')
  })
  it('labels locators', () => {
    expect(locatorLabel(evidence('E', { locator: { type: 'PAGE', page: 4 } }).citation)).toBe('Page 4')
    expect(locatorLabel(evidence('E', { locator: { type: 'TIME', startMs: 133_000 } }).citation)).toBe('2:13')
    expect(locatorLabel(evidence('E', { headingPath: ['Cells', 'Mitochondria'] }).citation)).toBe('Mitochondria')
    expect(formatTimestamp(3_725_000)).toBe('1:02:05')
  })
  it('builds YouTube links only from a bare video ID', () => {
    expect(youtubeLink('dQw4w9WgXcQ', 61_900)).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=61s')
    expect(youtubeLink('x" onclick=', 0)).toBeNull()
  })
  it('reads Retry-After from a 429', () => {
    expect(retryAfterSeconds(new ApiError(429, 'RATE_LIMITED', null, 2.2))).toBe(3)
    expect(retryAfterSeconds(new ApiError(429, 'RATE_LIMITED', null, null))).toBe(5)
    expect(retryAfterSeconds(new ApiError(422, 'X', null, null))).toBeNull()
  })
})
