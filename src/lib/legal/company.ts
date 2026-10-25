/**
 * Who stands behind Incantly, as the legal pages state it. A null value renders as a visible
 * "to be confirmed" placeholder, so fill these in rather than editing the pages.
 */
export const legalEntity = {
  product: 'Incantly',
  company: 'Genesis HQ',
  /** Corporate Affairs Commission (CAC) registration: in progress. */
  registrationNumber: null as string | null,
  country: 'Nigeria',
  registeredAddress: null as string | null,
  privacyEmail: null as string | null,
  legalEmail: null as string | null,
  supportEmail: null as string | null,
  /** Article 27 GDPR / UK GDPR representatives, required while there is no EU or UK establishment. */
  euRepresentative: null as string | null,
  ukRepresentative: null as string | null,
  /** Courts for disputes not covered by mandatory consumer rules. */
  courts: 'the courts of Lagos State, Nigeria',
  minimumAge: 13,
  lastUpdated: '25 October 2026',
}
