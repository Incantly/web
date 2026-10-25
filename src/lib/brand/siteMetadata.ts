import type { Metadata } from 'next'

/** The public address that link previews and canonical URLs resolve against. */
export const siteUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://incantly.xyz')
export const siteName = 'Incantly'
export const siteTitle = 'Incantly — Bring your notes to life'
export const siteDescription = 'Incantly turns your notes into living learning environments. Ask questions, see ideas as interactive 3D visuals, and run simulations, all inside your notes.'

/**
 * Title, description and link-preview tags for one page. The preview image itself comes from the
 * nearest `opengraph-image` file, which Next.js adds to these tags.
 */
export function pageMetadata({ title, description, path }: { title: string; description: string; path?: string }): Metadata {
  return {
    title,
    description,
    // Without a path (the root layout) nothing sets a canonical URL that child pages would inherit.
    ...(path ? { alternates: { canonical: path } } : {}),
    openGraph: { type: 'website', siteName, locale: 'en_US', title, description, ...(path ? { url: path } : {}) },
    twitter: { card: 'summary_large_image', title, description },
  }
}
