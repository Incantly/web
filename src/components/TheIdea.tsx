'use client'

import { useEffect, useRef, useState } from 'react'

const SLIDES = 4
const GAP = 28

type Point = { x: number; y: number }

const NODES: Point[] = [
  { x: 42, y: 108 },
  { x: 118, y: 38 },
  { x: 200, y: 72 },
  { x: 286, y: 28 },
  { x: 358, y: 96 },
]

function lagrangeY(pts: Point[], x: number) {
  let y = 0
  for (let i = 0; i < pts.length; i++) {
    let li = 1
    for (let j = 0; j < pts.length; j++) {
      if (i === j) continue
      const d = pts[i].x - pts[j].x
      if (Math.abs(d) < 0.4) continue
      li *= (x - pts[j].x) / d
    }
    y += pts[i].y * li
  }
  return y
}

function curvePath(pts: Point[]) {
  const cmds: string[] = []
  const steps = 96
  for (let s = 0; s <= steps; s++) {
    const x = 16 + (384 - 16) * (s / steps)
    const y = Math.min(142, Math.max(8, lagrangeY(pts, x)))
    cmds.push(`${s === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`)
  }
  return cmds.join(' ')
}

function LiveCurve({ pull }: { pull: boolean }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [nodes, setNodes] = useState(NODES)
  const nodesRef = useRef(nodes)
  nodesRef.current = nodes
  const drag = useRef<{ i: number; id: number } | null>(null)

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return

    const pt = (e: PointerEvent) => {
      const r = svg.getBoundingClientRect()
      return {
        x: ((e.clientX - r.left) / r.width) * 400,
        y: ((e.clientY - r.top) / r.height) * 150,
      }
    }

    const onDown = (e: PointerEvent) => {
      if (!pull) return
      const p = pt(e)
      let best = -1
      let dist = 22
      nodesRef.current.forEach((n, i) => {
        const d = Math.hypot(n.x - p.x, n.y - p.y)
        if (d < dist) {
          dist = d
          best = i
        }
      })
      if (best < 0) return
      drag.current = { i: best, id: e.pointerId }
      svg.setPointerCapture(e.pointerId)
    }

    const onMove = (e: PointerEvent) => {
      const d = drag.current
      if (!d || d.id !== e.pointerId) return
      const p = pt(e)
      const pts = nodesRef.current
      const left = pts[d.i - 1]?.x ?? 16
      const right = pts[d.i + 1]?.x ?? 384
      setNodes((prev) =>
        prev.map((n, i) =>
          i === d.i
            ? {
                x: Math.min(right - 10, Math.max(left + 10, p.x)),
                y: Math.min(138, Math.max(12, p.y)),
              }
            : n,
        ),
      )
    }

    const onUp = (e: PointerEvent) => {
      if (drag.current?.id === e.pointerId) drag.current = null
    }

    svg.addEventListener('pointerdown', onDown)
    svg.addEventListener('pointermove', onMove)
    svg.addEventListener('pointerup', onUp)
    svg.addEventListener('pointercancel', onUp)
    return () => {
      svg.removeEventListener('pointerdown', onDown)
      svg.removeEventListener('pointermove', onMove)
      svg.removeEventListener('pointerup', onUp)
      svg.removeEventListener('pointercancel', onUp)
    }
  }, [pull])

  return (
    <div className="idea-live">
      <svg
        ref={svgRef}
        className={`idea-graph${pull ? ' idea-graph--pull' : ''}`}
        viewBox="0 0 400 150"
        aria-hidden
      >
        <line className="idea-graph-axis" x1="16" y1="142" x2="384" y2="142" />
        <path d={curvePath(nodes)} />
        {nodes.map((n, i) => (
          <circle
            key={i}
            cx={n.x}
            cy={n.y}
            r={i === 2 ? 7 : 5.5}
            fill={i === 2 ? '#e3a23c' : i === 1 ? '#9ec0ff' : '#f5f1e8'}
          />
        ))}
      </svg>
      <p className="idea-hint">Drag a point. Tilt the curve.</p>
    </div>
  )
}

