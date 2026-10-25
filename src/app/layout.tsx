import type { Metadata } from 'next'
import { CookieConsent } from '../components/consent/CookieConsent'
import { pageMetadata, siteDescription, siteName, siteTitle, siteUrl } from '../lib/brand/siteMetadata'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: siteUrl,
  applicationName: siteName,
  ...pageMetadata({ title: siteTitle, description: siteDescription }),
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className="bg-canvas">
      <body className="min-w-[20rem] bg-canvas font-sans text-foreground antialiased">{children}<CookieConsent /></body>
    </html>
  )
}
