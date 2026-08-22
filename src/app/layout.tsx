import type { Metadata } from 'next'
import { Fraunces, Instrument_Sans, Space_Mono } from 'next/font/google'
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
  title: 'Incantly — Say it. See it. Use it.',
  description:
    'Incantly builds the interface you need, the moment you need it — a chart, a 3D model, a form, a live dashboard. Built for the moment, gone when you are done.',
  icons: { icon: '/favicon.svg' },
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${instrumentSans.variable} ${spaceMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  )
}
