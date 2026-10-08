'use client'

import { useEffect, useRef } from 'react'

export default function LivesPendulum() {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const canvas = document.createElement('canvas')
    canvas.className = 'lives-pendulum-canvas'
    host.appendChild(canvas)
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let w = 0
    let h = 0
    let dpr = 1
    let theta = 0.7
    let omega = 0
    let pulling = false
    let raf = 0
    let last = performance.now()

    const pivot = () => ({ x: w * 0.5, y: 16 })
    const len = () => Math.min(w, h) * 0.62
    const bob = () => {
      const p = pivot()
      const L = len()
      return { x: p.x + Math.sin(theta) * L, y: p.y + Math.cos(theta) * L }
    }

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
      const b = bob()
      if (Math.hypot(p.x - b.x, p.y - b.y) > 28) return
      e.stopPropagation()
      pulling = true
      const pv = pivot()
      theta = Math.atan2(p.x - pv.x, p.y - pv.y)
      omega = 0
      canvas.setPointerCapture(e.pointerId)
    }

    const onMove = (e: PointerEvent) => {
      if (!pulling) return
      e.stopPropagation()
      const p = pointer(e)
      const pv = pivot()
      theta = Math.atan2(p.x - pv.x, p.y - pv.y)
      omega = 0
    }

    const onUp = () => {
      pulling = false
    }

    const tick = (now: number) => {
      const dt = Math.min(0.04, (now - last) / 1000)
      last = now
      const L = Math.max(36, len())
      if (!pulling && !reduced) {
        omega += (-(980 / L) * Math.sin(theta) - 0.18 * omega) * dt
        theta += omega * dt
      }
      ctx.clearRect(0, 0, w, h)
      const p = pivot()
      const b = bob()
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
      ctx.lineTo(b.x, b.y)
      ctx.strokeStyle = 'rgba(245,241,232,0.82)'
      ctx.lineWidth = 1.8
      ctx.lineCap = 'round'
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(245,241,232,0.7)'
      ctx.fill()
      ctx.beginPath()
      ctx.arc(b.x, b.y, 11, 0, Math.PI * 2)
      ctx.fillStyle = '#f5f1e8'
      ctx.fill()
      ctx.beginPath()
      ctx.arc(b.x - 3, b.y - 3, 3, 0, Math.PI * 2)
      ctx.fillStyle = '#9ec0ff'
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

  return (
    <div
      ref={hostRef}
      className="lives-pendulum"
      aria-hidden
    />
  )
}
