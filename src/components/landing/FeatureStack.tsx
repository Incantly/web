'use client'

import { useEffect, useRef, useState } from 'react'

const features = [
  { slug: 'note', icon: '✎', title: 'Notes that go further', description: 'Capture a thought, organize your research, and keep building on it.' },
  { slug: 'research', icon: '⌕', title: 'Research in context', description: 'Ask a question and discover useful paths from the note you are in.' },
  { slug: 'visual', icon: '◇', title: 'Visuals made from your ideas', description: 'Turn a hard-to-picture thought into something you can actually see.' },
  { slug: 'experiment', icon: '✳', title: 'Experiments you can change', description: 'Explore an interactive scene and see how a change affects what happens.' },
  { slug: 'journal', icon: '☼', title: 'A journal of what you learned', description: 'Return to the questions, discoveries, and ideas that changed your mind.' },
] as const

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
    <section className={`feature-stack${isReady ? ' is-ready' : ''}${isRevealed ? ' is-revealed' : ''}`} id="ways-to-explore" ref={sectionRef} aria-labelledby="feature-stack-heading">
      <div className="feature-stack-intro">
        <h2 id="feature-stack-heading">One notebook. So many ways to follow an idea.</h2>
        <p>Everything grows from what you write.</p>
      </div>
      <div className="feature-stack-cards">
        {features.map((feature) => (
          <article className="feature-stack-card" data-feature={feature.slug} key={feature.title}>
            <span className="feature-stack-icon" aria-hidden="true">{feature.icon}</span>
            <h3>{feature.title}</h3>
            <p>{feature.description}</p>
          </article>
        ))}
      </div>
    </section>
  )
}
