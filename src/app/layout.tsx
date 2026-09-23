import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Incantly — Bring your notes to life',
  description: 'Incantly turns notes into living learning environments.',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
