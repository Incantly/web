import type { ReactNode } from 'react'

const audiences = [
  ['For learners', 'Make sense of difficult ideas at your own pace.'],
  ['For self-directed explorers', 'Follow a question as far as your curiosity takes it.'],
  ['For researchers', 'Keep observations, sources, and new possibilities connected.'],
] as const

function Frame({ children }: { children: ReactNode }) {
  return <section className="thinking-audience" id="learners" aria-labelledby="thinking-audience-heading">{children}</section>
}

function AudienceList() {
  return (
    <div className="thinking-audience-list">
      <h2 id="thinking-audience-heading">Built for how you think</h2>
      <p className="thinking-audience-intro">The best place to begin is the thought you already have.</p>
      <ul>
        {audiences.map(([title, description]) => <li key={title}><h3><span aria-hidden="true">✳</span>{title}</h3><p>{description}</p></li>)}
      </ul>
    </div>
  )
}

function Quote() {
  return (
    <figure className="thinking-audience-quote">
      <span aria-hidden="true">“</span>
      <blockquote>A question should be the start of something you can see, explore, and understand.</blockquote>
      <figcaption>The Incantly idea</figcaption>
    </figure>
  )
}

export const ThinkingAudience = { Frame, AudienceList, Quote }

export function IncantlyThinkingAudience() {
  return <ThinkingAudience.Frame><ThinkingAudience.AudienceList /><ThinkingAudience.Quote /></ThinkingAudience.Frame>
}
