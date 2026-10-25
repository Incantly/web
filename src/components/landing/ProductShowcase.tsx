import type { ReactNode } from 'react'
import { Dithering } from '@paper-design/shaders-react'
import { eyebrowClass } from '../../lib/ui'
import { ShowcaseDemo } from './showcase/ShowcaseDemo'

type ProductShowcasePart = { children?: ReactNode }

function Frame({ children }: ProductShowcasePart) {
  return (
    <section className="scroll-mt-8 bg-canvas px-4 pb-20 pt-[clamp(4.5rem,10vw,8rem)] sm:px-8" id="product" aria-labelledby="product-heading">
      {children}
    </section>
  )
}

function Intro() {
  return (
    <div className="mx-auto max-w-[44rem] text-center">
      <p className={eyebrowClass}>Your ideas, in motion</p>
      <h2 id="product-heading" className="mt-3 font-display text-[clamp(2.25rem,6vw,4.25rem)] font-normal leading-[0.98] tracking-[-0.055em] text-foreground">Everything you need to follow an idea</h2>
      <p className="mx-auto mt-5 max-w-[30rem] text-base leading-[1.6] text-muted">Write it down, see where it leads, and keep every discovery connected.</p>
    </div>
  )
}

function Surface() {
  return (
    <ShowcaseDemo
      backdrop={
        <div aria-hidden="true" className="absolute inset-0 hidden opacity-90 motion-safe:block [mask-image:radial-gradient(115%_100%_at_50%_50%,black_55%,transparent_100%)]">
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
      }
    />
  )
}

function Caption() {
  return (
    <div className="mx-auto mt-10 grid max-w-[72rem] gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(16rem,28rem)] sm:items-start sm:gap-8">
      <h3 className="m-0 font-display text-[clamp(1.75rem,4vw,2.75rem)] font-normal leading-none tracking-[-0.05em] text-foreground">Your thoughts, still together.</h3>
      <p className="m-0 max-w-[32rem] text-base leading-[1.6] text-muted">Ask questions and build on what you already wrote. Every answer, visual, and experiment stays connected to the note that started it.</p>
    </div>
  )
}

export const ProductShowcase = { Frame, Intro, Surface, Caption }

export function IncantlyProductShowcase() {
  return (
    <ProductShowcase.Frame>
      <ProductShowcase.Intro />
      <ProductShowcase.Surface />
      <ProductShowcase.Caption />
    </ProductShowcase.Frame>
  )
}
