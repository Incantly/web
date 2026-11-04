import { describe, expect, it } from 'vitest'
import { buildShareRequest, canManageSharing, formatShareDate, GRANT_ROLES, isNoteOwner, isShareToken, roleDescription, roleLabel, sharedViewPath, validateShareEmail } from './sharingModel'

describe('roleLabel', () => {
  it('labels every display role', () => {
    expect(roleLabel('OWNER')).toBe('Owner')
    expect(roleLabel('EDITOR')).toBe('Editor')
    expect(roleLabel('COMMENTER')).toBe('Commenter')
    expect(roleLabel('VIEWER')).toBe('Viewer')
  })

  it('offers the grant roles most access first', () => {
    expect(GRANT_ROLES).toEqual(['EDITOR', 'COMMENTER', 'VIEWER'])
  })
})

describe('roleDescription', () => {
  it('summarises each role’s capabilities', () => {
    expect(roleDescription('OWNER')).toMatch(/manages sharing/)
    expect(roleDescription('EDITOR')).toMatch(/read, comment and edit/)
    expect(roleDescription('COMMENTER')).toMatch(/read and comment/)
    expect(roleDescription('VIEWER')).toMatch(/read only/)
  })
})

describe('isNoteOwner / canManageSharing', () => {
  const collaborators = { owner: { id: 'user:1', name: 'Ada', avatarUrl: null } }
  it('is true only for the owner id', () => {
    expect(isNoteOwner(collaborators, 'user:1')).toBe(true)
    expect(isNoteOwner(collaborators, 'user:2')).toBe(false)
    expect(isNoteOwner(null, 'user:1')).toBe(false)
    expect(isNoteOwner(undefined, 'user:1')).toBe(false)
  })

  it('lets only the owner manage sharing', () => {
    expect(canManageSharing(collaborators, 'user:1')).toBe(true)
    expect(canManageSharing(collaborators, 'user:2')).toBe(false)
    expect(canManageSharing(null, 'user:1')).toBe(false)
  })
})

describe('validateShareEmail', () => {
  it('accepts a plain address and trims it', () => {
    expect(validateShareEmail('ada@example.com')).toBeNull()
    expect(validateShareEmail('  ada@example.com  ')).toBeNull()
  })

  it.each([
    ['', /enter an email/i],
    ['   ', /enter an email/i],
    ['not-an-email', /valid email/i],
    ['ada@', /valid email/i],
    ['ada@example', /valid email/i],
    ['ada @example.com', /valid email/i],
    [`${'a'.repeat(250)}@ex.com`, /too long/i],
  ])('rejects %j', (email, pattern) => {
    expect(validateShareEmail(email)).toMatch(pattern)
  })
})

describe('buildShareRequest', () => {
  it('trims the address and keeps the uppercase role', () => {
    expect(buildShareRequest('  ada@example.com ', 'COMMENTER')).toEqual({ email: 'ada@example.com', role: 'COMMENTER' })
  })
})

describe('sharedViewPath', () => {
  it('builds the viewer path from the token', () => {
    expect(sharedViewPath('tok-abc')).toBe('/shared/tok-abc')
  })

  it('encodes tokens that are not URL-safe', () => {
    expect(sharedViewPath('tok/abc?x')).toBe('/shared/tok%2Fabc%3Fx')
  })
})

describe('isShareToken', () => {
  it('accepts non-empty route tokens only', () => {
    expect(isShareToken('tok-abc')).toBe(true)
    expect(isShareToken('')).toBe(false)
    expect(isShareToken('   ')).toBe(false)
    expect(isShareToken(undefined)).toBe(false)
    expect(isShareToken(null)).toBe(false)
    expect(isShareToken(42)).toBe(false)
  })
})

describe('formatShareDate', () => {
  it('formats a backend timestamp as a plain date', () => {
    expect(formatShareDate('2027-01-15T00:00:00.000Z')).not.toBe('Unknown date')
  })

  it('falls back for missing or unparseable values', () => {
    expect(formatShareDate(null)).toBe('Unknown date')
    expect(formatShareDate(undefined)).toBe('Unknown date')
    expect(formatShareDate('not-a-date')).toBe('Unknown date')
  })
})
