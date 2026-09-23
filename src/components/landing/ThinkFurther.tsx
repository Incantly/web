import type { ReactNode } from 'react'
import Image from 'next/image'
import { eyebrowClass } from '../../lib/ui'

type Benefit = {
  title: string
  description: string
  image: string
  width: number
  height: number
  alt: string
}

const benefits: Benefit[] = [
  {
    title: 'Stay in your flow',
    description: 'Research a thought without losing the thread. Incantly keeps the conversation beside your notes.',
    image: '/think-further-flow.svg',
    width: 760,
    height: 480,
    alt: 'An open notebook filled with observations and a research question',
  },
  {
    title: 'See the idea clearly',
    description: 'Make a diagram or visual explanation from a question you are already exploring.',
    image: '/think-further-visual.svg',
    width: 760,
    height: 560,
    alt: 'A hand-drawn concept map flowing from an idea to connected observations',
  },
  {
    title: 'Try it for yourself',
    description: 'Turn a question into an interactive scene. Change what happens and see what you notice.',
    image: '/think-further-experiment.svg',
    width: 720,
    height: 560,
    alt: 'Hands arranging a small landscape in an open notebook',
  },
]

function Frame({ children }: { children: ReactNode }) {
  return <section className="scroll-mt-8 bg-canvas px-4 py-[clamp(4.5rem,10vw,8rem)] sm:px-8" id="how-it-works" aria-labelledby="think-further-heading">{children}</section>
}

function Heading() {
  return (
    <div className="mx-auto max-w-[46rem] text-center">
      <p className={eyebrowClass}>Think further</p>
      <h2 id="think-further-heading" className="mt-3 font-display text-[clamp(2.35rem,6vw,4.5rem)] font-normal leading-[0.98] tracking-[-0.06em] text-foreground text-balance">A little help when curiosity takes you somewhere new</h2>
    </div>
  )
}

function BenefitCard({ benefit }: { benefit: Benefit }) {
  return (
    <article className="grid min-w-0 items-center gap-7 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:gap-[clamp(2rem,9vw,6rem)] sm:even:[&>*:first-child]:col-start-2 sm:even:[&>*:first-child]:row-start-1 sm:even:[&>*:last-child]:col-start-1 sm:even:[&>*:last-child]:row-start-1 sm:even:[&>*:last-child]:justify-self-end">
      <div className="w-[min(100%,26rem)] justify-self-center overflow-hidden bg-raised [&>img]:block [&>img]:h-auto [&>img]:w-full">
        <Image src={benefit.image} alt={benefit.alt} width={benefit.width} height={benefit.height} sizes="(max-width: 767px) min(100vw - 4rem, 26rem), 24rem" />
      </div>
      <div className="max-w-[23rem]">
        <h3 className="m-0 font-display text-[clamp(1.8rem,4vw,2.6rem)] font-normal leading-[1.03] tracking-[-0.045em] text-foreground">{benefit.title}</h3>
        <p className="mt-[0.9rem] text-base leading-[1.6] text-muted">{benefit.description}</p>
      </div>
    </article>
  )
}

function Benefits() {
  return <div className="mx-auto mt-[clamp(3.5rem,8vw,6rem)] grid max-w-[60rem] gap-[clamp(3.75rem,10vw,7rem)]">{benefits.map((benefit) => <BenefitCard benefit={benefit} key={benefit.title} />)}</div>
}

export const ThinkFurther = { Frame, Heading, Benefits }

export function IncantlyThinkFurther() {
  return <ThinkFurther.Frame><ThinkFurther.Heading /><ThinkFurther.Benefits /></ThinkFurther.Frame>
}