export default function TheIdea() {
  const railRef = useRef<HTMLDivElement>(null)
  const pinRef = useRef<HTMLDivElement>(null)
  const galleryRef = useRef<HTMLDivElement>(null)
  const fillRef = useRef<HTMLSpanElement>(null)
  const [index, setIndex] = useState(0)
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    setReduced(reduce)
    if (reduce) return

    const rail = railRef.current
    const pin = pinRef.current
    const gallery = galleryRef.current
    if (!rail || !pin || !gallery) return

    let raf = 0

    const paint = () => {
      const cards = gallery.querySelectorAll<HTMLElement>('.idea-card')
      const first = cards[0]
      if (!first) return
      const pinW = pin.clientWidth
      const cardW = first.offsetWidth
      const origin = Math.max(24, (pinW - cardW) / 2)
      gallery.style.paddingLeft = `${origin}px`
      gallery.style.paddingRight = `${origin}px`
      const maxX = (SLIDES - 1) * (cardW + GAP)
      const total = Math.max(1, rail.offsetHeight - window.innerHeight)
      const p = Math.min(1, Math.max(0, -rail.getBoundingClientRect().top / total))
      gallery.style.transform = `translate3d(${-maxX * p}px,0,0)`
      pin.style.setProperty('--idea-p', String(p))
      if (fillRef.current) fillRef.current.style.transform = `scaleX(${p})`
      const next = Math.min(SLIDES - 1, Math.round(p * (SLIDES - 1)))
      setIndex((prev) => (prev === next ? prev : next))
      cards.forEach((card, i) => {
        const local = Math.min(1, Math.max(0, p * (SLIDES - 1) - (i - 0.12)))
        card.style.setProperty('--idea-life', String(local))
      })
    }

    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(paint)
    }

    paint()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    const ro = new ResizeObserver(onScroll)
    ro.observe(rail)
    ro.observe(pin)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      ro.disconnect()
    }
  }, [])

  return (
    <section className="idea" id="idea" aria-labelledby="idea-title">
      <div className="idea-rail" ref={railRef}>
        <div className="idea-pin" ref={pinRef}>
          <div className="idea-grid" aria-hidden />
          <header className="idea-head">
            <p className="chap-kicker">The idea</p>
            <p className="idea-count" aria-live="polite">
              <span>0{index + 1}</span>
              <span>04</span>
            </p>
          </header>

          <div className="idea-stage">
            <div className="idea-gallery" ref={galleryRef}>
              <article className="idea-card" data-i="0">
                <p className="idea-card-n">01</p>
                <h2 className="idea-card-title" id="idea-title">
                  Don’t leave your notes.
                </h2>
                <p className="idea-card-copy">
                  You’re writing notes. Lagrange interpolation is on the page. You still don’t have
                  it. So you leave — a video, a chat, another tab — and you watch someone else
                  explain it. Your notes stay dead.
                </p>
                <p className="idea-card-sheet">
                  P(x) = Σ yᵢ ℓᵢ(x), where ℓᵢ(x) = Π (x − xⱼ) / (xᵢ − xⱼ). You can write it. You
                  still cannot feel it.
                </p>
              </article>

              <article className="idea-card" data-i="1">
                <p className="idea-card-n">02</p>
                <h2 className="idea-card-title">Stay on the formula.</h2>
                <p className="idea-card-copy">
                  Same line in your notes. Don’t open a lecture. The polynomial is already there —
                  it just isn’t something you can touch yet.
                </p>
                <p className="idea-card-sheet">
                  <mark className="idea-hl">P(x) = Σ yᵢ ℓᵢ(x)</mark>
                  <span className="idea-card-sub">ℓᵢ(x) = Π (x − xⱼ)/(xᵢ − xⱼ)</span>
                </p>
              </article>

              <article className="idea-card" data-i="2">
                <p className="idea-card-n">03</p>
                <h2 className="idea-card-title">Now pull it.</h2>
                <p className="idea-card-copy">
                  Incantly does not just show the formula. You drag a node, tilt the curve, watch
                  P(x) move. Your notes stay. The interpolation is on the same page.
                </p>
                <p className="idea-card-sheet">
                  <mark className="idea-hl idea-hl--on">P(x) = Σ yᵢ ℓᵢ(x)</mark>
                </p>
                <LiveCurve pull={reduced || index >= 2} />
              </article>

              <article className="idea-card idea-card--law" data-i="3">
                <p className="idea-card-n">04</p>
                <h2 className="idea-card-title">The point.</h2>
                <p className="idea-law">
                  <span>Interaction beats observation.</span>
                  <span>Observation beats text.</span>
                  <span>Your notes are enough.</span>
                </p>
              </article>
            </div>
          </div>

          {reduced ? null : (
            <div className="idea-timer" aria-hidden>
              <span>Scroll</span>
              <span className="idea-timer-track">
                <span className="idea-timer-fill" ref={fillRef} />
              </span>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
