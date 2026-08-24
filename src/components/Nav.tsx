import LogoMark from './Logo'

export default function Nav() {
  return (
    <header className="nav nav--dark">
      <a className="nav-logo" href="#top">
        <LogoMark size={28} />
        <span>
          Incantly<span className="nav-logo-dot">.</span>
        </span>
      </a>
      <nav className="nav-links">
        <a className="nav-hash" href="#idea">
          The idea
        </a>
        <a className="nav-hash" href="#how">
          How it lives
        </a>
        <a className="nav-hash" href="#not-this">
          Not this
        </a>
        <a className="nav-hash" href="#faq">
          FAQ
        </a>
        <a className="nav-cta" href="#get-app">
          Get the app
        </a>
      </nav>
    </header>
  )
}
