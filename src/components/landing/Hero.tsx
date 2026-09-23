import Image from 'next/image'
import type { ReactNode } from 'react'

type HeroFrameProps = {
  children: ReactNode
}

function HeroFrame({ children }: HeroFrameProps) {
  return <section className="hero" aria-labelledby="hero-heading">{children}</section>
}

function HeroNavigation() {
  return (
    <header className="hero-nav">
      <a className="hero-brand" href="#top" aria-label="Incantly home">
        <span aria-hidden="true">✳</span> incantly
      </a>

      <nav className="hero-links" aria-label="Primary navigation">
        <a href="#product">Product</a>
        <a href="#how-it-works">How it works</a>
        <a href="#learners">For learners</a>
        <a href="#about">About</a>
      </nav>

      <a className="hero-nav-action" href="#get-started">Get started</a>
    </header>
  )
}

function HeroArtwork() {
  return (
    <div className="hero-artwork" aria-hidden="true">
      <div className="hero-artwork-float hero-artwork-float-start">✦</div>
      <Image
        className="hero-artwork-image"
        src="/incantly-original-hero.png"
        alt=""
        width={1024}
        height={1024}
        priority
        sizes="(max-width: 639px) 180px, 238px"
      />
      <div className="hero-artwork-float hero-artwork-float-end">✳</div>
    </div>
  )
}

function HeroContent() {
  return (
    <div className="hero-content">
      <h1 id="hero-heading">A notebook for everything your ideas become.</h1>
      <p className="hero-description">
        Write a thought. Follow a question. Turn what you are learning into visuals
        and interactive experiences, all inside your notes.
      </p>
      <a className="hero-action" href="#get-started">Start exploring</a>
    </div>
  )
}

function HeroPossibilities() {
  return (
    <div className="hero-possibilities" aria-label="What you can do with Incantly">
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
