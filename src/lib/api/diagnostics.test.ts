import { describe, expect, it } from 'vitest'
import { pathTemplate } from './diagnostics'

describe('pathTemplate', () => {
  it('replaces opaque ids with a placeholder', () => {
    expect(pathTemplate('/v1/notes/note%3A1/grants')).toBe('/v1/notes/:id/grants')
    expect(pathTemplate('/v1/notes/note:1/grants/grant:2')).toBe('/v1/notes/:id/grants/:id')
  })

  it('drops query strings', () => {
    expect(pathTemplate('/v1/notes?limit=25&cursor=c1')).toBe('/v1/notes')
  })

  it('always redacts share-link tokens, even all-letter ones', () => {
    expect(pathTemplate('/v1/shared/tok-abc123')).toBe('/v1/shared/:token')
    expect(pathTemplate('/v1/shared/abcdef')).toBe('/v1/shared/:token')
    expect(pathTemplate('/v1/shared/abcdef?x=1')).toBe('/v1/shared/:token')
  })
})
