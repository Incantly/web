import { Dithering } from '@paper-design/shaders-react'
import { eyebrowClass } from '../../lib/ui'

export function IncantlyCloser() {
  return (
    <>
      <section className="mx-auto max-w-[46rem] scroll-mt-8 bg-canvas px-4 pb-[clamp(3.5rem,8vw,5.5rem)] pt-[clamp(4.5rem,10vw,7rem)] text-center" aria-labelledby="closer-heading">
        <p className={`${eyebrowClass} text-accent`}>A place for the next question</p>
        <h2 id="closer-heading" className="mt-3 font-display text-[clamp(2rem,6vw,3.75rem)] font-normal leading-[1.05] tracking-[-0.045em] text-foreground text-balance">The best part of a note is where it can take you next.</h2>
        <p className="mt-4 text-base leading-[1.6] text-muted">Keep following the thought.</p>
      </section>
      <section className="relative overflow-hidden bg-surface text-foreground" aria-labelledby="closer-band-heading">
        <div aria-hidden="true" className="absolute inset-0 hidden opacity-90 motion-safe:block">
          <Dithering
            speed={0.25}
            shape="warp"
            type="4x4"
            size={4}
            scale={1}
            frame={5929.724999967142}
            colorBack="#00000000"
            colorFront="#99CDFC"
            style={{ width: '100%', height: '100%' }}
          />
        </div>
        <div className="relative mx-auto grid max-w-[76rem] gap-[clamp(2rem,6vw,3rem)] py-[clamp(3.5rem,9vw,6rem)] pl-[max(1.5rem,env(safe-area-inset-left))] pr-[max(1.5rem,env(safe-area-inset-right))] lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-center">
          <div>
            <h2 id="closer-band-heading" className="m-0 font-display text-[clamp(2.25rem,7vw,4rem)] font-normal leading-[1.05] tracking-[-0.04em] text-balance">Your ideas deserve a place to grow.</h2>
            <p className="mt-5 max-w-[32rem] text-base leading-[1.6] text-muted">Start with a note. See what becomes possible when you can ask, make, and explore in the same space.</p>
            <a className="mt-7 inline-flex min-h-11 items-center rounded-xl bg-raised px-8 py-2.5 font-medium text-foreground no-underline hover:underline" href="#get-started">Get started</a>
          </div>
          <span className="self-end justify-self-end text-[clamp(7rem,24vw,10rem)] leading-[0.8] text-button lg:self-center lg:justify-self-center lg:text-[clamp(10rem,18vw,15rem)]" aria-hidden="true">✳</span>
        </div>
      </section>
    </>
  )
}
