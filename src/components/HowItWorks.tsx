'use client'

import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import DecodeText from './DecodeText'

const CORNERS = [
  { n: '01', label: 'Bring anything', color: 'var(--brand-violet)', pos: 'tl' },
  { n: '02', label: 'It figures out what helps', color: 'var(--accent-mint)', pos: 'tr' },
  { n: '03', label: 'It pulls real data', color: 'var(--accent-pink)', pos: 'bl' },
  { n: '04', label: 'The interface appears', color: 'var(--accent-amber)', pos: 'br' },
]

const STEPS = [
  {
    n: '01',
    color: 'var(--brand-violet)',
    title: 'Bring anything',
    body: "A spoken request, an uploaded file, a question you're stuck on.",
  },
  {
    n: '02',
    color: 'var(--accent-mint)',
    title: 'It figures out what helps',
    body: 'Not a generic answer — the right form of answer. A visualization, a dashboard, a model, an action.',
  },
  {
    n: '03',
    color: 'var(--accent-pink)',
    title: 'It pulls real data',
    body: 'From your file, a live source, or the web — instead of guessing.',
  },
  {
    n: '04',
    color: 'var(--accent-amber)',
    title: 'The interface appears',
    body: "Ready to use. Explore it, edit it, ask follow-ups. When you're done, it's gone.",
  },
]

const INTENT_CHIPS = [
  { text: '“How do earthquakes work?”', color: 'var(--brand-violet)' },
  { text: 'finances_Q2.csv ↑ uploaded', color: 'var(--accent-mint)' },
  { text: '🎙 “order dinner for four”', color: 'var(--accent-amber)' },
]

const PROCESS_PILLS = ['◇ understanding the question', '◇ choosing the right form', '✦ pulling live data']

const OUT_BARS = [18, 34, 52, 40, 66, 28, 46]

/* depth artifacts — wireframe debris rising from the background as the
   scroll dollies through the scene. start = progress at which each surfaces. */
const ARTIFACTS = [
  { x: '31%', y: '54%', w: 64, h: 44, start: 0.28, kind: 'hatch' },
  { x: '55%', y: '70%', w: 44, h: 30, start: 0.38, kind: 'lines' },
  { x: '44%', y: '46%', w: 30, h: 22, start: 0.48, kind: 'hatch' },
  { x: '63%', y: '40%', w: 52, h: 34, start: 0.56, kind: 'lines' },
  { x: '37%', y: '76%', w: 38, h: 26, start: 0.64, kind: 'hatch' },
  { x: '50%', y: '58%', w: 26, h: 18, start: 0.72, kind: 'lines' },
]

/** Scroll fraction used solely to settle the tilted plane → straight rectangle. */
const SETTLE_END = 0.28

/**
 * The pinned dark chapter. The outer section is tall; the viewport is sticky.
 * Phase A (p → SETTLE_END): plane starts tilted, scrolls to a straight rectangle.
 * Phase B (after settle): step 1–5 bring title, stage, cards, then dissolve.
 */
