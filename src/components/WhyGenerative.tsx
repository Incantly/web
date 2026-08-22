'use client'

import { useEffect, useState } from 'react'
import DecodeText from './DecodeText'
import { useInView } from '../hooks'

const STEP_MS = 4200

const STEPS = [
  {
    n: '01',
    label: 'You ask',
    color: 'var(--accent-blue)',
    desc: 'One sentence — typed or spoken. No app to find, no template to pick, no setup.',
  },
  {
    n: '02',
    label: 'A chat window answers in words',
    color: '#8b8577',
    desc: 'Paragraphs about the answer. You still have to read them, picture it, and build the thing yourself.',
  },
  {
    n: '03',
    label: 'Incantly assembles instead',
    color: 'var(--accent-mint)',
    desc: 'It reads the intent, pulls the right data, and lays out an interface — chart, model, controls — piece by piece.',
  },
  {
    n: '04',
    label: 'You get a working tool',
    color: 'var(--accent-amber)',
    desc: 'Live, interactive, connected to real data. Use it, ask a follow-up, and it reshapes. Done? It disappears.',
  },
]

export default function WhyGenerative() {
  const { ref, inView } = useInView<HTMLElement>(0.3)
  const [step, setStep] = useState(0)
  const [paused, setPaused] = useState(false)
  const current = STEPS[step]

  useEffect(() => {
    if (!inView || paused) return
    const timer = setInterval(() => setStep((s) => (s + 1) % STEPS.length), STEP_MS)
    return () => clearInterval(timer)
  }, [inView, paused, step])

  return (
    <section className={`why${inView ? ' why--in' : ''}`} id="why" ref={ref}>
      <div className="why-inner">
        <div className="why-copy">
          <p className="kicker kicker--inverse">Why generative — not another chat window</p>
          <h2 className="why-title">
            <DecodeText
              text="Chat gives you words. Incantly gives you the thing that helps."
              start={inView}
              stagger={75}
              accents={[7, 8, 9, 10]}
            />
          </h2>
          <p className="why-body">
            Every question deserves its own instrument. A budget question deserves a dashboard. A
            physics question deserves a model you can turn with your hands. A booking deserves two
            buttons — not twelve paragraphs. Incantly generates that instrument on the spot,
            precisely for your question, wired to your real data when it matters.
          </p>

          <div className="why-desc" key={step} style={{ '--step-c': current.color } as React.CSSProperties}>
            <span className="why-desc-n">{current.n}</span>
            <div>
              <p className="why-desc-title">{current.label}</p>
              <p className="why-desc-body">{current.desc}</p>
            </div>
          </div>
        </div>

        <div
          className="why-play"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          <div className="why-stage" aria-live="polite">
            {/* 01 — you ask */}
            <div className={`why-scene${step === 0 ? ' why-scene--on' : ''}`}>
              <span className="mono-label">01 · The question</span>
              <div className="why-bubble">
                <span className="why-bubble-dot" />
                <span className="why-bubble-text">
                  “How do earthquakes work?”
                  <i className="why-caret" />
                </span>
              </div>
              <div className="why-chips">
                <span className="why-chip">🎙 spoken</span>
                <span className="why-chip">⌨ typed</span>
                <span className="why-chip">📎 or drop a file</span>
              </div>
              <p className="why-scene-note">One sentence. That’s the whole interface contract.</p>
            </div>

            {/* 02 — chat answers in words */}
            <div className={`why-scene${step === 1 ? ' why-scene--on' : ''}`}>
              <span className="mono-label">02 · What a chat window does</span>
              <div className="why-words">
                <span className="why-words-tag">1,400 words</span>
                <span className="why-line" style={{ width: '92%' }} />
                <span className="why-line" style={{ width: '100%' }} />
                <span className="why-line" style={{ width: '84%' }} />
                <span className="why-line" style={{ width: '96%' }} />
                <span className="why-line" style={{ width: '88%' }} />
                <span className="why-line" style={{ width: '58%' }} />
                <span className="why-words-more">…scroll for 9 more paragraphs</span>
              </div>
              <p className="why-scene-note">A description of the answer. The work is still yours.</p>
            </div>

            {/* 03 — incantly assembles */}
            <div className={`why-scene${step === 2 ? ' why-scene--on' : ''}`}>
              <span className="mono-label">03 · What Incantly does instead</span>
              <div className="why-wire">
                <span className="why-wire-box why-wire-box--head">
                  <em className="why-wire-tag">title + controls</em>
                </span>
                <span className="why-wire-box why-wire-box--main">
                  <em className="why-wire-tag">3-D model</em>
                </span>
                <span className="why-wire-box why-wire-box--side">
                  <em className="why-wire-tag">live data</em>
                </span>
                <span className="why-wire-box why-wire-box--foot">
                  <em className="why-wire-tag">follow-up input</em>
                </span>
                <span className="why-scanline" />
              </div>
              <p className="why-scene-note">The interface is assembled for the question — not found, not installed.</p>
            </div>

            {/* 04 — you use it */}
            <div className={`why-scene${step === 3 ? ' why-scene--on' : ''}`}>
              <span className="mono-label">04 · The result</span>
              <div className="why-app">
                <div className="why-app-head">
                  <span className="why-app-title">Seismic model</span>
                  <span className="why-app-tabs">
                    <i className="why-app-tab why-app-tab--on">Waves</i>
                    <i className="why-app-tab">Plates</i>
                    <i className="why-app-tab">History</i>
                  </span>
                  <span className="why-app-pill">live</span>
                </div>
                <svg className="why-app-spark" viewBox="0 0 260 40" preserveAspectRatio="none" aria-hidden>
                  <path
                    className="why-sparkline"
                    pathLength={1}
                    d="M0 30 L24 28 L40 32 L58 12 L74 26 L96 22 L112 34 L134 8 L152 24 L176 20 L196 28 L214 16 L236 24 L260 22"
                    fill="none"
                    stroke="var(--accent-amber)"
                    strokeWidth="2"
                  />
                </svg>
                <div className="why-app-bars">
                  {[38, 68, 48, 88, 58, 74].map((h, i) => (
                    <span key={i} style={{ height: `${h}%`, transitionDelay: `${0.2 + i * 0.07}s` }} />
                  ))}
                </div>
                <span className="why-app-input">
                  Ask a follow-up… <i className="why-caret why-caret--dim" />
                </span>
              </div>
              <p className="why-scene-note">The thing that actually helps — until you don’t need it.</p>
            </div>
          </div>

          <div className="why-rail" role="tablist" aria-label="How Incantly differs, step by step">
            {STEPS.map((s, i) => (
              <button
                key={s.n}
                type="button"
                role="tab"
                aria-selected={step === i}
                className={`why-step${step === i ? ' why-step--on' : ''}`}
                style={{ '--step-c': s.color } as React.CSSProperties}
                onClick={() => setStep(i)}
              >
                <span className="why-step-n">{s.n}</span>
                <span className="why-step-label">{s.label}</span>
                <span className="why-step-track">
                  {step === i && (
                    <span
                      className="why-step-fill"
                      style={{
                        animationDuration: `${STEP_MS}ms`,
                        animationPlayState: paused ? 'paused' : 'running',
                      }}
                    />
                  )}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
