import type { MetadataRoute } from 'next'
import { siteUrl } from '../lib/brand/siteMetadata'
import { legalEntity } from '../lib/legal/company'

/** The public pages, for search engines. App screens are private and stay out. */
export default function sitemap(): MetadataRoute.Sitemap {
  const url = (path: string) => new URL(path, siteUrl).href
  const legalUpdated = new Date(legalEntity.lastUpdatedIso)
  return [
    { url: url('/'), lastModified: new Date(), changeFrequency: 'weekly', priority: 1 },
    { url: url('/terms'), lastModified: legalUpdated, changeFrequency: 'yearly', priority: 0.3 },
    { url: url('/privacy'), lastModified: legalUpdated, changeFrequency: 'yearly', priority: 0.3 },
    { url: url('/cookies'), lastModified: legalUpdated, changeFrequency: 'yearly', priority: 0.3 },
  ]
}