export default function HowItWorks() {
  const outerRef = useRef<HTMLElement | null>(null)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const [step, setStep] = useState(0)
  const [settled, setSettled] = useState(false)

  useEffect(() => {
    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const outer = outerRef.current
        const viewport = viewportRef.current
        if (!outer || !viewport) return
        const total = Math.max(1, outer.offsetHeight - window.innerHeight)
        const p = Math.min(1, Math.max(0, -outer.getBoundingClientRect().top / total))
        viewport.style.setProperty('--p', String(p))

        // Phase A — rotate from slanted → axis-aligned rectangle
        const t = Math.min(1, p / SETTLE_END)
        const eased = 1 - (1 - t) ** 3
        viewport.style.setProperty('--plane-rot', `${(-10 * (1 - eased)).toFixed(3)}deg`)
        viewport.style.setProperty('--plane-scale', String(1.08 - 0.08 * eased))

        const isSettled = p >= SETTLE_END
        setSettled((prev) => (prev === isSettled ? prev : isSettled))

        // Phase B — content steps only after the plane is straight
        const cp = isSettled ? (p - SETTLE_END) / (1 - SETTLE_END) : 0
        const next = !isSettled
          ? 0
          : cp < 0.16
            ? 1
            : cp < 0.34
              ? 2
              : cp < 0.52
                ? 3
                : cp < 0.72
                  ? 4
                  : 5
        setStep((prev) => (prev === next ? prev : next))

        // Cards advance 0→1→2→3 with scroll, then hold through dissolve.
        // Mobile: snap per step so each card clearly slides in from the right.
        const mobileSnap = window.matchMedia('(max-width: 900px)').matches
        const slide = !isSettled
          ? 0
          : mobileSnap
            ? Math.min(3, Math.max(0, (next >= 5 ? 4 : Math.max(next, 1)) - 1))
            : cp < 0.16
              ? 0
              : cp < 0.72
                ? Math.min(3, ((cp - 0.16) / 0.56) * 3)
                : 3
        viewport.style.setProperty('--card-slide', String(slide))

        if (mobileSnap) {
          const stepsEl = viewport.querySelector('.hiw-steps') as HTMLElement | null
          if (stepsEl) {
            const styles = getComputedStyle(stepsEl)
            const gap = parseFloat(styles.getPropertyValue('--card-gap')) || 20
            viewport.style.setProperty('--card-step', `${stepsEl.clientWidth + gap}px`)
          }
        }
      })
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <section className="hiw" id="how" ref={outerRef}>
      <div
        className={`hiw-viewport step-${step}${settled ? ' hiw--settled' : ' hiw--settling'}`}
        ref={viewportRef}
      >
        <div className="hiw-plane">
          <div className="hiw-frame" aria-hidden />
          <div className="hiw-frame-inner" aria-hidden />
          <div className="hiw-frame-inner hiw-frame-inner--far" aria-hidden />
          {CORNERS.map((c) => (
            <div
              key={c.n}
              className={`hiw-corner hiw-corner--${c.pos}`}
              style={{ '--c': c.color } as CSSProperties}
              aria-hidden
            >
              <span className="hiw-corner-sq" />
            </div>
          ))}
        </div>

        <div className="hiw-head">
          <p className="kicker">How it works</p>
          <h2 className="hiw-title">
            <DecodeText
              text="The interface, assembling itself."
              start={settled && step >= 1}
              stagger={110}
            />
          </h2>
        </div>

        <div className="hiw-stage">
          {ARTIFACTS.map((a, i) => (
            <span
              key={i}
              className={`hiw-artifact hiw-artifact--${a.kind}`}
              style={
                {
                  left: a.x,
                  top: a.y,
                  width: a.w,
                  height: a.h,
                  '--start': a.start,
                } as CSSProperties
              }
              aria-hidden
            />
          ))}
          <div className="stage-box stage-intent">
            <span className="mono-label">Your intent</span>
            {INTENT_CHIPS.map((chip, i) => (
              <span
                key={chip.text}
                className="stage-chip"
                style={{ '--c': chip.color, transitionDelay: `${i * 140}ms` } as CSSProperties}
              >
                {chip.text}
              </span>
            ))}
          </div>

          <div className="stage-process">
            {PROCESS_PILLS.map((p, i) => (
              <span key={p} className="stage-process-pill" style={{ transitionDelay: `${i * 140}ms` }}>
                {p}
              </span>
            ))}
          </div>

          <div className="stage-box stage-out">
            <span className="mono-label">Generated · Seismic model</span>
            <div className="stage-out-viz">
              <span className="stage-donut" aria-hidden />
              <div className="stage-bars">
                {OUT_BARS.map((h, i) => (
                  <span
                    key={i}
                    className={`stage-bar${i % 2 === 0 ? '' : ' stage-bar--violet'}`}
                    style={{ '--h': `${h}px`, transitionDelay: `${i * 90}ms` } as CSSProperties}
                  />
                ))}
              </div>
            </div>
            <span className="mono-label mono-label--amber stage-live">Live ✦ M7+ zones · 2026</span>
          </div>
        </div>

        <p className="hiw-dissolve mono-label">Built for the moment. Gone when you're done.</p>

        <div className="hiw-steps" aria-label="How it works steps">
          <div className="hiw-steps-track">
            {STEPS.map((s, i) => {
              const active = step === i + 1 || (step >= 5 && i === STEPS.length - 1)
              return (
                <div
                  key={s.n}
                  className={`hiw-card${active ? ' hiw-card--active' : ''}`}
                  style={{ '--c': s.color, '--i': i } as CSSProperties}
                >
                  <span className="hiw-card-rule" />
                  <span className="hiw-card-n">{s.n}</span>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </div>
              )
            })}
          </div>
        </div>

        <span className="hiw-progress" aria-hidden />
      </div>
    </section>
  )
}
