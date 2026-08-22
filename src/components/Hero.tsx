'use client'

import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import Link from 'next/link'
import { appHref } from '@/lib/app-url'
import DecodeText from './DecodeText'
import AppPreview from './AppPreview'

const PILLS = [
  { label: 'Dashboard', color: 'var(--accent-mint)', x: '10%', y: '31%', depth: 1, rot: -6 },
  { label: '3D model', color: 'var(--brand-violet)', x: '78%', y: '28%', depth: 0.7, rot: 5 },
  { label: 'Live chart', color: 'var(--accent-amber)', x: '6%', y: '47%', depth: 0.55, rot: 4 },
  { label: 'Moodboard', color: 'var(--accent-pink)', x: '75%', y: '59%', depth: 0.85, rot: -4 },
  { label: 'Form', color: 'var(--accent-blue)', x: '14%', y: '61%', depth: 0.6, rot: 6 },
]

const BLOBS = [
  { color: 'var(--accent-mint)', x: '33%', y: '12%', size: 64, depth: 1.6 },
  { color: 'var(--accent-pink)', x: '70%', y: '13%', size: 48, depth: 1.9 },
  { color: 'var(--accent-amber)', x: '18%', y: '79%', size: 56, depth: 1.7 },
  { color: 'var(--accent-blue)', x: '82%', y: '72%', size: 42, depth: 2.1 },
]

export default function Hero() {
  const ref = useRef<HTMLElement | null>(null)
  const [go, setGo] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setGo(true), 350)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    let raf = 0
    const onMove = (e: MouseEvent) => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const el = ref.current
        if (!el) return
        el.style.setProperty('--mx', String((e.clientX / window.innerWidth) * 2 - 1))
        el.style.setProperty('--my', String((e.clientY / window.innerHeight) * 2 - 1))
      })
    }
    window.addEventListener('mousemove', onMove)
    return () => {
      window.removeEventListener('mousemove', onMove)
      cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <section className={`hero${go ? ' hero--go' : ''}`} ref={ref} id="top">
      {BLOBS.map((b) => (
        <span
          key={b.color + b.x}
          className="hero-blob"
          style={
            {
              '--c': b.color,
              '--depth': b.depth,
              left: b.x,
              top: b.y,
              width: b.size,
              height: b.size * 0.55,
            } as CSSProperties
          }
        />
      ))}

      {PILLS.map((p, i) => (
        <span
          key={p.label}
          className="hero-pill"
          style={
            {
              '--c': p.color,
              '--depth': p.depth,
              '--rot': `${p.rot}deg`,
              '--float-delay': `${i * -1.3}s`,
              '--pop-delay': `${900 + i * 110}ms`,
              left: p.x,
              top: p.y,
            } as CSSProperties
          }
        >
          <span className="hero-pill-inner">
            <span className="hero-pill-dot" />
            {p.label}
          </span>
        </span>
      ))}

      <div className="hero-center">
        <p className="kicker">The generative interface</p>
        <h1 className="hero-headline">
          <DecodeText
            text="Say it. See it. Use it."
            start={go}
            stagger={140}
            baseDelay={150}
            accents={[4, 5]}
          />
        </h1>
        <p className="hero-sub">
          Incantly builds the interface you need, the moment you need it — no app to download, no
          dashboard to learn. Give it a question, a file, or a task, and it generates the exact tool
          that helps: a chart, a 3D model, a form, a live dashboard. Built for the moment, gone when
          you&apos;re done.
        </p>
        <div className="hero-ctas">
          <Link className="btn-primary" href={appHref('/auth?mode=signup')}>
            Try Incantly <span aria-hidden>→</span>
          </Link>
          <a className="link-mono" href="#how">
            See how it works ↓
          </a>
        </div>
      </div>

      <div className={`hero-shot${go ? ' hero-shot--go' : ''}`}>
        <AppPreview />
      </div>
    </section>
  )
}
