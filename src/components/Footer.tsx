import { appHref } from '@/lib/app-url'
import LogoMark from './Logo'

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-top">
        <nav className="footer-links mono-label">
          <a href="#how">How it works</a>
          <span aria-hidden>·</span>
          <a href="#fields">Use cases</a>
          <span aria-hidden>·</span>
          <a href="#why">Why Incantly</a>
          <span aria-hidden>·</span>
          <a href={appHref('/auth?mode=signup')}>Sign up</a>
        </nav>
        <p className="footer-note">Built for the moment, gone when you’re done.</p>
      </div>

      <a className="footer-giant" href="#top" aria-label="Incantly — back to top">
        <LogoMark className="footer-giant-mark" />
        <span className="footer-giant-word">
          Incantly<span className="nav-logo-dot">.</span>
        </span>
      </a>

      <div className="footer-meta">
        <span>© 2026 Incantly</span>
        <span>Speak it into an interface.</span>
      </div>
    </footer>
  )
}
