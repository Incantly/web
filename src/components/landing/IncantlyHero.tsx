import { Hero } from './Hero'

export function IncantlyHero() {
  return (
    <Hero.Frame>
      <Hero.Navigation />
      <div className="relative flex min-h-0 flex-col items-center px-[clamp(1.25rem,5vw,7rem)] pb-9 pt-5 sm:grid sm:min-h-[clamp(39rem,76svh,48rem)] sm:place-items-center sm:pb-[3.25rem] sm:pt-[2.25rem] lg:min-h-[clamp(42rem,80svh,50rem)] lg:grid-cols-[minmax(7rem,1fr)_minmax(0,64rem)_minmax(7rem,1fr)] lg:gap-x-[clamp(1rem,3vw,3rem)] lg:pt-8">
        <div className="hidden font-display text-[1.5rem] italic leading-[1.05] text-action lg:col-start-1 lg:mb-[clamp(4.5rem,8vw,7rem)] lg:block lg:max-w-[11rem] lg:justify-self-end lg:-rotate-[9deg]" aria-hidden="true">
          <span>Start with a thought</span>
          <svg className="mt-3 block h-auto w-[7.5rem] max-w-full" viewBox="0 0 140 48" focusable="false">
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
        <div className="hidden text-center font-display text-[1.5rem] italic leading-[1.05] text-action lg:col-start-3 lg:mt-[clamp(2rem,4vw,3.5rem)] lg:block lg:max-w-[11rem] lg:justify-self-start lg:rotate-[8deg]" aria-hidden="true">
          <svg className="mx-auto mb-3 block h-auto w-[7.5rem] max-w-full" viewBox="0 0 150 60" focusable="false">
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
