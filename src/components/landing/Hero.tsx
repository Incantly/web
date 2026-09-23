import Image from 'next/image'
import type { ReactNode } from 'react'

type HeroFrameProps = {
  children: ReactNode
}

function HeroFrame({ children }: HeroFrameProps) {
  return <section className="min-h-svh overflow-hidden bg-canvas" aria-labelledby="hero-heading">{children}</section>
}

function HeroNavigation() {
  return (
    <header className="flex min-h-[4.75rem] items-center justify-between gap-4 px-[clamp(1.25rem,4vw,5.5rem)] pb-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <a className="flex-none whitespace-nowrap font-display text-[clamp(1.45rem,2vw,1.8rem)] tracking-[-0.055em] text-foreground no-underline" href="#top" aria-label="Incantly home">
        <span aria-hidden="true" className="font-sans text-[0.8em] tracking-normal text-action">✳</span> incantly
      </a>

      <nav className="hidden items-center gap-[clamp(1.5rem,2.8vw,2.5rem)] text-[0.875rem] lg:flex" aria-label="Primary navigation">
        <a className="text-foreground no-underline transition-[background-color,color,transform] duration-[180ms] hover:text-action focus-visible:text-action" href="#product">Product</a>
        <a className="text-foreground no-underline transition-[background-color,color,transform] duration-[180ms] hover:text-action focus-visible:text-action" href="#how-it-works">How it works</a>
        <a className="text-foreground no-underline transition-[background-color,color,transform] duration-[180ms] hover:text-action focus-visible:text-action" href="#learners">For learners</a>
        <a className="text-foreground no-underline transition-[background-color,color,transform] duration-[180ms] hover:text-action focus-visible:text-action" href="#about">About</a>
      </nav>

      <a className="inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-[0.625rem] border border-default px-[0.9rem] py-2.5 text-[0.8125rem] text-foreground transition-[background-color,color,transform] duration-[180ms] hover:border-strong hover:bg-surface focus-visible:border-strong focus-visible:bg-surface sm:px-[1.15rem]" href="#get-started">Get started</a>
    </header>
  )
}

function HeroArtwork() {
  return (
    <div className="relative grid w-[clamp(18rem,31.5vw,24.75rem)] place-items-center sm:absolute sm:top-1" aria-hidden="true">
      <div className="absolute left-[-12%] top-[20%] font-display text-[clamp(1.1rem,2vw,1.5rem)] text-action motion-safe:animate-hero-drift">✦</div>
      <Image
        className="h-auto w-full bg-transparent"
        src="/hero-section-image.svg"
        alt=""
        width={1024}
        height={1024}
        priority
        sizes="(max-width: 639px) 288px, 396px"
      />
      <div className="absolute bottom-[26%] right-[-6%] font-display text-[clamp(1.1rem,2vw,1.5rem)] text-action motion-safe:animate-hero-drift-slow">✳</div>
    </div>
  )
}

function HeroContent() {
  return (
    <div className="relative z-[1] flex w-full max-w-[47rem] flex-col items-center pt-0 text-center sm:pt-[clamp(18.5rem,32vw,25.25rem)] lg:col-start-2 lg:row-start-1 lg:max-w-[64rem]">
      <h1 id="hero-heading" className="m-0 font-display text-[clamp(3rem,7vw,5.25rem)] font-normal leading-[0.96] tracking-[-0.06em] text-foreground text-balance">A notebook for everything <span className="lg:block">your ideas become.</span></h1>
      <p className="mt-6 max-w-[35rem] text-[clamp(1rem,1.5vw,1.125rem)] leading-[1.6] text-muted text-pretty sm:mt-7">
        Write a thought. Follow a question. Turn what you are learning into visuals
        and interactive experiences, all inside your notes.
      </p>
      <a className="mt-7 inline-flex min-h-12 min-w-[10.25rem] items-center justify-center rounded-[0.5625rem] bg-action text-[0.875rem] font-semibold text-inverse no-underline transition-[background-color,color,transform] duration-[180ms] hover:-translate-y-0.5 hover:bg-action-hover focus-visible:-translate-y-0.5 focus-visible:bg-action-hover" href="#get-started">Start exploring</a>
    </div>
  )
}

function HeroPossibilities() {
  return (
    <div className="flex flex-wrap justify-center gap-x-6 gap-y-3 px-5 pb-[max(2rem,env(safe-area-inset-bottom))] font-display text-[clamp(1.05rem,2vw,1.45rem)] text-foreground" aria-label="What you can do with Incantly">
      <span>Write</span>
      <span>Explore</span>
      <span>Visualize</span>
      <span>Experiment</span>
      <span>Understand</span>
    </div>
  )
}

export const Hero = {
  Frame: HeroFrame,
  Navigation: HeroNavigation,
  Artwork: HeroArtwork,
  Content: HeroContent,
  Possibilities: HeroPossibilities,
}
