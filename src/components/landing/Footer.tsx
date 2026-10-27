import Image from 'next/image'
import Link from 'next/link'
import { CookieSettingsButton } from '../consent/CookieConsent'

const productLinks = [
  { label: 'Product', href: '/#product' },
  { label: 'How it works', href: '/#how-it-works' },
  { label: 'For learners', href: '/#learners' },
] as const

const companyLinks = [
  { label: 'About', href: '/#about' },
  { label: 'Contact', href: '/#contact' },
] as const

const legalLinks = [
  { label: 'Terms of Service', href: '/terms' },
  { label: 'Privacy Policy', href: '/privacy' },
  { label: 'Cookie Policy', href: '/cookies' },
] as const

const socialLinks = [
  {
    label: 'Incantly on X',
    href: 'https://x.com/Incantly',
    path: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z',
  },
  {
    label: 'Incantly on LinkedIn',
    href: 'https://www.linkedin.com/company/incantly/',
    path: 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.125 2.062 2.062 0 0 1 0 4.125zM7.119 20.452H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z',
  },
] as const

const linkClass = 'flex min-h-11 items-center text-foreground no-underline hover:underline'

export function IncantlyFooter() {
  return (
    <footer className="bg-canvas">
      <div className="mx-auto grid max-w-[76rem] gap-10 pl-[max(1.5rem,env(safe-area-inset-left))] pr-[max(1.5rem,env(safe-area-inset-right))] pt-[clamp(3rem,8vw,5rem)] lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div>
          <Link className="flex min-h-11 w-fit items-center gap-2 whitespace-nowrap font-display text-[clamp(1.75rem,4vw,2.25rem)] tracking-[-0.04em] text-foreground no-underline" href="/" aria-label="Incantly home">
            <Image src="/incantly-logo.svg" alt="" width={24} height={33} className="h-[2rem] w-auto" aria-hidden="true" /> incantly
          </Link>
          <p className="mt-3 text-base leading-[1.6] text-muted">Bring your notes to life.</p>
          <ul className="m-0 mt-2 flex list-none gap-1 p-0" aria-label="Social links">
            {socialLinks.map((social) => (
              <li key={social.label}>
                <a href={social.href} target="_blank" rel="noopener noreferrer" aria-label={social.label} className="flex size-11 items-center justify-center text-foreground hover:text-muted">
                  <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true"><path d={social.path} /></svg>
                </a>
              </li>
            ))}
          </ul>
        </div>
        <nav className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3 lg:grid-cols-[repeat(3,minmax(8rem,auto))] lg:gap-x-[clamp(3rem,6vw,6rem)] lg:gap-y-0" aria-label="Footer">
          <ul className="m-0 list-none p-0">
            {productLinks.map((link) => (
              <li key={link.label}>
                <Link href={link.href} className={linkClass}>{link.label}</Link>
              </li>
            ))}
          </ul>
          <ul className="m-0 list-none p-0">
            {companyLinks.map((link) => (
              <li key={link.label}>
                <Link href={link.href} className={linkClass}>{link.label}</Link>
              </li>
            ))}
          </ul>
          <ul className="m-0 list-none p-0">
            {legalLinks.map((link) => (
              <li key={link.label}>
                <Link href={link.href} className={linkClass}>{link.label}</Link>
              </li>
            ))}
            <li><CookieSettingsButton className={`${linkClass} cursor-pointer bg-transparent p-0 text-left`} /></li>
          </ul>
        </nav>
      </div>
      <div className="mx-auto mt-[clamp(3rem,10vw,6rem)] grid max-w-[76rem] gap-2 pb-[max(1.5rem,env(safe-area-inset-bottom))] pl-[max(1.5rem,env(safe-area-inset-left))] pr-[max(1.5rem,env(safe-area-inset-right))] lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <p className="m-0 text-[0.875rem] leading-[1.6] text-muted">© 2026 Genesis HQ. All rights reserved. Incantly is a product of Genesis HQ.</p>
        <p className="m-0 text-[0.875rem] leading-[1.6] text-muted lg:text-right">Made for curious minds.</p>
      </div>
    </footer>
  )
}
