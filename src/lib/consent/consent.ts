/**
 * Cookie consent: what a visitor allowed, stored in one first-party cookie.
 *
 * Opt-in everywhere: nothing outside "necessary" runs until the visitor says yes. That satisfies
 * the EU ePrivacy Directive, UK PECR and the Nigeria Data Protection Act with one rule. Bump
 * CONSENT_VERSION when categories or their purposes change so everyone is asked again.
 */

export type ConsentCategory = 'necessary' | 'preferences' | 'analytics' | 'marketing'
export type OptionalCategory = Exclude<ConsentCategory, 'necessary'>
export type ConsentChoices = Record<OptionalCategory, boolean>
export type ConsentRecord = { version: number; choices: ConsentChoices; decidedAt: string }

export const CONSENT_VERSION = 1
export const CONSENT_COOKIE = 'incantly_consent'
/** Six months, within the EDPB/CNIL guidance of 6–13 months before asking again. */
export const CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 182

export const optionalCategories: OptionalCategory[] = ['preferences', 'analytics', 'marketing']
export const acceptAll: ConsentChoices = { preferences: true, analytics: true, marketing: true }
export const rejectAll: ConsentChoices = { preferences: false, analytics: false, marketing: false }

export function serializeConsent(record: ConsentRecord) {
  const { preferences, analytics, marketing } = record.choices
  return encodeURIComponent(JSON.stringify({ v: record.version, p: preferences ? 1 : 0, a: analytics ? 1 : 0, m: marketing ? 1 : 0, t: record.decidedAt }))
}

/** Reads the consent cookie out of a `document.cookie` string. Anything malformed or outdated counts as no decision. */
export function parseConsent(cookieHeader: string): ConsentRecord | null {
  const raw = cookieHeader.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${CONSENT_COOKIE}=`))
  if (!raw) return null
  try {
    const value = JSON.parse(decodeURIComponent(raw.slice(CONSENT_COOKIE.length + 1))) as Record<string, unknown>
    if (value.v !== CONSENT_VERSION || typeof value.t !== 'string') return null
    const flag = (key: string) => value[key] === 1
    return { version: CONSENT_VERSION, decidedAt: value.t, choices: { preferences: flag('p'), analytics: flag('a'), marketing: flag('m') } }
  } catch {
    return null
  }
}

/**
 * Whether a category may run. Necessary always may. Marketing is also refused while the browser
 * sends a Global Privacy Control signal, whatever the stored choice.
 */
export function allows(record: ConsentRecord | null, category: ConsentCategory, globalPrivacyControl = false) {
  if (category === 'necessary') return true
  if (category === 'marketing' && globalPrivacyControl) return false
  return record?.choices[category] ?? false
}

// Browser side: a tiny store so React and plain scripts see the same answer.

export const CONSENT_EVENT = 'incantly:consent'
export const OPEN_SETTINGS_EVENT = 'incantly:cookie-settings'

let cached: { header: string; record: ConsentRecord | null } | null = null

export function readConsent(): ConsentRecord | null {
  if (typeof document === 'undefined') return null
  const header = document.cookie
  if (cached?.header !== header) cached = { header, record: parseConsent(header) }
  return cached.record
}

export function saveConsent(choices: ConsentChoices) {
  const record: ConsentRecord = { version: CONSENT_VERSION, choices, decidedAt: new Date().toISOString() }
  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${CONSENT_COOKIE}=${serializeConsent(record)}; Path=/; Max-Age=${CONSENT_MAX_AGE_SECONDS}; SameSite=Lax${secure}`
  window.dispatchEvent(new CustomEvent<ConsentRecord>(CONSENT_EVENT, { detail: record }))
  return record
}

export function subscribeConsent(callback: () => void) {
  window.addEventListener(CONSENT_EVENT, callback)
  return () => window.removeEventListener(CONSENT_EVENT, callback)
}

export function hasGlobalPrivacyControl() {
  return typeof navigator !== 'undefined' && (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true
}

/** For analytics or marketing code: `if (hasConsent('analytics')) load()`, and listen for CONSENT_EVENT to load later. */
export function hasConsent(category: ConsentCategory) {
  return allows(readConsent(), category, hasGlobalPrivacyControl())
}

/** Opens the cookie settings panel from anywhere, such as a footer link. */
export function openCookieSettings() {
  window.dispatchEvent(new Event(OPEN_SETTINGS_EVENT))
}
