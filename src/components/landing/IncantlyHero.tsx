import { Hero } from './Hero'

export function IncantlyHero() {
  return (
    <Hero.Frame>
      <Hero.Navigation />
      <div className="hero-stage">
        <p className="hero-side-note hero-side-note-start" aria-hidden="true">
          Start with a thought
        </p>
        <Hero.Artwork />
        <Hero.Content />
        <p className="hero-side-note hero-side-note-end" aria-hidden="true">
          See where it leads
        </p>
      </div>
      <Hero.Possibilities />
    </Hero.Frame>
  )
}
