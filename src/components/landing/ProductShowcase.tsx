import type { ReactNode } from 'react'
import { eyebrowClass } from '../../lib/ui'

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

function Tabs() {
  const linkClass =
    'inline-flex min-h-11 items-center border-b-2 border-transparent px-1 py-2 text-[0.8125rem] font-semibold text-subtle no-underline hover:border-button hover:text-button focus-visible:border-button focus-visible:text-button aria-[current=page]:border-button aria-[current=page]:text-button'
  return (
    <nav className="mx-auto mt-11 flex max-w-[72rem] flex-wrap justify-center gap-x-4 gap-y-1 border-b border-default" aria-label="Ways to work in Incantly">
      <a href="#product-notes" aria-current="page" className={linkClass}>Your notes</a>
      <a href="#product-context" className={linkClass}>Research with context</a>
      <a href="#product-visual" className={linkClass}>Make it visual</a>
      <a href="#product-simulation" className={linkClass}>Try a simulation</a>
    </nav>
  )
}

function Surface() {
  const sideLinkClass =
    'flex min-h-11 items-center gap-2 rounded-[0.4rem] px-2.5 py-2 text-[0.75rem] text-subtle no-underline hover:bg-surface hover:text-foreground focus-visible:bg-surface focus-visible:text-foreground'
  return (
    <div className="mx-auto mt-10 max-w-[78rem] rounded-[1.25rem] border border-default bg-surface p-[clamp(0.75rem,3vw,2rem)]">
      <div className="flex min-h-[38rem] overflow-hidden rounded-xl border border-default bg-raised" id="product-notes">
        <aside className="grid w-full content-start gap-3 border-b border-default p-5 sm:w-[13.5rem] sm:shrink-0 sm:border-b-0 sm:border-r sm:px-4 sm:py-6" aria-label="Incantly workspace">
          <div className="font-display text-[1.2rem] tracking-[-0.04em] text-foreground">incantly</div>
          <p className={`${eyebrowClass} mt-3`}>My space</p>
          <nav className="grid grid-cols-2 gap-1 sm:grid-cols-1" aria-label="Notes">
            <a href="#product-notes" className={`${sideLinkClass} bg-surface text-foreground`}>Search notes</a>
            <a href="#product-context" className={sideLinkClass}>Field notes</a>
            <a href="#product-visual" className={sideLinkClass}>Questions to explore</a>
            <a href="#product-simulation" className={sideLinkClass}>Saved visuals</a>
          </nav>
          <div className="mt-auto flex min-h-11 items-center gap-2 rounded-[0.4rem] px-2.5 py-2 text-[0.75rem] text-muted">
            <span aria-hidden="true" className="text-[1.2rem] leading-none">+</span>
            <span>New note</span>
          </div>
        </aside>

        <div className="min-w-0 flex-1 p-[clamp(1.25rem,4vw,3rem)] lg:p-[3.5rem_4rem]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className={eyebrowClass}>Field notes / Learning journal</p>
              <h3 className="mt-2 max-w-[38rem] font-display text-[clamp(1.7rem,4vw,3rem)] font-normal leading-none tracking-[-0.05em] text-foreground">Why do cities stay warm at night?</h3>
            </div>
            <button className="min-h-11 min-w-11 rounded-full border border-default bg-transparent tracking-[0.12em] text-muted" type="button" aria-label="More note options">•••</button>
          </div>
          <div className="mt-9 grid gap-6 sm:grid-cols-[minmax(0,1fr)_minmax(15rem,18rem)] sm:items-start">
            <article className="min-w-0">
              <p className="m-0 max-w-[38rem] text-[clamp(1.1rem,2vw,1.35rem)] leading-[1.55] text-muted">The pavement still felt warm after sunset. I wonder how concrete, trees, and moving air change what the neighborhood feels like.</p>
              <p className="mt-8 text-[0.75rem] text-subtle">A question to come back to</p>
              <div className="mt-6 grid gap-3" aria-hidden="true"><span className="block h-px bg-default" /><span className="block h-px w-[82%] bg-default" /><span className="block h-px w-[64%] bg-default" /></div>
            </article>
            <aside className="self-start rounded-xl border border-default bg-surface p-5 lg:p-6" aria-label="Incantly suggestions">
              <div className="text-[1.4rem] text-foreground" aria-hidden="true">✦</div>
              <p className={eyebrowClass}>Incantly can help</p>
              <p className="mt-3 text-[0.875rem] leading-[1.55] text-muted">Let&apos;s explore this together. Turn your observation into a visual comparison, find useful context, or experiment with a simple city scene.</p>
              <div className="mt-4 grid gap-2">
                <a href="#product-visual" className="flex min-h-11 items-center rounded-[0.4rem] border border-default px-3 py-2 text-[0.75rem] text-foreground no-underline hover:border-strong hover:bg-raised focus-visible:border-strong focus-visible:bg-raised">Create a visual</a>
                <a href="#product-simulation" className="flex min-h-11 items-center rounded-[0.4rem] border border-default px-3 py-2 text-[0.75rem] text-foreground no-underline hover:border-strong hover:bg-raised focus-visible:border-strong focus-visible:bg-raised">Explore with a simulation</a>
                <a href="#product-context" className="flex min-h-11 items-center rounded-[0.4rem] border border-default px-3 py-2 text-[0.75rem] text-foreground no-underline hover:border-strong hover:bg-raised focus-visible:border-strong focus-visible:bg-raised">Find related ideas</a>
              </div>
              <div className="mt-4 flex min-h-11 items-center justify-between gap-2 rounded-[0.4rem] border border-default px-3 py-2 text-[0.75rem] text-subtle" role="textbox" aria-label="Ask anything about this note">Ask anything about this note… <span aria-hidden="true" className="text-base text-foreground">↗</span></div>
            </aside>
          </div>
        </div>
      </div>
    </div>
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

export const ProductShowcase = { Frame, Intro, Tabs, Surface, Caption }

export function IncantlyProductShowcase() {
  return (
    <ProductShowcase.Frame>
      <ProductShowcase.Intro />
      <ProductShowcase.Tabs />
      <ProductShowcase.Surface />
      <ProductShowcase.Caption />
    </ProductShowcase.Frame>
  )
}
