import type { ReactNode } from 'react'

const audiences = [
  ['For learners', 'Make sense of difficult ideas at your own pace.'],
  ['For self-directed explorers', 'Follow a question as far as your curiosity takes it.'],
  ['For researchers', 'Keep observations, sources, and new possibilities connected.'],
] as const

function Frame({ children }: { children: ReactNode }) {
  return <section className="mx-auto grid max-w-[78rem] gap-[clamp(3rem,8vw,7rem)] bg-canvas px-4 py-[clamp(4.5rem,10vw,8rem)] sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.82fr)] lg:items-center" id="learners" aria-labelledby="thinking-audience-heading">{children}</section>
}

function AudienceList() {
  return (
    <div className="min-w-0">
      <h2 id="thinking-audience-heading" className="m-0 max-w-[15rem] font-display text-[clamp(2.5rem,6vw,4.75rem)] font-normal leading-[0.96] tracking-[-0.06em] text-foreground">Built for how you think</h2>
      <p className="mb-0 mt-6 max-w-[30rem] text-base leading-[1.6] text-muted">The best place to begin is the thought you already have.</p>
      <ul className="mb-0 mt-10 grid list-none gap-7 p-0">
        {audiences.map(([title, description]) => <li key={title} className="min-w-0"><h3 className="m-0 flex items-center gap-3 font-display text-[clamp(1.35rem,3vw,1.8rem)] font-normal leading-[1.15] tracking-[-0.035em] text-foreground"><span aria-hidden="true" className="text-[1.15rem] text-action">✳</span>{title}</h3><p className="mb-0 ml-8 mt-[0.85rem] max-w-[29rem] text-[0.95rem] leading-[1.6] text-muted">{description}</p></li>)}
      </ul>
    </div>
  )
}

function Quote() {
  return (
    <figure className="m-0 flex min-h-[22rem] flex-col justify-between border border-default bg-surface p-[clamp(1.75rem,5vw,3rem)] lg:min-h-[33rem]">
      <span aria-hidden="true" className="font-display text-[3rem] leading-[0.75] text-action">“</span>
      <blockquote className="my-auto max-w-[18rem] font-display text-[clamp(1.9rem,4vw,2.8rem)] font-normal leading-[1.08] tracking-[-0.045em] text-foreground">A question should be the start of something you can see, explore, and understand.</blockquote>
      <figcaption className="text-[0.7rem] font-bold uppercase tracking-[0.12em] text-subtle">The Incantly idea</figcaption>
    </figure>
  )
}

export const ThinkingAudience = { Frame, AudienceList, Quote }

export function IncantlyThinkingAudience() {
  return <ThinkingAudience.Frame><ThinkingAudience.AudienceList /><ThinkingAudience.Quote /></ThinkingAudience.Frame>
}
