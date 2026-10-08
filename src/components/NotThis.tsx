'use client'

import { useEffect, useRef, useState } from 'react'
import NotesLife from './NotesLife'

const STEPS = [
  { n: '01', title: 'Not a chat' },
  { n: '02', title: 'Not a video in a notes shell' },
  { n: '03', title: 'Not a prettier pencil with nothing alive' },
  { n: '04', title: 'Your notes, coming to life' },
] as const

function ChatGraphic() {
  return (
    <div className="nt-card nt-chat">
      <span className="nt-card-label">Chat</span>
      <span className="nt-bubble nt-bubble--a">what&apos;s a standing wave?</span>
      <span className="nt-bubble nt-bubble--b">A standing wave is a vibration that…</span>
      <span className="nt-bubble nt-bubble--c">
        keep reading
        <i className="nt-caret" />
      </span>
    </div>
  )
}

function VideoGraphic() {
  return (
    <div className="nt-card nt-video">
      <span className="nt-card-label">Notes</span>
      <span className="nt-rule" />
      <span className="nt-rule" />
      <span className="nt-rule nt-rule--short" />
      <div className="nt-frame">
        <span className="nt-play" />
      </div>
    </div>
  )
}

function MarkGraphic() {
  return (
    <div className="nt-card nt-mark">
      <span className="nt-card-label">Mark</span>
      <svg className="nt-stroke" viewBox="0 0 280 120" fill="none">
        <path
          d="M16 74 C54 28 92 108 140 62 C176 28 214 88 264 48"
          stroke="rgba(245,241,232,0.55)"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </svg>
    </div>
  )
}

const GRAPHICS = [ChatGraphic, VideoGraphic, MarkGraphic]

export default function NotThis() {
  const outerRef = useRef<HTMLElement>(null)
  const [step, setStep] = useState(0)
  const [life, setLife] = useState(0)
  const Graphic = GRAPHICS[step] ?? ChatGraphic
  const current = STEPS[step] ?? STEPS[0]

  useEffect(() => {
    const outer = outerRef.current
    if (!outer) return
    let raf = 0

    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const total = Math.max(1, outer.offsetHeight - window.innerHeight)
        const p = Math.min(1, Math.max(0, -outer.getBoundingClientRect().top / total))
        const notesStart = 0.5
        const next =
          p < notesStart ? Math.min(2, Math.floor((p / notesStart) * 3 + 0.001)) : 3
        const live = next === 3 ? Math.min(1, (p - notesStart) / (1 - notesStart)) : 0
        setStep((prev) => (prev === next ? prev : next))
        setLife((prev) => (Math.abs(prev - live) < 0.004 ? prev : live))
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
    <section className="not-this" id="not-this" ref={outerRef} aria-labelledby="not-this-title">
      <div className="not-this-pin">
        <div className="chap-grid" aria-hidden />
        <p className="chap-kicker">Not this</p>
        <h2 className="chap-display not-this-headline" id="not-this-title">
          The live thing is the page.
        </h2>
        <div className="not-this-beat">
          <div className="not-this-copy" key={current.n} aria-live="polite">
            <p className="not-this-n">{current.n}</p>
            <p className="not-this-title">{current.title}</p>
          </div>
          <div className="not-this-stage" key={step} aria-hidden={step !== 3}>
            {step === 3 ? <NotesLife life={life} /> : <Graphic />}
          </div>
        </div>
      </div>
    </section>
  )
}
