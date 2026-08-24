'use client'

import { useEffect, useRef } from 'react'

export default function LivesPlot() {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const canvas = document.createElement('canvas')
    canvas.className = 'lives-sim-canvas'
    host.appendChild(canvas)
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let w = 0
    let h = 0
    let dpr = 1
    const pts = [
      { x: 0.18, y: 0.72 },
      { x: 0.5, y: 0.28 },
      { x: 0.82, y: 0.58 },
    ]
    let hold = -1
    let raf = 0

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

    const px = (p: { x: number; y: number }) => ({ x: p.x * w, y: p.y * h })

    const pointer = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }

    const onDown = (e: PointerEvent) => {
      const p = pointer(e)
      let best = -1
      let dist = 22
      pts.forEach((pt, i) => {
        const s = px(pt)
        const d = Math.hypot(p.x - s.x, p.y - s.y)
        if (d < dist) {
          dist = d
          best = i
        }
      })
      if (best < 0) return
      e.stopPropagation()
      hold = best
      canvas.setPointerCapture(e.pointerId)
    }

    const onMove = (e: PointerEvent) => {
      if (hold < 0) return
      e.stopPropagation()
      const p = pointer(e)
      const pt = pts[hold]
      if (!pt) return
      pt.x = Math.min(0.9, Math.max(0.1, p.x / w))
      pt.y = Math.min(0.86, Math.max(0.14, p.y / h))
    }

    const onUp = () => {
      hold = -1
    }

    const tick = () => {
      ctx.clearRect(0, 0, w, h)
      ctx.beginPath()
      pts.forEach((pt, i) => {
        const s = px(pt)
        if (i === 0) ctx.moveTo(s.x, s.y)
        else ctx.lineTo(s.x, s.y)
      })
      ctx.strokeStyle = 'rgba(245,241,232,0.82)'
      ctx.lineWidth = 1.8
      ctx.lineJoin = 'round'
      ctx.stroke()
      pts.forEach((pt, i) => {
        const s = px(pt)
        ctx.beginPath()
        ctx.arc(s.x, s.y, i === 1 ? 8 : 6, 0, Math.PI * 2)
        ctx.fillStyle = i === 1 ? '#e3a23c' : '#f5f1e8'
        ctx.fill()
      })
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
