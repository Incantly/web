import type { ReactNode } from 'react'
import Image from 'next/image'

type Benefit = {
  title: string
  description: string
  image: string
  alt: string
}

const benefits: Benefit[] = [
  {
    title: 'Stay in your flow',
    description: 'Research a thought without losing the thread. Incantly keeps the conversation beside your notes.',
    image: '/think-further-flow.png',
    alt: 'An open notebook filled with observations and a research question',
  },
  {
    title: 'See the idea clearly',
    description: 'Make a diagram or visual explanation from a question you are already exploring.',
    image: '/think-further-visual.png',
    alt: 'A hand-drawn concept map flowing from an idea to connected observations',
  },
  {
    title: 'Try it for yourself',
    description: 'Turn a question into an interactive scene. Change what happens and see what you notice.',
    image: '/think-further-experiment.png',
    alt: 'Hands arranging a small landscape in an open notebook',
  },
]

function Frame({ children }: { children: ReactNode }) {
  return <section className="think-further" id="how-it-works" aria-labelledby="think-further-heading">{children}</section>
}

function Heading() {
  return (
    <div className="think-further-heading">
      <p className="section-eyebrow">Think further</p>
      <h2 id="think-further-heading">A little help when curiosity takes you somewhere new</h2>
    </div>
  )
}

function BenefitCard({ benefit }: { benefit: Benefit }) {
  return (
    <article className="think-further-card">
      <div className="think-further-image-wrap">
        <Image src={benefit.image} alt={benefit.alt} width={1024} height={1024} sizes="(max-width: 767px) min(100vw - 4rem, 20rem), 18rem" />
      </div>
      <div className="think-further-copy">
        <h3>{benefit.title}</h3>
        <p>{benefit.description}</p>
      </div>
    </article>
  )
}

function Benefits() {
  return <div className="think-further-grid">{benefits.map((benefit) => <BenefitCard benefit={benefit} key={benefit.title} />)}</div>
}

export const ThinkFurther = { Frame, Heading, Benefits }

export function IncantlyThinkFurther() {
  return <ThinkFurther.Frame><ThinkFurther.Heading /><ThinkFurther.Benefits /></ThinkFurther.Frame>
}
