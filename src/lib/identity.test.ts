import { describe, expect, it } from 'vitest'
import { displayName, firstName, greeting, initial } from './identity'

describe('identity helpers', () => {
  it('prefers the account name', () => {
    expect(displayName({ name: '  Ada Lovelace ', email: 'ada@example.com' })).toBe('Ada Lovelace')
    expect(firstName({ name: 'Ada Lovelace', email: 'ada@example.com' })).toBe('Ada')
  })
  it('falls back to the email local part when the name is empty', () => {
    expect(displayName({ name: '', email: 'grace.hopper@example.com' })).toBe('grace.hopper')
    expect(initial({ name: '', email: 'grace.hopper@example.com' })).toBe('G')
  })
  it('skips punctuation for the avatar initial', () => {
    expect(initial({ name: '“émile” zola', email: 'e@example.com' })).toBe('É')
    expect(initial({ name: '', email: '@' })).toBe('T')
  })
  it('greets by time of day', () => {
    expect(greeting(8)).toBe('Good morning')
    expect(greeting(13)).toBe('Good afternoon')
    expect(greeting(21)).toBe('Good evening')
  })
})
