import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Page not found — Incantly',
}

export default function NotFound() {
  return (
    <main className="flex min-h-svh flex-col bg-canvas">
      <header className="flex min-h-[4.75rem] items-center px-[clamp(1.25rem,4vw,5.5rem)] pb-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <Link className="inline-flex min-h-11 items-center gap-2 whitespace-nowrap font-display text-[clamp(1.45rem,2vw,1.8rem)] tracking-[-0.055em] text-foreground no-underline" href="/" aria-label="Incantly home">
          <Image src="/incantly-logo.svg" alt="" width={24} height={33} className="h-[1.75rem] w-auto" aria-hidden="true" /> incantly
        </Link>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center px-[clamp(1.25rem,5vw,7rem)] pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-6 text-center">
        <div className="flex flex-col items-center text-button" aria-hidden="true">
          <span className="-rotate-[4deg] font-display text-[clamp(1.25rem,3vw,1.5rem)] italic leading-[1.05]">This thought led nowhere</span>
          <svg className="mt-3 block h-auto w-[clamp(11rem,40vw,15rem)] max-w-full" viewBox="0 0 240 80" focusable="false">
            <path
              d="M10 24 C 50 64, 92 66, 110 40 C 124 18, 96 10, 92 30 C 88 50, 120 58, 150 50"
              pathLength={1}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="motion-safe:[stroke-dasharray:1] motion-safe:animate-draw-left"
            />
            <path
              d="M156 48 C 180 42, 204 44, 230 52"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray="0.5 9"
              className="opacity-60 motion-safe:animate-head-left"
            />
          </svg>
        </div>

        <h1 className="mt-8 font-display text-[clamp(2.5rem,7vw,4.5rem)] font-normal leading-[0.96] tracking-[-0.06em] text-foreground text-balance">Page not found</h1>
        <p className="mt-5 max-w-[30rem] text-[clamp(1rem,1.5vw,1.125rem)] leading-[1.6] text-muted text-pretty">
          The link may be old, or the page may have moved. Your notes are safe.
        </p>

        <div className="mt-8 flex w-full max-w-[22rem] flex-col gap-3 sm:w-auto sm:max-w-none sm:flex-row">
          <Link className="inline-flex min-h-12 min-w-[10.25rem] items-center justify-center rounded-[0.5625rem] bg-button px-5 text-[0.875rem] font-semibold text-inverse no-underline transition-[background-color,transform] duration-[180ms] hover:-translate-y-0.5 hover:bg-button-hover focus-visible:-translate-y-0.5 focus-visible:bg-button-hover motion-reduce:hover:translate-y-0 motion-reduce:focus-visible:translate-y-0" href="/">
            Back to home
          </Link>
          <Link className="inline-flex min-h-12 min-w-[10.25rem] items-center justify-center rounded-[0.5625rem] border border-default bg-canvas px-5 text-[0.875rem] font-semibold text-foreground no-underline transition-[background-color,border-color] duration-[180ms] hover:border-strong hover:bg-surface focus-visible:border-strong focus-visible:bg-surface" href="/workspace">
            Open workspace
          </Link>
        </div>

        <p className="mt-12 text-[0.8125rem] tracking-[0.08em] text-muted">Error 404</p>
      </div>
    </main>
  )
}
