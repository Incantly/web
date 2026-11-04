import { describe, expect, it } from 'vitest'
import {
  BASE_FONT_SIZE_PT,
  FONT_SIZE_MAX_PT,
  FONT_SIZE_MIN_PT,
  FONT_SIZE_PRESETS,
  fontSizeToCss,
  fontStackForKey,
  matchFontFamilyKey,
  parseFontSizeToPt,
} from './fonts'

describe('matchFontFamilyKey', () => {
  it('matches keys, labels, and stack members', () => {
    expect(matchFontFamilyKey('sans')).toBe('sans')
    expect(matchFontFamilyKey('Times New Roman')).toBe('times')
    expect(matchFontFamilyKey('Courier New')).toBe('mono')
  })

  it('matches a full CSS stack by its first family', () => {
    expect(matchFontFamilyKey('"Times New Roman", Times, serif')).toBe('times')
  })

  it('rejects unknown or empty families so the adapter omits them', () => {
    expect(matchFontFamilyKey('Comic Sans MS')).toBe(null)
    expect(matchFontFamilyKey('')).toBe(null)
  })
})

describe('fontStackForKey', () => {
  it('returns a non-empty system stack per key', () => {
    for (const key of ['sans', 'times', 'mono'] as const) {
      expect(fontStackForKey(key)).toMatch(/\S/)
    }
  })
})

describe('parseFontSizeToPt', () => {
  it('parses points, unitless numbers, and pixels', () => {
    expect(parseFontSizeToPt('12pt')).toBe(12)
    expect(parseFontSizeToPt('12')).toBe(12)
    expect(parseFontSizeToPt('16px')).toBe(12)
    expect(parseFontSizeToPt('10.5pt')).toBe(10.5)
  })

  it('rejects unknown units and out-of-range values so the adapter omits them', () => {
    expect(parseFontSizeToPt('1em')).toBe(null)
    expect(parseFontSizeToPt('0pt')).toBe(null)
    expect(parseFontSizeToPt('500pt')).toBe(null)
    expect(parseFontSizeToPt('huge')).toBe(null)
    expect(parseFontSizeToPt('')).toBe(null)
  })
})

describe('fontSizeToCss', () => {
  it('writes canonical points', () => {
    expect(fontSizeToCss(12)).toBe('12pt')
  })
})

describe('BASE_FONT_SIZE_PT', () => {
  it('is an integer inside the canonical gate', () => {
    expect(Number.isInteger(BASE_FONT_SIZE_PT)).toBe(true)
    expect(BASE_FONT_SIZE_PT).toBeGreaterThanOrEqual(FONT_SIZE_MIN_PT)
    expect(BASE_FONT_SIZE_PT).toBeLessThanOrEqual(FONT_SIZE_MAX_PT)
  })
})

describe('FONT_SIZE_PRESETS', () => {
  it('stays sorted inside the canonical gate', () => {
    expect(FONT_SIZE_PRESETS.length).toBeGreaterThan(0)
    const sorted = [...FONT_SIZE_PRESETS].sort((a, b) => a - b)
    expect([...FONT_SIZE_PRESETS]).toEqual(sorted)
    for (const size of FONT_SIZE_PRESETS) {
      expect(size).toBeGreaterThanOrEqual(FONT_SIZE_MIN_PT)
      expect(size).toBeLessThanOrEqual(FONT_SIZE_MAX_PT)
    }
  })
})
