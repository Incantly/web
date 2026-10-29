import { describe, expect, it } from 'vitest'
import { searchForView, viewFromSearch } from './viewUrl'

describe('workspace view URL', () => {
  it('round-trips every kind of view', () => {
    for (const view of ['home', 'notes', 'spaces', 'library', 'search', 'space:sp_1', 'note:document:abc'] as const) {
      expect(viewFromSearch(searchForView(view)).view).toBe(view)
    }
  })

  it('keeps the Space a note was opened from', () => {
    const search = searchForView('note:document:abc', 'sp_1')
    expect(search).toBe('?note=document%3Aabc&space=sp_1')
    expect(viewFromSearch(search)).toEqual({ view: 'note:document:abc', noteSpaceId: 'sp_1' })
  })

  it('falls back to Home for empty or unknown values', () => {
    expect(viewFromSearch('')).toEqual({ view: 'home', noteSpaceId: null })
    expect(viewFromSearch('?view=admin').view).toBe('home')
    expect(viewFromSearch('?note=').view).toBe('home')
    expect(searchForView('home')).toBe('')
  })
})
