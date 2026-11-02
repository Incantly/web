import { WaitlistButton } from '../WaitlistButton'
import { signInOpen } from '../../lib/signIn'
import Image from 'next/image'
import type { ReactNode } from 'react'

type HeroFrameProps = {
  children: ReactNode
}

function HeroFrame({ children }: HeroFrameProps) {
  return (
    <section className="flex min-h-svh flex-col overflow-hidden bg-canvas" aria-labelledby="hero-heading">
      {children}
    </section>
  )
}

function HeroArtwork() {
  return (
    <div className="relative mb-2 grid w-[clamp(18rem,31.5vw,24.75rem)] place-items-center" aria-hidden="true">
      <Image
        className="h-auto w-full bg-transparent"
        src="/hero-section-image.svg"
        alt=""
        width={840}
        height={581}
        priority
        sizes="(max-width: 639px) 288px, 396px"
      />
      <div className="absolute bottom-[26%] right-[-6%] font-display text-[clamp(1.1rem,2vw,1.5rem)] text-button motion-safe:animate-hero-drift-slow [font-variant-emoji:text]">✳&#xFE0E;</div>
    </div>
  )
}

function HeroContent() {
  return (
    <div className="relative z-[1] flex w-full max-w-[47rem] flex-col items-center pt-0 text-center lg:max-w-[64rem]">
      <h1 id="hero-heading" className="m-0 font-display text-[clamp(3rem,7vw,5.25rem)] font-normal leading-[0.96] tracking-[-0.06em] text-foreground text-balance">A notebook for everything <span className="lg:block">your ideas can become.</span></h1>
      <p className="mt-6 max-w-[35rem] text-[clamp(1rem,1.5vw,1.125rem)] leading-[1.6] text-muted text-pretty sm:mt-7">
        Write a thought. Follow a question. Turn what you are learning into visuals
        and interactive experiences, all inside your notes.
      </p>
      <WaitlistButton className="mt-7 inline-flex min-h-12 min-w-[10.25rem] items-center justify-center rounded-[0.5625rem] bg-button text-[0.875rem] font-semibold text-inverse transition-[background-color,color,transform] duration-[180ms] hover:-translate-y-0.5 hover:bg-button-hover focus-visible:-translate-y-0.5 focus-visible:bg-button-hover">Join waitlist</WaitlistButton>
      {signInOpen() ? <p className="mt-4 text-sm text-muted">Already invited? <a className="inline-flex min-h-11 items-center font-semibold text-foreground underline-offset-4 hover:underline focus-visible:underline" href="/auth">Sign in</a></p> : null}
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
  Artwork: HeroArtwork,
  Content: HeroContent,
  Possibilities: HeroPossibilities,
}
