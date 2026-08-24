'use client'

import { useEffect, useRef } from 'react'

export default function LivesSpring() {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const canvas = document.createElement('canvas')
    canvas.className = 'lives-sim-canvas'
    host.appendChild(canvas)
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let w = 0
    let h = 0
    let dpr = 1
    let y = 0.62
    let v = 0
    let pulling = false
    let raf = 0
    let last = performance.now()

    const rest = () => 0.58
    const mass = () => ({ x: w * 0.5, y: 22 + y * (h - 40) })

    const fit = () => {
      w = host.clientWidth || 120
      h = host.clientHeight || 120
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const pointer = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }

    const onDown = (e: PointerEvent) => {
      const p = pointer(e)
      const m = mass()
      if (Math.hypot(p.x - m.x, p.y - m.y) > 28) return
      e.stopPropagation()
      pulling = true
      y = Math.min(0.92, Math.max(0.22, (p.y - 22) / Math.max(1, h - 40)))
      v = 0
      canvas.setPointerCapture(e.pointerId)
    }

    const onMove = (e: PointerEvent) => {
      if (!pulling) return
      e.stopPropagation()
      const p = pointer(e)
      y = Math.min(0.92, Math.max(0.22, (p.y - 22) / Math.max(1, h - 40)))
      v = 0
    }

    const onUp = () => {
      pulling = false
    }

    const tick = (now: number) => {
      const dt = Math.min(0.04, (now - last) / 1000)
      last = now
      if (!pulling && !reduced) {
        v += (-28 * (y - rest()) - 3.2 * v) * dt
        y += v * dt
      }
      ctx.clearRect(0, 0, w, h)
      const top = { x: w * 0.5, y: 14 }
      const m = mass()
      const coils = 8
      ctx.beginPath()
      ctx.moveTo(top.x, top.y)
      for (let i = 1; i <= coils; i++) {
        const t = i / coils
        const px = top.x + (i % 2 === 0 ? 12 : -12)
        const py = top.y + (m.y - top.y) * t
        ctx.lineTo(px, py)
      }
      ctx.lineTo(m.x, m.y)
      ctx.strokeStyle = 'rgba(245,241,232,0.82)'
      ctx.lineWidth = 1.8
      ctx.lineCap = 'round'
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(m.x, m.y, 11, 0, Math.PI * 2)
      ctx.fillStyle = '#f5f1e8'
      ctx.fill()
      ctx.beginPath()
      ctx.arc(m.x - 3, m.y - 3, 3, 0, Math.PI * 2)
      ctx.fillStyle = '#e3a23c'
      ctx.fill()
      raf = requestAnimationFrame(tick)
    }

    fit()
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onUp)
    const ro = new ResizeObserver(fit)
    ro.observe(host)
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
      if (canvas.parentNode === host) host.removeChild(canvas)
    }
  }, [])

  return <div ref={hostRef} className="lives-sim" aria-hidden />
}
