import { legalEntity } from '../legal/company'
import { siteDescription, siteName, siteUrl, socialProfiles } from './siteMetadata'

/**
 * schema.org data describing Incantly to search engines: who makes it (Organization), the site
 * (WebSite, which gives Google its site name), and the product (SoftwareApplication). Company details
 * come from `legalEntity`, so filling in the address there updates this too.
 */

const url = (path: string) => new URL(path, siteUrl).href
const ids = { organization: url('/#organization'), website: url('/#website'), app: url('/#app') }

export function homeStructuredData() {
  const logo = { '@type': 'ImageObject', url: url('/apple-icon.png'), width: 180, height: 180 }
  const address = legalEntity.registeredAddress
    ? { '@type': 'PostalAddress', streetAddress: legalEntity.registeredAddress, addressCountry: 'NG' }
    : undefined
  const contacts = [
    legalEntity.supportEmail && { '@type': 'ContactPoint', contactType: 'customer support', email: legalEntity.supportEmail },
    legalEntity.privacyEmail && { '@type': 'ContactPoint', contactType: 'privacy', email: legalEntity.privacyEmail },
  ].filter(Boolean)

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': ids.organization,
        name: siteName,
        legalName: legalEntity.company,
        url: url('/'),
        logo,
        image: url('/opengraph-image'),
        description: siteDescription,
        ...(address ? { address } : {}),
        ...(contacts.length ? { contactPoint: contacts } : {}),
        ...(socialProfiles.length ? { sameAs: socialProfiles } : {}),
      },
      {
        '@type': 'WebSite',
        '@id': ids.website,
        name: siteName,
        alternateName: `${siteName} by ${legalEntity.company}`,
        url: url('/'),
        description: siteDescription,
        inLanguage: 'en',
        publisher: { '@id': ids.organization },
      },
      {
        '@type': 'SoftwareApplication',
        '@id': ids.app,
        name: siteName,
        url: url('/'),
        description: siteDescription,
        applicationCategory: 'EducationalApplication',
        operatingSystem: 'Web',
        image: url('/opengraph-image'),
        publisher: { '@id': ids.organization },
      },
    ],
  }
}

/** Serialises for a `<script type="application/ld+json">`, escaping `<` so content can't close the tag. */
export function jsonLd(data: unknown) {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}
