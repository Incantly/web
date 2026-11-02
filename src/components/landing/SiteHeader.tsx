import Image from 'next/image'
import Link from 'next/link'
import { HeaderAccount } from './HeaderAccount'

const sections = [
  { label: 'Product', hash: '#product' },
  { label: 'How it works', hash: '#how-it-works' },
  { label: 'For learners', hash: '#learners' },
  { label: 'About', hash: '#about' },
] as const

const navLinkClass = 'text-foreground no-underline underline-offset-4 transition-[background-color,color,transform] duration-[180ms] hover:text-button hover:underline hover:decoration-button hover:decoration-wavy focus-visible:text-button focus-visible:underline focus-visible:decoration-button focus-visible:decoration-wavy aria-[current=page]:text-button aria-[current=page]:underline aria-[current=page]:decoration-button aria-[current=page]:decoration-wavy'

/**
 * The marketing header shared by the landing, pricing and legal pages, so they line up exactly.
 * On the landing page the section links scroll in place; elsewhere they lead back to it.
 */
export function SiteHeader({ current }: { current?: 'home' | 'pricing' }) {
  const home = current === 'home'
  return (
    <header className="flex min-h-[4.75rem] items-center justify-between gap-4 bg-canvas px-[clamp(1.25rem,4vw,5.5rem)] pb-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <Link className="flex min-h-11 flex-none items-center gap-2 whitespace-nowrap font-display text-[clamp(1.45rem,2vw,1.8rem)] tracking-[-0.055em] text-foreground no-underline" href={home ? '#top' : '/'} aria-label="Incantly home">
        <Image src="/incantly-logo.svg" alt="" width={24} height={33} className="h-[1.75rem] w-auto" aria-hidden="true" /> incantly
      </Link>

      <nav className="hidden items-center gap-[clamp(1.5rem,2.8vw,2.5rem)] text-[0.875rem] lg:flex" aria-label="Primary navigation">
        {sections.map((section) => <Link key={section.hash} className={navLinkClass} href={home ? section.hash : `/${section.hash}`}>{section.label}</Link>)}
        <Link className={navLinkClass} href="/pricing" aria-current={current === 'pricing' ? 'page' : undefined}>Pricing</Link>
      </nav>

      <div className="flex flex-none items-center gap-2 sm:gap-3">
        <HeaderAccount />
      </div>
    </header>
  )
}
