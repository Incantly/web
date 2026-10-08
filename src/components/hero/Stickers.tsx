'use client'

import { useEffect, useRef } from 'react'

const ASSETS = [
  { src: '/stickers/plane.png', size: 108 },
  { src: '/stickers/pin.png', size: 72 },
  { src: '/stickers/asterisk.png', size: 58 },
  { src: '/stickers/pie.png', size: 96 },
  { src: '/stickers/torus.png', size: 88 },
  { src: '/stickers/dice.png', size: 70 },
] as const

const SCATTER = [
  { x: 0.06, y: 0.16, rot: -22 },
  { x: 0.18, y: 0.58, rot: 18 },
  { x: 0.34, y: 0.24, rot: -8 },
  { x: 0.68, y: 0.52, rot: 12 },
  { x: 0.82, y: 0.2, rot: -14 },
  { x: 0.78, y: 0.68, rot: 26 },
] as const

type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  rot: number
  vr: number
  age: number
  life: number
  wait: number
}

function rand(min: number, max: number) {
  return min + Math.random() * (max - min)
}

/** Always start off-canvas, then fly inward so they fall onto the page. */
function spawn(w: number, h: number, wait = 0): Particle {
  const pad = 120
  const edge = Math.floor(Math.random() * 4)
  let x = 0
  let y = 0
  if (edge === 0) {
    x = rand(-40, w + 40)
    y = -pad
  } else if (edge === 1) {
    x = w + pad
    y = rand(-40, h + 40)
  } else if (edge === 2) {
    x = rand(-40, w + 40)
    y = h + pad
  } else {
    x = -pad
    y = rand(-40, h + 40)
  }

  const tx = rand(w * 0.12, w * 0.88)
  let ty = rand(h * 0.1, h * 0.82)
  if (tx > w * 0.38 && tx < w * 0.62 && ty > h * 0.3 && ty < h * 0.58) {
    ty = Math.random() < 0.5 ? rand(h * 0.08, h * 0.24) : rand(h * 0.64, h * 0.88)
  }
  const dx = tx - x
  const dy = ty - y
  const dist = Math.hypot(dx, dy) || 1
  const speed = rand(48, 96)

  return {
    x,
    y,
    vx: (dx / dist) * speed,
    vy: (dy / dist) * speed,
    rot: rand(-30, 30),
    vr: rand(-28, 28),
    age: 0,
    life: rand(6.5, 11),
    wait,
  }
}

function lifeStyle(p: Particle) {
  const t = Math.min(1, p.age / p.life)
  const scale = 1.15 - t * 0.9
  const opacity = t > 0.72 ? Math.max(0, 1 - (t - 0.72) / 0.28) : 1
  return { scale, opacity }
}

function paint(el: HTMLElement, x: number, y: number, rot: number, scale: number, opacity: number) {
  el.style.transform = `translate(${x}px, ${y}px) rotate(${rot}deg) scale(${scale})`
  el.style.opacity = String(opacity)
}

export default function Stickers({ reduced }: { reduced: boolean }) {
  const layerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const layer = layerRef.current
    if (!layer) return

    const nodes = Array.from(layer.querySelectorAll<HTMLImageElement>('.hero-sticker'))
    let w = layer.clientWidth
    let h = layer.clientHeight

    const paintStatic = () => {
      nodes.forEach((el, i) => {
        const s = SCATTER[i]
        if (!s) return
        paint(el, w * s.x, h * s.y, s.rot, 1, 1)
      })
    }

    const ro = new ResizeObserver(() => {
      w = layer.clientWidth
      h = layer.clientHeight
      if (reduced) paintStatic()
    })
    ro.observe(layer)

    if (reduced) {
      paintStatic()
      return () => ro.disconnect()
    }

    const particles = nodes.map((_, i) => spawn(w, h, i * 0.55))
    particles.forEach((p, i) => {
      const el = nodes[i]
      if (!el) return
      paint(el, p.x, p.y, p.rot, 1.15, 0)
    })

    let raf = 0
    let last = performance.now()

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now

      particles.forEach((p, i) => {
        const el = nodes[i]
        if (!el) return

        if (p.wait > 0) {
          p.wait -= dt
          paint(el, p.x, p.y, p.rot, 1.15, 0)
          return
        }

        p.age += dt
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.rot += p.vr * dt

        let { scale, opacity } = lifeStyle(p)
        if (p.age >= p.life || opacity <= 0.01) {
          Object.assign(p, spawn(w, h, rand(0.2, 1.4)))
          scale = 1.15
          opacity = 0
        }

        paint(el, p.x, p.y, p.rot, scale, opacity)
      })

      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [reduced])

  return (
    <div ref={layerRef} className="hero-stickers" aria-hidden>
      {ASSETS.map((s, i) => {
        const scatter = SCATTER[i]
        return (
          <img
            key={s.src}
            className={`hero-sticker hero-sticker--${i}`}
            src={s.src}
            alt=""
            width={s.size}
            height={s.size}
            draggable={false}
            style={{
              width: s.size,
              height: s.size,
              opacity: reduced ? 1 : 0,
              transform: scatter
                ? `translate(${scatter.x * 100}vw, ${scatter.y * 100}vh) rotate(${scatter.rot}deg)`
                : undefined,
            }}
          />
        )
      })}
    </div>
  )
}
