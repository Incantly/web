import { Hero } from './Hero'

export function IncantlyHero() {
  return (
    <Hero.Frame>
      <Hero.Navigation />
      <div className="relative flex min-h-0 w-full flex-1 flex-col items-center px-[clamp(1.25rem,5vw,7rem)] pb-9 pt-5 sm:pb-[3.25rem] sm:pt-[2.25rem] lg:pt-[clamp(5rem,12svh,18rem)]">
        <div className="hidden font-display text-[1.5rem] italic leading-[1.05] text-button lg:absolute lg:left-[clamp(4rem,11vw,14rem)] lg:top-[42%] lg:block lg:max-w-[11rem] lg:-rotate-[9deg]" aria-hidden="true">
          <span>Start with a thought</span>
          <svg className="mt-3 block h-auto w-[7.5rem] max-w-full" viewBox="0 0 140 48" focusable="false">
            <path
              d="M8 12 C 50 40, 95 40, 126 22"
              pathLength={1}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="motion-safe:[stroke-dasharray:1] motion-safe:animate-draw-left"
            />
            <path
              d="M112 13 L127 21 L117 33"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="motion-safe:animate-head-left"
            />
          </svg>
        </div>
        <Hero.Artwork />
        <Hero.Content />
        <div className="hidden text-center font-display text-[1.5rem] italic leading-[1.05] text-button lg:absolute lg:right-[clamp(4rem,10vw,13rem)] lg:top-[51%] lg:block lg:max-w-[11rem] lg:rotate-[8deg]" aria-hidden="true">
          <svg className="mx-auto mb-3 block h-auto w-[7.5rem] max-w-full" viewBox="0 0 150 60" focusable="false">
            <circle cx="14" cy="50" r="4" fill="currentColor" className="motion-safe:animate-head-right" />
            <path
              d="M14 50 C 55 8, 105 6, 134 36"
              pathLength={1}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="motion-safe:[stroke-dasharray:1] motion-safe:animate-draw-right"
            />
            <path
              d="M121 31 L134 36 L129 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="motion-safe:animate-head-right"
            />
          </svg>
          <span>See where it leads</span>
        </div>
      </div>
      <Hero.Possibilities />
    </Hero.Frame>
  )
}
