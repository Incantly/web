'use client'

import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'

const audiences = [
  {
    description: [
      'Begin with the question you already have, even when it feels unfinished.',
      'Pull apart a difficult idea, connect it to notes you understand, and keep a clear trail back.',
      'Turn a confusing passage into a visual explanation you can revisit in your own time.',
      'Every small connection stays in one place, so learning starts to feel like progress.',
    ],
    image: '/audience-learners.svg',
    imageAlt: 'A hand-drawn learner note connecting a question to observations and possibilities.',
    name: 'For learners',
    slug: 'learners',
  },
  {
    description: [
      'Let a passing thought become a path you can actually follow.',
      'Open related notes, questions, and sources as your curiosity gives you a new direction.',
      'Move between ideas without losing the thread that made each discovery matter.',
      'Incantly keeps the side trails visible, so you can explore widely and still find your way back.',
    ],
    image: '/audience-explorers.svg',
    imageAlt: 'A hand-drawn explorer note branching into connected ideas and sources.',
    name: 'For self-directed explorers',
    slug: 'explorers',
  },
  {
    description: [
      'Keep source material, observations, and working questions beside the note where they began.',
      'Trace a claim back to its evidence, then make space for the patterns that appear between them.',
      'Build a living record of what changed your mind, what still needs testing, and what comes next.',
      'Your research becomes easier to return to, share, and grow without flattening its complexity.',
    ],
    image: '/audience-researchers.svg',
    imageAlt: 'A hand-drawn research note connecting sources, observations, and possible outcomes.',
    name: 'For researchers',
    slug: 'researchers',
  },
] as const

type Audience = (typeof audiences)[number]

function AudiencePanel({ audience }: { audience: Audience }) {
  return (
    <article className="grid w-full min-w-0 items-center gap-8 md:grid-cols-[minmax(0,0.84fr)_minmax(0,1fr)] md:gap-[clamp(2.5rem,8vw,7rem)]">
      <div className="min-w-0">
        <p className="m-0 text-[0.7rem] font-bold uppercase tracking-[0.12em] text-button">A place to begin</p>
        <h3 className="mb-0 mt-4 font-display text-[clamp(2.5rem,6vw,5rem)] font-normal leading-[0.96] tracking-[-0.06em] text-foreground">{audience.name}</h3>
        <p className="mb-0 mt-6 grid max-w-[31rem] gap-2 text-[clamp(1rem,1.7vw,1.2rem)] leading-[1.55] text-muted">
          {audience.description.map((line) => <span key={line}>{line}</span>)}
        </p>
      </div>
      <div className="mx-auto w-full max-w-[34rem] overflow-hidden bg-transparent p-[clamp(1rem,3vw,2rem)]">
        <Image className="h-auto w-full" src={audience.image} alt={audience.imageAlt} width={1024} height={1024} sizes="(max-width: 767px) calc(100vw - 4rem), (max-width: 1023px) 34rem, 42vw" />
      </div>
    </article>
  )
}

function MobileSequence() {
  return (
    <div className="mt-12 grid gap-16 lg:hidden">
      {audiences.map((audience) => <AudiencePanel key={audience.slug} audience={audience} />)}
    </div>
  )
}

const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1)
const easeInOut = (value: number) => value * value * (3 - 2 * value)

// Share of each audience's scroll segment spent handing off to the next one.
const HANDOFF = 0.4
const LIFT_REM = 1.25

function DesktopSequence() {
  const sectionRef = useRef<HTMLDivElement>(null)
  const panelRefs = useRef<(HTMLDivElement | null)[]>([])
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    const section = sectionRef.current
    if (!section) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const handoff = reduced ? 0.001 : HANDOFF

    let frame: number | undefined
    const updateAudience = () => {
      frame = undefined
      const travelDistance = Math.max(section.offsetHeight - window.innerHeight, 1)
      const progress = clamp01(-section.getBoundingClientRect().top / travelDistance) * audiences.length
      const last = audiences.length - 1

      panelRefs.current.forEach((panel, index) => {
        if (!panel) return
        // Leave over the end of this segment; arrive over the end of the previous one, slightly later.
        const leave = index === last ? 0 : easeInOut(clamp01((progress - (index + 1 - handoff)) / (handoff * 0.6)))
        const arrive = index === 0 ? 1 : easeInOut(clamp01((progress - (index - handoff * 0.6)) / (handoff * 0.6)))
        const opacity = Math.min(arrive, 1 - leave)
        const shift = leave > 0 ? -leave * LIFT_REM : (1 - arrive) * LIFT_REM
        panel.style.opacity = opacity.toFixed(3)
        panel.style.transform = reduced ? '' : `translate3d(0, ${shift.toFixed(3)}rem, 0)`
      })

      setActiveIndex(Math.min(last, Math.floor(Math.min(progress, audiences.length - 0.001) + handoff * 0.3)))
    }

    const onScroll = () => {
      if (frame === undefined) frame = window.requestAnimationFrame(updateAudience)
    }

    updateAudience()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame !== undefined) window.cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <div ref={sectionRef} className="relative mt-14 hidden min-h-[300svh] lg:block">
      <div className="sticky top-[max(1.5rem,env(safe-area-inset-top))] grid min-h-[min(42rem,calc(100svh-3rem))] place-items-center">
        {audiences.map((audience, index) => (
          <div
            key={audience.slug}
            ref={(node) => { panelRefs.current[index] = node }}
            className="col-start-1 row-start-1 w-full will-change-[opacity,transform]"
            style={{ opacity: index === 0 ? 1 : 0 }}
            aria-hidden={index !== activeIndex}
            inert={index !== activeIndex}
          >
            <AudiencePanel audience={audience} />
          </div>
        ))}
      </div>
    </div>
  )
}

export function IncantlyThinkingAudience() {
  return (
    <section className="bg-canvas px-4 py-[clamp(4.5rem,10vw,8rem)] sm:px-8" id="learners" aria-labelledby="thinking-audience-heading">
      <div className="mx-auto max-w-[78rem]">
        <div className="max-w-[37rem]">
          <h2 id="thinking-audience-heading" className="m-0 font-display text-[clamp(2.5rem,6vw,4.75rem)] font-normal leading-[0.96] tracking-[-0.06em] text-foreground">Built for how you think</h2>
          <p className="mb-0 mt-6 text-base leading-[1.6] text-muted">The best place to begin is the thought you already have.</p>
        </div>
        <MobileSequence />
        <DesktopSequence />
      </div>
    </section>
  )
}
