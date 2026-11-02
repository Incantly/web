import { eyebrowClass } from '../../lib/ui'
import { IntervalToggle } from './IntervalToggle'

/** Heading and the monthly/yearly switch. */
export function PricingHero() {
  return <section className="mx-auto max-w-[46rem] px-4 pb-[clamp(2rem,5vw,3rem)] pt-[clamp(2.5rem,7vw,5rem)] text-center" aria-labelledby="pricing-heading">
    <p className={`${eyebrowClass} text-accent`}>Pricing</p>
    <h1 id="pricing-heading" className="mt-3 font-display text-[clamp(2.5rem,7vw,4.5rem)] font-normal leading-[1] tracking-[-0.05em] text-foreground text-balance">Room for every idea you follow.</h1>
    <p className="mx-auto mt-5 max-w-[34rem] text-[clamp(1rem,1.5vw,1.125rem)] leading-[1.6] text-muted text-pretty">Start free. Upgrade when your notes, lectures and questions need more space to grow.</p>
    <div className="mt-8"><IntervalToggle /></div>
  </section>
}
