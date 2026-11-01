import { describe, expect, it } from 'vitest'
import { wordDiff, type DiffPart } from './wordDiff'

const join = (parts: DiffPart[], keep: DiffPart['kind']) => parts.filter((part) => part.kind === 'same' || part.kind === keep).map((part) => part.text).join('')

describe('wordDiff', () => {
  it('marks a replaced word as removed then added', () => {
    expect(wordDiff('The cat sat.', 'The dog sat.')).toEqual([
      { kind: 'same', text: 'The ' },
      { kind: 'removed', text: 'cat' },
      { kind: 'added', text: 'dog' },
      { kind: 'same', text: ' sat.' },
    ])
  })

  it('keeps unchanged text whole', () => {
    expect(wordDiff('Same text', 'Same text')).toEqual([{ kind: 'same', text: 'Same text' }])
    expect(wordDiff('', 'New')).toEqual([{ kind: 'added', text: 'New' }])
    expect(wordDiff('Old', '')).toEqual([{ kind: 'removed', text: 'Old' }])
  })

  it('rebuilds both versions from its parts', () => {
    const before = 'Photosynthesis turns light into energy.\nPlants need water.'
    const after = 'Photosynthesis turns sunlight into chemical energy.\nPlants also need water and CO2.'
    const parts = wordDiff(before, after)
    expect(join(parts, 'removed')).toBe(before)
    expect(join(parts, 'added')).toBe(after)
  })

  it('falls back to one removal and one addition for huge blocks', () => {
    const before = Array.from({ length: 600 }, (_, index) => `a${index}`).join(' ')
    const after = Array.from({ length: 600 }, (_, index) => `b${index}`).join(' ')
    const parts = wordDiff(before, after)
    expect(join(parts, 'removed')).toBe(before)
    expect(join(parts, 'added')).toBe(after)
  })
})
