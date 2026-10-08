'use client'

import { useEffect, useRef } from 'react'
import LivesPendulum from './LivesPendulum'
import LivesPlot from './LivesPlot'
import LivesSpring from './LivesSpring'

const STICKERS = [
  { src: '/stickers/plane.png', size: 108, x: 0.08, y: 0.18, phase: 0.2 },
  { src: '/stickers/pin.png', size: 76, x: 0.88, y: 0.14, phase: 1.1 },
  { src: '/stickers/asterisk.png', size: 64, x: 0.12, y: 0.72, phase: 2.4 },
  { src: '/stickers/dice.png', size: 70, x: 0.54, y: 0.8, phase: 5.0 },
] as const

const NODES = [
  { kind: 'pendulum' as const, size: 168, x: 0.72, y: 0.44, phase: 3.2 },
  { kind: 'spring' as const, size: 148, x: 0.14, y: 0.42, phase: 1.7 },
  { kind: 'plot' as const, size: 156, x: 0.46, y: 0.16, phase: 4.1 },
  ...STICKERS.map((s) => ({ kind: 'sticker' as const, ...s })),
]

type Body = {
  x: number
  y: number
  vx: number
  vy: number
  grabX: number
  grabY: number
}

export default function HowItLives() {
  const rootRef = useRef<HTMLElement>(null)
  const layerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = rootRef.current
    const layer = layerRef.current
    if (!root || !layer) return

    const layerNodes = () => Array.from(layer.querySelectorAll<HTMLElement>('.lives-node'))
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const bodies: Body[] = NODES.map(() => ({
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      grabX: 0,
      grabY: 0,
    }))
    let held = -1
    let w = root.clientWidth
    let h = root.clientHeight
    let last = performance.now()

    const rest = (i: number, now: number) => {
      const icon = NODES[i]
      const curl =
        parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--curl')) || 0
      const orbit = reduced ? 0 : Math.sin(now * 0.0007 + icon.phase) * (18 + curl * 10)
      const drift = reduced ? 0 : Math.cos(now * 0.00055 + icon.phase) * (12 + curl * 8)
      return {
        x: icon.x * w + drift,
        y: icon.y * h + orbit,
      }
    }

    const paint = (i: number) => {
      const el = layerNodes()[i]
      const b = bodies[i]
      if (!el || !b) return
      const curl =
        parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--curl')) || 0
      el.style.transform = `translate(${b.x}px, ${b.y}px) rotate(${(held === i ? 8 : 0) + curl * -14}deg)`
    }

    const placeRest = (now: number) => {
      bodies.forEach((b, i) => {
        const r = rest(i, now)
        b.x = r.x
        b.y = r.y
        paint(i)
      })
    }

    const ro = new ResizeObserver(() => {
      w = root.clientWidth
      h = root.clientHeight
      placeRest(performance.now())
    })
    ro.observe(root)

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target
      if (!(target instanceof Element)) return
      const wrap = target.closest('.lives-node')
      if (!(wrap instanceof HTMLElement) || !layer.contains(wrap)) return
      const i = layerNodes().indexOf(wrap)
      if (i < 0) return
      held = i
      const b = bodies[i]
      const rect = root.getBoundingClientRect()
      b.grabX = e.clientX - rect.left - b.x
      b.grabY = e.clientY - rect.top - b.y
      wrap.setPointerCapture(e.pointerId)
      wrap.style.cursor = 'grabbing'
    }

    const onPointerMove = (e: PointerEvent) => {
      if (held < 0) return
      const b = bodies[held]
      const rect = root.getBoundingClientRect()
      const nx = e.clientX - rect.left - b.grabX
      const ny = e.clientY - rect.top - b.grabY
      b.vx = nx - b.x
      b.vy = ny - b.y
      b.x = nx
      b.y = ny
    }

    const onPointerUp = (e: PointerEvent) => {
      if (held < 0) return
      const el = layerNodes()[held]
      if (el) {
        el.style.cursor = 'grab'
        try {
          el.releasePointerCapture(e.pointerId)
        } catch {
          /* already released */
        }
      }
      held = -1
    }

    layer.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)

    let raf = 0
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now

      bodies.forEach((b, i) => {
        if (held === i) {
          paint(i)
          return
        }
        const r = rest(i, now)
        b.vx += (r.x - b.x) * 14 * dt
        b.vy += (r.y - b.y) * 14 * dt
        b.vx *= 0.82
        b.vy *= 0.82
        b.x += b.vx
        b.y += b.vy
        paint(i)
      })

      raf = requestAnimationFrame(tick)
    }

    placeRest(performance.now())
    if (!reduced) raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      layer.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
      ro.disconnect()
    }
  }, [])

  return (
    <section className="chap lives" id="how" ref={rootRef} aria-labelledby="lives-title">
      <div className="chap-grid" aria-hidden />
      <div className="lives-copy">
        <p className="chap-kicker">How it lives</p>
        <h2 className="chap-display" id="lives-title">
          Write it.
          <br />
          Then pull it.
        </h2>
        <p className="chap-line">Touch it now. It is still there tomorrow.</p>
      </div>
      <div className="lives-icons" ref={layerRef} aria-hidden>
        {NODES.map((node, i) =>
          node.kind === 'sticker' ? (
            <img
              key={node.src}
              className={`lives-node lives-icon lives-node--${i}`}
              src={node.src}
              alt=""
              width={node.size}
              height={node.size}
              draggable={false}
              style={{ width: node.size, height: node.size }}
            />
          ) : (
            <div
              key={node.kind}
              className={`lives-node lives-node--${i}`}
              style={{ width: node.size, height: node.size }}
            >
              {node.kind === 'pendulum' ? <LivesPendulum /> : null}
              {node.kind === 'spring' ? <LivesSpring /> : null}
              {node.kind === 'plot' ? <LivesPlot /> : null}
            </div>
          ),
        )}
      </div>
    </section>
  )
}
