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
    <footer className="bg-canvas">
      <div className="mx-auto grid max-w-[76rem] gap-10 pl-[max(1.5rem,env(safe-area-inset-left))] pr-[max(1.5rem,env(safe-area-inset-right))] pt-[clamp(3rem,8vw,5rem)] lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div>
          <a className="whitespace-nowrap font-display text-[clamp(1.75rem,4vw,2.25rem)] tracking-[-0.04em] text-foreground no-underline" href="#top" aria-label="Incantly home">
            <span aria-hidden="true">✳</span> incantly
          </a>
          <p className="mt-3 text-base leading-[1.6] text-muted">Bring your notes to life.</p>
        </div>
        <nav className="grid grid-cols-2 gap-x-8 gap-y-4 lg:grid-cols-[repeat(2,minmax(8rem,auto))] lg:gap-x-[clamp(3rem,6vw,6rem)] lg:gap-y-0" aria-label="Footer">
          <ul className="m-0 list-none p-0">
            {productLinks.map((link) => (
              <li key={link.label}>
                <a href={link.href} className="flex min-h-11 items-center text-foreground no-underline hover:underline">{link.label}</a>
              </li>
            ))}
          </ul>
          <ul className="m-0 list-none p-0">
            {companyLinks.map((link) => (
              <li key={link.label}>
                <a href={link.href} className="flex min-h-11 items-center text-foreground no-underline hover:underline">{link.label}</a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="mx-auto mt-[clamp(3rem,10vw,6rem)] grid max-w-[76rem] gap-2 pb-[max(1.5rem,env(safe-area-inset-bottom))] pl-[max(1.5rem,env(safe-area-inset-left))] pr-[max(1.5rem,env(safe-area-inset-right))] lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <p className="m-0 text-[0.875rem] leading-[1.6] text-muted">© 2026 Incantly. All rights reserved.</p>
        <p className="m-0 text-[0.875rem] leading-[1.6] text-muted lg:text-right">Made for curious minds.</p>
      </div>
    </footer>
  )
}
