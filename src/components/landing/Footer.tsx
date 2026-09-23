const productLinks = [
  { label: 'Product', href: '#product' },
  { label: 'How it works', href: '#how-it-works' },
  { label: 'For learners', href: '#learners' },
] as const

const companyLinks = [
  { label: 'About', href: '#about' },
  { label: 'Contact', href: '#contact' },
  { label: 'Privacy', href: '#privacy' },
] as const

export function IncantlyFooter() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <a className="footer-wordmark" href="#top" aria-label="Incantly home">
            <span aria-hidden="true">✳</span> incantly
          </a>
          <p>Bring your notes to life.</p>
        </div>
        <nav className="footer-nav" aria-label="Footer">
          <ul>
            {productLinks.map((link) => (
              <li key={link.label}>
                <a href={link.href}>{link.label}</a>
              </li>
            ))}
          </ul>
          <ul>
            {companyLinks.map((link) => (
              <li key={link.label}>
                <a href={link.href}>{link.label}</a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="footer-legal">
        <p>© 2026 Incantly. All rights reserved.</p>
        <p>Made for curious minds.</p>
      </div>
    </footer>
  )
}
