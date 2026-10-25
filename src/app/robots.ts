import type { MetadataRoute } from 'next'
import { siteUrl } from '../lib/brand/siteMetadata'

/**
 * Everything public may be crawled. App screens and sign-in pages are kept out of results with a
 * noindex tag instead of a Disallow line, because crawlers can't see that tag on a blocked page.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/v1/'] },
    sitemap: new URL('/sitemap.xml', siteUrl).href,
    host: siteUrl.origin,
  }
}
