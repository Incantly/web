import { describe, expect, it } from 'vitest'
import { pagePreview, withPageSetup, applyPageSetup, currentPageSetup, defaultUnit, formatLength, marginPresetOf, marginPresets, pageSize, parseLength } from './pageSetupModel'

const base = currentPageSetup(null)

describe('lengths', () => {
  it('shows points in the chosen unit and reads them back', () => {
    expect(formatLength(72, 'in')).toBe('1')
    expect(formatLength(72, 'cm')).toBe('2.54')
    expect(formatLength(72, 'pt')).toBe('72')
    expect(parseLength('2.54', 'cm')).toBe(72)
    expect(parseLength('1,5', 'in')).toBe(108)
  })

  it('rejects empty, negative and non-numeric input', () => {
    expect(parseLength('', 'cm')).toBeNull()
    expect(parseLength('-1', 'cm')).toBeNull()
    expect(parseLength('abc', 'in')).toBeNull()
  })

  it('picks inches for the US and centimetres elsewhere', () => {
    expect(defaultUnit('en-US')).toBe('in')
    expect(defaultUnit('en-GB')).toBe('cm')
    expect(defaultUnit(undefined)).toBe('cm')
  })
})

describe('applyPageSetup', () => {
  it('starts from the default page for a note without one', () => {
    expect(base).toMatchObject({ mode: 'continuous', size: 'a4', orientation: 'portrait', columns: 1 })
  })

  it('switches to landscape by swapping the page size', () => {
    const result = applyPageSetup(base, { orientation: 'landscape' })
    expect(result.ok && pageSize(result.setup).width).toBeGreaterThan(result.ok ? pageSize(result.setup).height : 0)
  })

  it('keeps the current size when switching to custom, and drops it for a named size', () => {
    const custom = applyPageSetup(base, { size: 'custom' })
    expect(custom).toMatchObject({ ok: true, setup: { size: 'custom', width: 595.28, height: 841.89 } })
    const letter = custom.ok ? applyPageSetup(custom.setup, { size: 'letter' }) : custom
    expect(letter.ok && 'width' in letter.setup).toBe(false)
  })

  it('refuses margins that leave no room for text', () => {
    expect(applyPageSetup(base, { margins: { left: 300, right: 300 } })).toEqual({ ok: false, error: expect.stringMatching(/no room/) })
    expect(applyPageSetup(base, { margins: { top: -1 } })).toEqual({ ok: false, error: expect.stringMatching(/negative/) })
  })

  it('refuses impossible page sizes, page numbers and column counts', () => {
    expect(applyPageSetup(base, { size: 'custom', width: 50, height: 800 }).ok).toBe(false)
    expect(applyPageSetup(base, { startingPageNumber: 0 }).ok).toBe(false)
    expect(applyPageSetup(base, { startingPageNumber: 1.5 }).ok).toBe(false)
    expect(applyPageSetup(base, { columns: 3 as 1 }).ok).toBe(false)
  })

  it('accepts a research-paper layout', () => {
    expect(applyPageSetup(base, { mode: 'paginated', size: 'letter', columns: 2, startingPageNumber: 5, mirroredMargins: true, margins: marginPresets.moderate.margins })).toMatchObject({
      ok: true, setup: { mode: 'paginated', size: 'letter', columns: 2, startingPageNumber: 5, mirroredMargins: true },
    })
  })
})

describe('marginPresetOf', () => {
  it('names a preset margin set and calls anything else custom', () => {
    expect(marginPresetOf(marginPresets.narrow.margins)).toBe('narrow')
    expect(marginPresetOf({ top: 72, right: 72, bottom: 72, left: 70 })).toBe('custom')
  })
})

describe('withPageSetup', () => {
  const metadata = { title: 'Paper', language: 'en', authors: [], tags: [], pageSetup: base }
  it('sets the page setup without inventing a layout', () => {
    const next = withPageSetup(metadata, { ...base, columns: 2 })
    expect(next.pageSetup.columns).toBe(2)
    expect('layout' in next).toBe(false)
  })
  it('keeps the default section of a layout in step', () => {
    const layout = { version: 1 as const, defaultSection: { id: 'main', pageSetup: base }, sections: [] }
    const next = withPageSetup({ ...metadata, layout }, { ...base, orientation: 'landscape' })
    expect(next.layout?.defaultSection.pageSetup.orientation).toBe('landscape')
  })
})

describe('pagePreview', () => {
  it('draws the page shape and its text area', () => {
    expect(pagePreview({ ...base, size: 'letter' })).toEqual({ aspectRatio: '612 / 792', inset: { top: '9.09%', right: '11.76%', bottom: '9.09%', left: '11.76%' } })
  })
})
