import { Hero } from './Hero'

export function IncantlyHero() {
  return (
    <Hero.Frame>
      <Hero.Navigation />
      <div className="hero-stage">
        <div className="hero-side-note hero-side-note-start" aria-hidden="true">
          <span>Start with a thought</span>
          <svg className="hero-side-note-arrow" viewBox="0 0 140 48" focusable="false">
            <path
              d="M8 12 C 50 40, 95 40, 126 22"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeDasharray="6 6"
              strokeLinecap="round"
            />
            <path
              d="M112 13 L127 21 L117 33"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <Hero.Artwork />
        <Hero.Content />
        <div className="hero-side-note hero-side-note-end" aria-hidden="true">
          <svg className="hero-side-note-arrow" viewBox="0 0 150 60" focusable="false">
            <circle cx="14" cy="50" r="4" fill="currentColor" />
            <path
              d="M14 50 C 55 8, 105 6, 134 36"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeDasharray="1 7"
              strokeLinecap="round"
            />
            <path
              d="M121 31 L134 36 L129 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>See where it leads</span>
        </div>
      </div>
      <Hero.Possibilities />
    </Hero.Frame>
  )
}
