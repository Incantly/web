import { describe, expect, it } from 'vitest'
import { bindingBody, bindingNotice, pickableSources } from './bindingModel'
import type { SourceRecord } from './model'

const current = (overrides: Partial<Parameters<typeof bindingBody>[0]> = {}) => ({
  type: 'AVAILABLE' as const, revisionPolicy: 'TRACK_LATEST' as const, pinnedSourceVersionId: null, priority: 0,
  source: { currentReadyVersionId: 'v2' }, ...overrides,
})

const source = (id: string, status: SourceRecord['status'] = 'READY'): SourceRecord => ({
  id, kind: 'FILE', title: id, status, sensitivity: 'PRIVATE', updatedAt: 0, stage: null, failureCode: null, partialReason: null, assetId: null,
})

describe('bindingBody', () => {
  it('keeps the other settings when one changes', () => {
    expect(bindingBody(current({ priority: 25 }), { type: 'PINNED' })).toEqual({ type: 'PINNED', revisionPolicy: 'TRACK_LATEST', priority: 25 })
  })

  it('pins the current ready version when keeping a version', () => {
    expect(bindingBody(current(), { revisionPolicy: 'PINNED_VERSION' })).toEqual({ type: 'AVAILABLE', revisionPolicy: 'PINNED_VERSION', priority: 0, pinnedSourceVersionId: 'v2' })
  })

  it('keeps an existing pin when the usage changes', () => {
    const pinned = current({ revisionPolicy: 'PINNED_VERSION', pinnedSourceVersionId: 'v1' })
    expect(bindingBody(pinned, { type: 'RELATED' })).toMatchObject({ type: 'RELATED', pinnedSourceVersionId: 'v1' })
    expect(bindingBody(pinned, { useNewest: true })).toMatchObject({ pinnedSourceVersionId: 'v2' })
  })

  it('never sends a version while tracking the latest', () => {
    const pinned = current({ revisionPolicy: 'PINNED_VERSION', pinnedSourceVersionId: 'v1' })
    expect(bindingBody(pinned, { revisionPolicy: 'TRACK_LATEST' })).not.toHaveProperty('pinnedSourceVersionId')
  })

  it('refuses to keep a version that does not exist yet', () => {
    expect(bindingBody(current({ source: { currentReadyVersionId: null } }), { revisionPolicy: 'PINNED_VERSION' })).toEqual({ error: expect.any(String) })
  })
})

describe('bindingNotice', () => {
  const binding = (status: SourceRecord['status'], overrides = {}) => ({
    revisionPolicy: 'TRACK_LATEST' as const, pinnedSourceVersionId: null,
    source: { id: 's', kind: 'FILE' as const, title: 's', status, currentReadyVersionId: 'v2' }, ...overrides,
  })

  it('warns when the source can no longer be used', () => {
    for (const status of ['ARCHIVED', 'DELETED', 'FAILED', 'QUARANTINED'] as const) expect(bindingNotice(binding(status))?.tone).toBe('warning')
    expect(bindingNotice(binding('PROCESSING'))?.tone).toBe('info')
  })

  it('offers the newest version only when a kept version is behind', () => {
    expect(bindingNotice(binding('READY'))).toBeNull()
    expect(bindingNotice(binding('READY', { revisionPolicy: 'PINNED_VERSION', pinnedSourceVersionId: 'v2' }))).toBeNull()
    expect(bindingNotice(binding('READY', { revisionPolicy: 'PINNED_VERSION', pinnedSourceVersionId: 'v1' }))?.canUseNewest).toBe(true)
  })
})

describe('pickableSources', () => {
  it('lists ready, unbound sources with the Space’s sources first', () => {
    const picked = pickableSources([source('a'), source('b'), source('c', 'ARCHIVED'), source('d', 'PROCESSING'), source('e')], ['a'], ['e'])
    expect(picked.map((item) => [item.id, item.inSpace])).toEqual([['e', true], ['b', false]])
  })
})
