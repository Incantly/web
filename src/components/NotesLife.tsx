'use client'

import { useEffect, useRef, useState } from 'react'

type Fixed = 'annulus' | 'planets' | 'sun'

const NS = 24
const NP = 18
const NR = 60
const PLANETS = 3
const DRIVE = 0.62

function velocities(fixed: Fixed) {
  let wc = 0
  let ws = 0
  let wr = 0
  if (fixed === 'annulus') {
    wr = 0
    wc = DRIVE
    ws = (wc * (NS + NR)) / NS
  } else if (fixed === 'planets') {
    wc = 0
    ws = DRIVE
    wr = (-ws * NS) / NR
  } else {
    ws = 0
    wc = DRIVE
    wr = (wc * (NS + NR)) / NR
  }
  const wp = wc - (NS / NP) * (ws - wc)
  return { wc, ws, wr, wp }
}

export default function NotesLife({ life }: { life: number }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [fixed, setFixed] = useState<Fixed>('planets')
  const hl = Math.min(1, Math.max(0, (life - 0.28) / 0.42))
  const alive = hl >= 0.97
  const viewRef = useRef({ hl, alive, fixed })
  viewRef.current = { hl, alive, fixed }

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const canvas = document.createElement('canvas')
    canvas.className = 'nt-gear-canvas'
    host.appendChild(canvas)
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let w = 0
    let h = 0
    let dpr = 1
    let raf = 0
    let last = performance.now()
    let prevMember: Fixed = viewRef.current.fixed
    let mix = 1
    let fromV = velocities('planets')
    let toV = fromV
    const ang = { c: 0, s: 0, r: 0, p: 0 }

    const fit = () => {
      w = host.clientWidth || 280
      h = host.clientHeight || 220
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const tooth = (
      cx: number,
      cy: number,
      rPitch: number,
      n: number,
      rot: number,
      inward: boolean,
    ) => {
      const pitch = (Math.PI * 2) / n
      const depth = ((2 * Math.PI * rPitch) / n) * 0.32
      const rTip = inward ? rPitch - depth : rPitch + depth
      const rRoot = inward ? rPitch + depth * 0.12 : rPitch - depth * 0.55
      ctx.beginPath()
      for (let i = 0; i < n; i++) {
        const a0 = rot + i * pitch
        const a1 = a0 + pitch * 0.28
        const a2 = a0 + pitch * 0.5
        const a3 = a0 + pitch * 0.72
        const a4 = a0 + pitch
        if (i === 0) ctx.moveTo(cx + Math.cos(a0) * rRoot, cy + Math.sin(a0) * rRoot)
        ctx.lineTo(cx + Math.cos(a0) * rRoot, cy + Math.sin(a0) * rRoot)
        ctx.lineTo(cx + Math.cos(a1) * rTip, cy + Math.sin(a1) * rTip)
        ctx.lineTo(cx + Math.cos(a2) * rTip, cy + Math.sin(a2) * rTip)
        ctx.lineTo(cx + Math.cos(a3) * rRoot, cy + Math.sin(a3) * rRoot)
        ctx.lineTo(cx + Math.cos(a4) * rRoot, cy + Math.sin(a4) * rRoot)
      }
      ctx.closePath()
    }

    const hole = (cx: number, cy: number, r: number) => {
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fillStyle = '#1a1814'
      ctx.fill()
      ctx.strokeStyle = 'rgba(245,241,232,0.35)'
      ctx.lineWidth = 1
      ctx.stroke()
    }

    const paintGear = (
      cx: number,
      cy: number,
      rPitch: number,
      n: number,
      rot: number,
      fill: string,
      stroke: string,
      glow: boolean,
      bore: number,
    ) => {
      ctx.save()
      if (glow) {
        ctx.shadowColor = 'rgba(227,162,60,0.55)'
        ctx.shadowBlur = 18
      }
      tooth(cx, cy, rPitch, n, rot, false)
      ctx.fillStyle = fill
      ctx.strokeStyle = stroke
      ctx.lineWidth = glow ? 2.2 : 1.4
      ctx.fill()
      ctx.stroke()
      ctx.restore()
      hole(cx, cy, bore)
    }

    const draw = (now: number) => {
      const { hl: highlight, alive: on, fixed: member } = viewRef.current
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      if (member !== prevMember) {
        fromV = {
          wc: fromV.wc * (1 - mix) + toV.wc * mix,
          ws: fromV.ws * (1 - mix) + toV.ws * mix,
          wr: fromV.wr * (1 - mix) + toV.wr * mix,
          wp: fromV.wp * (1 - mix) + toV.wp * mix,
        }
        toV = velocities(member)
        mix = 0
        prevMember = member
      }
      mix = Math.min(1, mix + dt / 0.38)
      const v = {
        wc: fromV.wc + (toV.wc - fromV.wc) * mix,
        ws: fromV.ws + (toV.ws - fromV.ws) * mix,
        wr: fromV.wr + (toV.wr - fromV.wr) * mix,
        wp: fromV.wp + (toV.wp - fromV.wp) * mix,
      }
      if (on && !reduced) {
        ang.c += v.wc * dt
        ang.s += v.ws * dt
        ang.r += v.wr * dt
        ang.p += v.wp * dt
      }

      const cx = w * 0.5
      const cy = h * 0.52
      const span = Math.min(w, h)
      const rRing = span * 0.42
      const rSun = rRing * (NS / NR)
      const rPlanet = rRing * (NP / NR)
      const orbit = rSun + rPlanet
      const cream = (a: number) => `rgba(245,241,232,${a})`
      const amber = (a: number) => `rgba(227,162,60,${a})`
      const glow = highlight > 0.55
      const mute = 0.35 + highlight * 0.65
      const show = 0.12 + highlight * 0.88

      ctx.clearRect(0, 0, w, h)
      ctx.globalAlpha = show

      ctx.save()
      if (glow) {
        ctx.shadowColor = 'rgba(227,162,60,0.5)'
        ctx.shadowBlur = 16
      }
      const rOuter = rRing + ((2 * Math.PI * rRing) / NR) * 0.55
      ctx.beginPath()
      ctx.arc(cx, cy, rOuter, 0, Math.PI * 2)
      ctx.fillStyle = cream(0.07)
      ctx.fill()
      ctx.strokeStyle = glow ? amber(0.95) : cream(0.35 * mute)
      ctx.lineWidth = glow ? 2.2 : 1.4
      ctx.stroke()
      tooth(cx, cy, rRing, NR, ang.r, true)
      ctx.fillStyle = '#1a1814'
      ctx.fill()
      ctx.strokeStyle = glow ? amber(0.9) : cream(0.4 * mute)
      ctx.stroke()
      ctx.restore()

      for (let i = 0; i < PLANETS; i++) {
        const a = ang.c + (i * Math.PI * 2) / PLANETS
        paintGear(
          cx + Math.cos(a) * orbit,
          cy + Math.sin(a) * orbit,
          rPlanet,
          NP,
          ang.p,
          cream(glow ? 0.16 : 0.07),
          glow ? amber(0.95) : cream(0.45 * mute),
          glow,
          rPlanet * 0.22,
        )
      }

      paintGear(
        cx,
        cy,
        rSun,
        NS,
        ang.s,
        glow ? amber(0.28) : cream(0.1),
        glow ? amber(1) : cream(0.5 * mute),
        glow,
        rSun * 0.28,
      )

      ctx.globalAlpha = 1
      raf = requestAnimationFrame(draw)
    }

    const ro = new ResizeObserver(fit)
    ro.observe(host)
    fit()
    raf = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      canvas.remove()
    }
  }, [])

  return (
    <div className={`nt-card nt-notes nt-notes--gear${alive ? ' is-alive' : ''}`}>
      <span className="nt-card-label">Notes</span>
      <p className="nt-notes-line">On the page. Epicyclic gearing — a sun, planets, and an annulus.</p>
      <p className="nt-notes-line">The ring sits outside both. That is the whole geometry.</p>
      <p className="nt-notes-formula">
        <span className="nt-notes-hl" style={{ width: `${hl * 100}%` }} />
        <span className="nt-notes-eq">
          R<sub>a</sub> = R<sub>s</sub> + 2 R<sub>p</sub>
        </span>
      </p>
      <div className="nt-gear-stage">
        <div ref={hostRef} className="nt-gear-host" />
        <fieldset className={`nt-gear-fixed${alive ? ' is-on' : ''}`}>
          <legend>Fixed gear</legend>
          {(['annulus', 'planets', 'sun'] as const).map((id) => (
            <label key={id}>
              <input
                type="radio"
                name="nt-fixed-gear"
                value={id}
                checked={fixed === id}
                onChange={() => setFixed(id)}
                disabled={!alive}
              />
              {id}
            </label>
          ))}
        </fieldset>
      </div>
    </div>
  )
}
