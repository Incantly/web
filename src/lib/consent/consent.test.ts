import { describe, expect, it } from 'vitest'
import { acceptAll, allows, CONSENT_COOKIE, CONSENT_VERSION, parseConsent, rejectAll, serializeConsent } from './consent'

const record = (choices = acceptAll, version = CONSENT_VERSION) => ({ version, choices, decidedAt: '2026-10-25T12:00:00.000Z' })

describe('consent cookie', () => {
  it('round-trips a decision through the cookie string', () => {
    const choices = { preferences: true, analytics: false, marketing: true }
    const header = `other=1; ${CONSENT_COOKIE}=${serializeConsent(record(choices))}; theme=dark`
    expect(parseConsent(header)).toEqual(record(choices))
  })

  it('treats a missing, malformed, or outdated cookie as no decision', () => {
    expect(parseConsent('other=1')).toBeNull()
    expect(parseConsent(`${CONSENT_COOKIE}=not-json`)).toBeNull()
    expect(parseConsent(`${CONSENT_COOKIE}=${serializeConsent(record(acceptAll, CONSENT_VERSION - 1))}`)).toBeNull()
  })
})

describe('allows', () => {
  it('always allows necessary storage and refuses everything else without a decision', () => {
    expect(allows(null, 'necessary')).toBe(true)
    expect(allows(null, 'analytics')).toBe(false)
    expect(allows(null, 'marketing')).toBe(false)
  })

  it('follows the stored choices', () => {
    expect(allows(record(rejectAll), 'analytics')).toBe(false)
    expect(allows(record({ ...rejectAll, analytics: true }), 'analytics')).toBe(true)
  })

  it('refuses marketing under Global Privacy Control even after accept all', () => {
    expect(allows(record(acceptAll), 'marketing', true)).toBe(false)
    expect(allows(record(acceptAll), 'analytics', true)).toBe(true)
  })
})
