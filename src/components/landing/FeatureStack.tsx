'use client'

import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'

const features = [
  { slug: 'note', image: '/feature-note.svg', width: 720, height: 520, alt: 'A pencil captures a thought in a tabbed notebook, with research and a growing stem', title: 'Notes that go further', description: 'Capture a thought, organize your research, and keep building on it.' },
  { slug: 'research', image: '/feature-research.svg', width: 640, height: 460, alt: 'A note sends a trail toward an open reference book explored by a magnifying glass', title: 'Research in context', description: 'Ask a question and discover useful paths from the note you are in.' },
  { slug: 'visual', image: '/feature-visual.svg', width: 640, height: 420, alt: 'A tangled thought unwinds into a colorful imagined world', title: 'Visuals made from your ideas', description: 'Turn a hard-to-picture thought into something you can actually see.' },
  { slug: 'experiment', image: '/feature-experiment.svg', width: 560, height: 460, alt: 'A pendulum experiment with a slider changing the string length', title: 'Experiments you can change', description: 'Explore an interactive scene and see how a change affects what happens.' },
  { slug: 'journal', image: '/feature-journal.svg', width: 480, height: 440, alt: 'An open journal where a wandering thought becomes a clear spark', title: 'A journal of what you learned', description: 'Return to the questions, discoveries, and ideas that changed your mind.' },
] as const

const featureBg: Record<(typeof features)[number]['slug'], string> = {
  note: 'bg-feature-note',
  research: 'bg-feature-research',
  visual: 'bg-feature-visual',
  experiment: 'bg-feature-experiment',
  journal: 'bg-feature-journal',
}

export function IncantlyFeatureStack() {
  const sectionRef = useRef<HTMLElement>(null)
  const [isReady, setIsReady] = useState(false)
  const [isRevealed, setIsRevealed] = useState(false)

  useEffect(() => {
    const section = sectionRef.current
    if (!section || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    setIsReady(true)
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setIsRevealed(true)
        observer.disconnect()
      }
    }, { threshold: 0.18 })

    observer.observe(section)
    return () => observer.disconnect()
  }, [])

  return (
    <section className={`group scroll-mt-8 overflow-x-clip bg-canvas px-4 py-[clamp(4.5rem,10vw,8rem)] sm:px-8${isReady ? ' is-ready' : ''}${isRevealed ? ' is-revealed' : ''}`} id="ways-to-explore" ref={sectionRef} aria-labelledby="feature-stack-heading">
      <div className="mx-auto max-w-[43rem] text-center">
        <h2 id="feature-stack-heading" className="m-0 font-display text-[clamp(2.35rem,6vw,4.35rem)] font-normal leading-[0.98] tracking-[-0.055em] text-foreground text-balance">One notebook. So many ways to follow an idea.</h2>
        <p className="mt-4 text-base leading-[1.6] text-muted">Everything grows from what you write.</p>
      </div>
      <div className="mx-auto mt-[clamp(3.5rem,8vw,5.5rem)] grid max-w-[31rem] gap-[clamp(1.5rem,4vw,2.5rem)] md:max-w-[68rem] md:grid-cols-2 md:items-start">
        {features.map((feature) => (
          <article
            className={`min-w-0 p-[clamp(1.5rem,5vw,2.5rem)] transition-[opacity,transform] delay-0 duration-[520ms] odd:-rotate-[1.5deg] even:rotate-[1.75deg] nth-[2]:delay-[120ms] nth-[3]:delay-[240ms] nth-[4]:delay-[360ms] nth-[5]:delay-[480ms] motion-safe:group-[.is-ready:not(.is-revealed)]:opacity-0 motion-safe:group-[.is-ready:not(.is-revealed)]:odd:-translate-x-9 motion-safe:group-[.is-ready:not(.is-revealed)]:even:translate-x-9 md:nth-[5]:col-span-full md:nth-[5]:w-full md:nth-[5]:max-w-[33rem] md:nth-[5]:justify-self-center ${featureBg[feature.slug]}`}
            data-feature={feature.slug}
            key={feature.title}
          >
            <Image className="mb-6 h-auto w-full" src={feature.image} alt={feature.alt} width={feature.width} height={feature.height} sizes="(max-width: 767px) min(100vw - 3rem, 26rem), 30rem" />
            <h3 className="m-0 max-w-[24rem] font-display text-[clamp(1.65rem,4vw,2.3rem)] font-normal leading-[1.05] tracking-[-0.045em] text-foreground">{feature.title}</h3>
            <p className={`mb-0 mt-[0.65rem] max-w-[24rem] text-[0.9rem] leading-[1.55] ${feature.slug === 'experiment' ? 'text-foreground' : 'text-muted'}`}>{feature.description}</p>
          </article>
        ))}
      </div>
    </section>
  )
}
