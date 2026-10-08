'use client'

import { useEffect, useState } from 'react'
import { storeHref } from '@/lib/store-url'
import LifeStage, { LIFE_CAPTIONS, type LifeKind } from './hero/LifeStage'
import './hero/hero.css'

const PLUS = [
  { x: '18%', y: '22%' },
  { x: '82%', y: '18%' },
  { x: '12%', y: '68%' },
  { x: '88%', y: '72%' },
  { x: '50%', y: '12%' },
]

export default function Hero() {
  const [mounted, setMounted] = useState(false)
  const [reduced, setReduced] = useState(false)

  const [kind, setKind] = useState<LifeKind>('tree')

  useEffect(() => {
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    setMounted(true)
  }, [])

  const onKind = (next: LifeKind) => {
    setKind(next)
  }

  return (
    <section className="hero-stage hero-stage--life" id="top" aria-label="Incantly brings text to life">
      {mounted ? <LifeStage reduced={reduced} onKind={onKind} /> : null}
      <div className="hero-stage-grid" aria-hidden />
      {PLUS.map((p) => (
        <span
          key={p.x + p.y}
          className="hero-stage-plus"
          style={{ left: p.x, top: p.y }}
          aria-hidden
        />
      ))}

      <div className="hero-stage-hud">
        <div className="hero-stage-top">
          <p className="hero-stage-kicker">A living notebook</p>
        </div>

        <div className="hero-stage-bottom">
          <h1 className="hero-stage-title">
            Bring text
            <br />
            to <em>life</em>
          </h1>
          <div className="hero-stage-copy">
            <p className="hero-stage-caption" aria-live="polite">
              <span key={kind} className="hero-stage-caption-swap">
                {LIFE_CAPTIONS[kind]}
              </span>
            </p>
            <p className="hero-stage-who">For people who take notes to learn, not to archive.</p>
            <div className="hero-stage-ctas">
              <a className="hero-stage-cta" href={storeHref('ios')}>
                App Store
              </a>
              <a className="hero-stage-cta hero-stage-cta--ghost" href={storeHref('android')}>
                Google Play
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
