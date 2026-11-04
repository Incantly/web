import { describe, expect, it } from 'vitest'
import { sharedLinkTitle, showsSharedLink } from './sharedLinkModel'

describe('showsSharedLink', () => {
  it('shows the link on a fresh link page', () => {
    expect(showsSharedLink('token-1', 'home', null)).toBe(true)
  })

  it('yields once the user opens a note or navigates away', () => {
    expect(showsSharedLink('token-1', 'note:abc', 'abc')).toBe(false)
    expect(showsSharedLink('token-1', 'trash', null)).toBe(false)
    expect(showsSharedLink('token-1', 'notes', null)).toBe(false)
  })

  it('never shows without a route token', () => {
    expect(showsSharedLink(undefined, 'home', null)).toBe(false)
  })
})

describe('sharedLinkTitle', () => {
  it('uses the payload title when present', () => {
    expect(sharedLinkTitle({ id: 'n1', title: '  Shared plan  ' }, 'fallback')).toBe('Shared plan')
  })

  it('falls back when the title is missing, blank, or misshapen', () => {
    expect(sharedLinkTitle({ id: 'n1' }, 'fallback')).toBe('fallback')
    expect(sharedLinkTitle({ title: '   ' }, 'fallback')).toBe('fallback')
    expect(sharedLinkTitle({ title: 42 }, 'fallback')).toBe('fallback')
    expect(sharedLinkTitle(null, 'fallback')).toBe('fallback')
    expect(sharedLinkTitle('nope', 'fallback')).toBe('fallback')
  })
})
