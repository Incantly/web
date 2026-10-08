import type { Metadata } from 'next'
import { Fraunces, Instrument_Sans, Space_Mono } from 'next/font/google'
import ScrollRoot from '@/components/ScrollRoot'
import './globals.css'
import './landing.css'

const fraunces = Fraunces({
  variable: '--font-fraunces',
  subsets: ['latin'],
})

const instrumentSans = Instrument_Sans({
  variable: '--font-instrument',
  subsets: ['latin'],
})

const spaceMono = Space_Mono({
  variable: '--font-space',
  weight: ['400', '700'],
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Incantly — Your text, alive.',
  description:
    'Incantly brings your text to life — a live simulation on the page, on iPhone, iPad, Android, and tablets.',
  icons: { icon: '/favicon.svg' },
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${instrumentSans.variable} ${spaceMono.variable} antialiased`}
    >
      <body>
        <ScrollRoot>{children}</ScrollRoot>
      </body>
    </html>
  )
}
