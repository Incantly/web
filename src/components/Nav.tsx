import Link from 'next/link'
import { appHref } from '@/lib/app-url'
import LogoMark from './Logo'

export default function Nav() {
  return (
    <header className="nav">
      <a className="nav-logo" href="#top">
        <LogoMark size={28} />
        <span>
          Incantly<span className="nav-logo-dot">.</span>
        </span>
      </a>
      <nav className="nav-links">
        <a href="#how">How it works</a>
        <a href="#fields">Use cases</a>
        <a href="#why">Why Incantly</a>
        <Link className="nav-cta" href={appHref('/auth?mode=signup')}>
          Try Incantly
        </Link>
      </nav>
    </header>
  )
}
