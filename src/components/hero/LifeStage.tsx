'use client'

import { useEffect, useRef, useState } from 'react'

export type LifeKind = 'tree' | 'graph' | 'plot' | 'pendulum' | 'atwood' | 'spring' | 'orbit'

export const LIFE_CAPTIONS: Record<LifeKind, string> = {
  tree: 'Your text, a recursive tree. Don’t watch a tutorial.',
  graph: 'Your text, a maths graph. Don’t watch a tutorial.',
  plot: 'Your text, a curve. Don’t watch a tutorial.',
  pendulum: 'Your text, a pendulum. Don’t watch a tutorial.',
  atwood: 'Your text, an Atwood machine. Don’t watch a tutorial.',
  spring: 'Your text, a spring. Don’t watch a tutorial.',
  orbit: 'Your text, an orbit. Don’t watch a tutorial.',
}

const ORDER: LifeKind[] = ['tree', 'pendulum', 'graph', 'atwood', 'plot', 'spring', 'orbit']
const HOLD = 6.4
const GROW = 1.8

type Params = {
  tree: { spread: number; depth: number }
  graph: { count: number; stiffness: number }
  plot: { a: number; n: number; b: number }
  pendulum: { length: number; mass: number; damping: number }
  atwood: { m1: number; m2: number; friction: number }
  spring: { k: number; width: number; rest: number }
  orbit: { radius: number; speed: number; sun: number }
}

const DEFAULTS: Params = {
  tree: { spread: 0.42, depth: 6 },
  graph: { count: 9, stiffness: 10 },
  plot: { a: 1, n: 3, b: 0.28 },
  pendulum: { length: 0.32, mass: 1, damping: 0.22 },
  atwood: { m1: 1.25, m2: 1, friction: 0.992 },
  spring: { k: 18, width: 18, rest: 80 },
  orbit: { radius: 0.34, speed: 1, sun: 1 },
}

type Props = {
  reduced: boolean
  onKind: (kind: LifeKind) => void
}

type Branch = {
  x: number
  y: number
  tx: number
  ty: number
  depth: number
  children: Branch[]
}

type Node = { x: number; y: number; ox: number; oy: number; vx: number; vy: number }

function ease(t: number) {
  const u = Math.min(1, Math.max(0, t))
  return u * u * (3 - 2 * u)
}

function show(n: number, digits = 2) {
  return Number(n.toFixed(digits)).toString()
}

function buildTree(
  x: number,
  y: number,
  ang: number,
  len: number,
  depth: number,
  maxDepth: number,
  spread: number,
): Branch {
  const tx = x + Math.cos(ang) * len
  const ty = y + Math.sin(ang) * len
  const node: Branch = { x, y, tx, ty, depth, children: [] }
  if (depth < maxDepth && len > 14) {
    const sp = spread + depth * 0.04
    node.children.push(buildTree(tx, ty, ang - sp, len * 0.72, depth + 1, maxDepth, spread))
    node.children.push(buildTree(tx, ty, ang + sp, len * 0.68, depth + 1, maxDepth, spread))
    if (depth % 2 === 0 && depth > 0) {
      node.children.push(buildTree(tx, ty, ang + 0.02, len * 0.5, depth + 1, maxDepth, spread))
    }
  }
  return node
}

function walk(b: Branch, fn: (b: Branch) => void) {
  fn(b)
  b.children.forEach((c) => walk(c, fn))
}

function makeGraph(cx: number, cy: number, r: number, count: number): { nodes: Node[]; edges: [number, number][] } {
  const n = Math.max(4, Math.round(count))
  const nodes: Node[] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2
    const rr = i % 3 === 0 ? r * 0.38 : r
    nodes.push({
      x: cx + Math.cos(a) * rr,
      y: cy + Math.sin(a) * rr * 0.86,
      ox: cx + Math.cos(a) * rr,
      oy: cy + Math.sin(a) * rr * 0.86,
      vx: 0,
      vy: 0,
    })
  }
  const edges: [number, number][] = []
  for (let i = 0; i < n; i++) {
    edges.push([i, (i + 1) % n])
    if (n > 5) edges.push([i, (i + 2) % n])
  }
  for (let i = 1; i < n; i += 2) edges.push([0, i])
  return { nodes, edges }
}

function plotPoint(
  i: number,
  samples: number,
  cx: number,
  cy: number,
  s: number,
  a: number,
  n: number,
  b: number,
) {
  const t = (i / samples) * Math.PI * 8
  const rr = s * a * Math.cos(n * t) * (1 + b * Math.sin(2 * t))
  return { x: cx + rr * Math.cos(t), y: cy + rr * Math.sin(t) * 0.86 }
}

function springPath(x0: number, y0: number, x1: number, y1: number, coils: number, amp: number) {
  const pts: { x: number; y: number }[] = []
  const dx = x1 - x0
  const dy = y1 - y0
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  const px = -uy
  const py = ux
  pts.push({ x: x0, y: y0 })
  for (let i = 1; i < coils * 2; i++) {
    const t = i / (coils * 2)
    const side = i % 2 === 0 ? 1 : -1
    pts.push({
      x: x0 + ux * len * t + px * amp * side,
      y: y0 + uy * len * t + py * amp * side,
    })
  }
  pts.push({ x: x1, y: y1 })
  return pts
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  display: string
  onChange: (n: number) => void
}) {
  return (
    <label className="hero-life-slider">
      <span className="hero-life-slider-meta">
        <span>{label}</span>
        <span>{display}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  )
}

export default function LifeStage({ reduced, onKind }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const onKindRef = useRef(onKind)
  onKindRef.current = onKind

  const [kind, setKind] = useState<LifeKind>('tree')
  const [params, setParams] = useState<Params>(DEFAULTS)
  const paramsRef = useRef(params)
  paramsRef.current = params
  const busyRef = useRef(false)
  const idleRef = useRef(0)
  const remainRef = useRef<HTMLSpanElement>(null)
  const fillRef = useRef<HTMLSpanElement>(null)
  const setKindRef = useRef(setKind)
  setKindRef.current = setKind

  const markBusy = () => {
    busyRef.current = true
    window.clearTimeout(idleRef.current)
    idleRef.current = window.setTimeout(() => {
      busyRef.current = false
    }, 900)
  }

  const patch = <K extends keyof Params>(scene: K, key: keyof Params[K], value: number) => {
    markBusy()
    setParams((prev) => ({
      ...prev,
      [scene]: { ...prev[scene], [key]: value },
    }))
  }

  useEffect(() => () => window.clearTimeout(idleRef.current), [])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const canvas = document.createElement('canvas')
    canvas.dataset.hero = 'life'
    host.appendChild(canvas)
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let w = 0
    let h = 0
    let dpr = 1
    let kindIndex = 0
    let scene: LifeKind = 'tree'
    let grow = reduced ? 1 : 0
    let t0 = performance.now()
    let holdFrom = performance.now()
    let raf = 0
    let pulling = false
    let pullX = 0
    let pullY = 0
    let pullNode = -1
    let tree = buildTree(0, 0, -Math.PI / 2, 78, 0, 6, 0.42)
    let graph = makeGraph(0, 0, 150, 9)
    let treeKey = ''
    let graphKey = ''
    let plotPull = { x: 0, y: 0 }
    const pendulum = { theta: 0.85, omega: 0 }
    const atwood = { y: 0, v: 0, side: 0 as 0 | 1 }
    const spring = { x: 80, v: 0 }
    const orbit = { ang: 0.4, r: 1, va: 1.05 }

    const layoutTree = () => {
      const p = paramsRef.current.tree
      const len = Math.min(w, h) * 0.16
      tree = buildTree(w * 0.5, h * 0.62, -Math.PI / 2, len, 0, Math.round(p.depth), p.spread)
      treeKey = `${p.depth}:${p.spread}:${w}:${h}`
    }

    const layoutGraph = () => {
      const p = paramsRef.current.graph
      graph = makeGraph(w * 0.5, h * 0.46, Math.min(w, h) * 0.22, p.count)
      graphKey = `${Math.round(p.count)}:${w}:${h}`
      pullNode = -1
    }

    const fit = () => {
      w = host.clientWidth || window.innerWidth
      h = host.clientHeight || window.innerHeight
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      layoutTree()
      layoutGraph()
    }

    const setScene = (next: LifeKind) => {
      scene = next
      grow = reduced ? 1 : 0
      holdFrom = performance.now()
      pullNode = -1
      pulling = false
      plotPull.x = 0
      plotPull.y = 0
      pendulum.theta = 0.85
      pendulum.omega = 0
      atwood.y = 0
      atwood.v = 0
      spring.x = paramsRef.current.spring.rest
      spring.v = 0
      orbit.ang = 0.4
      orbit.va = 1.05
      onKindRef.current(scene)
      setKindRef.current(scene)
    }

    const nearestBranch = (x: number, y: number) => {
      let best: Branch | null = null
      let dist = 48
      walk(tree, (b) => {
        const d = Math.hypot(b.tx - x, b.ty - y)
        if (d < dist) {
          dist = d
          best = b
        }
      })
      return best
    }

    const nearestNode = (x: number, y: number) => {
      let idx = -1
      let dist = 36
      graph.nodes.forEach((n, i) => {
        const d = Math.hypot(n.x - x, n.y - y)
        if (d < dist) {
          dist = d
          idx = i
        }
      })
      return idx
    }

    const pivot = () => ({ x: w * 0.5, y: h * 0.28 })
    const pendLen = () => Math.min(w, h) * paramsRef.current.pendulum.length
    const bobPos = () => {
      const p = pivot()
      const L = pendLen()
      return {
        x: p.x + Math.sin(pendulum.theta) * L,
        y: p.y + Math.cos(pendulum.theta) * L,
      }
    }

    const pulley = () => ({ x: w * 0.5, y: h * 0.24 })
    const atwoodLayout = () => {
      const p = pulley()
      const span = Math.min(w, h) * 0.22
      const { m1, m2 } = paramsRef.current.atwood
      const leftY = p.y + 110 + atwood.y
      const rightY = p.y + 110 - atwood.y
      return {
        p,
        left: { x: p.x - span, y: leftY, w: 52 + m1 * 26, h: 64 + m1 * 28 },
        right: { x: p.x + span, y: rightY, w: 52 + m2 * 26, h: 64 + m2 * 28 },
        r: 32,
      }
    }

    const springAnchor = () => ({ x: w * 0.5, y: h * 0.22 })
    const springMass = () => {
      const a = springAnchor()
      return { x: a.x, y: a.y + 130 + spring.x }
    }

    const orbitCenter = () => ({ x: w * 0.5, y: h * 0.46 })
    const orbitR = () => Math.min(w, h) * paramsRef.current.orbit.radius
    const planetPos = () => {
      const c = orbitCenter()
      const r = orbitR() * orbit.r
      return { x: c.x + Math.cos(orbit.ang) * r, y: c.y + Math.sin(orbit.ang) * r * 0.72 }
    }

    const pointer = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }

    const hit = (p: { x: number; y: number }) => {
      if (scene === 'tree') return !!nearestBranch(p.x, p.y)
      if (scene === 'graph') return nearestNode(p.x, p.y) >= 0
      if (scene === 'plot') return Math.hypot(p.x - w * 0.5, p.y - h * 0.46) < Math.min(w, h) * 0.42
      if (scene === 'pendulum') {
        const b = bobPos()
        const rad = 14 + paramsRef.current.pendulum.mass * 10
        return Math.hypot(p.x - b.x, p.y - b.y) < rad + 12
      }
      if (scene === 'atwood') {
        const a = atwoodLayout()
        const inBox = (box: { x: number; y: number; w: number; h: number }) =>
          p.x > box.x - box.w / 2 &&
          p.x < box.x + box.w / 2 &&
          p.y > box.y &&
          p.y < box.y + box.h
        if (inBox(a.left)) return 1
        if (inBox(a.right)) return 2
        return 0
      }
      if (scene === 'spring') {
        const m = springMass()
        return Math.hypot(p.x - m.x, p.y - m.y) < 52
      }
      const pl = planetPos()
      return Math.hypot(p.x - pl.x, p.y - pl.y) < 48
    }

    const onDown = (e: PointerEvent) => {
      const p = pointer(e)
      if (scene === 'tree') {
        if (!nearestBranch(p.x, p.y)) return
      } else if (scene === 'graph') {
        const i = nearestNode(p.x, p.y)
        if (i < 0) return
        pullNode = i
      } else if (scene === 'atwood') {
        const which = hit(p)
        if (which !== 1 && which !== 2) return
        atwood.side = which === 1 ? 0 : 1
      } else if (!hit(p)) {
        return
      }
      pulling = true
      pullX = p.x
      pullY = p.y
      canvas.setPointerCapture(e.pointerId)
      host.style.cursor = 'grabbing'
      holdFrom = performance.now()
    }

    const onMove = (e: PointerEvent) => {
      const p = pointer(e)
      if (!pulling) {
        host.style.cursor = hit(p) ? 'grab' : ''
        return
      }
      pullX = p.x
      pullY = p.y
      if (scene === 'graph' && pullNode >= 0) {
        const n = graph.nodes[pullNode]
        n.x = p.x
        n.y = p.y
        n.vx = 0
        n.vy = 0
      }
      if (scene === 'plot') {
        plotPull.x += (p.x - w * 0.5 - plotPull.x) * 0.12
        plotPull.y += (p.y - h * 0.46 - plotPull.y) * 0.12
      }
      if (scene === 'pendulum') {
        const pv = pivot()
        pendulum.theta = Math.atan2(p.x - pv.x, p.y - pv.y)
        pendulum.omega = 0
      }
      if (scene === 'atwood') {
        const pul = pulley()
        const y = p.y - (pul.y + 110)
        atwood.y = atwood.side === 0 ? y : -y
        atwood.y = Math.max(-140, Math.min(140, atwood.y))
        atwood.v = 0
      }
      if (scene === 'spring') {
        const a = springAnchor()
        spring.x = Math.max(12, Math.min(240, p.y - a.y - 130))
        spring.v = 0
      }
      if (scene === 'orbit') {
        const c = orbitCenter()
        orbit.ang = Math.atan2(p.y - c.y, p.x - c.x)
        orbit.r = Math.max(0.45, Math.min(1.35, Math.hypot(p.x - c.x, (p.y - c.y) / 0.72) / orbitR()))
      }
      holdFrom = performance.now()
    }

    const onUp = () => {
      pulling = false
      pullNode = -1
      host.style.cursor = ''
    }

    const stroke = (color: string, width: number) => {
      ctx.strokeStyle = color
      ctx.lineWidth = width
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
    }

    const drawTree = (g: number) => {
      walk(tree, (b) => {
        const local = ease(g * 7 - b.depth)
        if (local <= 0) return
        let x2 = b.x + (b.tx - b.x) * local
        let y2 = b.y + (b.ty - b.y) * local
        if (pulling) {
          const fall = 1 / (1 + b.depth * 0.65)
          x2 += (pullX - b.tx) * 0.18 * fall
          y2 += (pullY - b.ty) * 0.18 * fall
        }
        ctx.beginPath()
        ctx.moveTo(b.x, b.y)
        ctx.lineTo(x2, y2)
        stroke(
          b.depth < 2 ? 'rgba(245,241,232,0.92)' : b.depth < 4 ? 'rgba(158,192,255,0.75)' : 'rgba(227,162,60,0.7)',
          Math.max(1.1, 7 - b.depth * 1.05),
        )
        ctx.stroke()
      })
    }

    const drawGraph = (g: number, dt: number) => {
      const k = paramsRef.current.graph.stiffness
      graph.nodes.forEach((n, i) => {
        if (!(pulling && i === pullNode)) {
          n.vx += (n.ox - n.x) * k * dt
          n.vy += (n.oy - n.y) * k * dt
          n.vx *= 0.82
          n.vy *= 0.82
          n.x += n.vx
          n.y += n.vy
        }
      })
      const vis = Math.floor(graph.edges.length * ease(g))
      graph.edges.slice(0, Math.max(1, vis)).forEach(([a, b], i) => {
        const na = graph.nodes[a]
        const nb = graph.nodes[b]
        ctx.beginPath()
        ctx.moveTo(na.x, na.y)
        ctx.lineTo(nb.x, nb.y)
        stroke(i % 2 === 0 ? 'rgba(245,241,232,0.55)' : 'rgba(158,192,255,0.45)', 1.6)
        ctx.stroke()
      })
      const nVis = Math.floor(graph.nodes.length * ease(g * 1.1))
      graph.nodes.slice(0, Math.max(1, nVis)).forEach((n, i) => {
        ctx.beginPath()
        ctx.arc(n.x, n.y, i === 0 ? 8 : 5.5, 0, Math.PI * 2)
        ctx.fillStyle = i === 0 ? '#9ec0ff' : '#f5f1e8'
        ctx.fill()
      })
    }

    const drawPlot = (g: number) => {
      const { a, n, b } = paramsRef.current.plot
      const samples = 280
      const s = Math.min(w, h) * 0.34
      const cx = w * 0.5 + plotPull.x * 0.08
      const cy = h * 0.46 + plotPull.y * 0.08
      const shown = Math.floor(samples * ease(g))
      ctx.beginPath()
      for (let i = 0; i <= shown; i++) {
        const pt = plotPoint(i, samples, cx, cy, s, a, n, b)
        if (i === 0) ctx.moveTo(pt.x, pt.y)
        else ctx.lineTo(pt.x, pt.y)
      }
      stroke('rgba(245,241,232,0.92)', 3.6)
      ctx.stroke()
      if (shown > 8) {
        const tip = plotPoint(shown, samples, cx, cy, s, a, n, b)
        ctx.beginPath()
        ctx.arc(tip.x, tip.y, 9, 0, Math.PI * 2)
        ctx.fillStyle = '#e3a23c'
        ctx.fill()
      }
    }

    const drawPendulum = (g: number, dt: number) => {
      const pv = pivot()
      const L = pendLen()
      const { mass, damping } = paramsRef.current.pendulum
      if (!pulling) {
        pendulum.omega += (-(980 / L) * Math.sin(pendulum.theta) - damping * pendulum.omega) * dt
        pendulum.theta += pendulum.omega * dt
      }
      const bob = bobPos()
      const vis = ease(g)
      const rad = (12 + mass * 10) * vis
      ctx.beginPath()
      ctx.arc(pv.x, pv.y, 4, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(245,241,232,0.7)'
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(pv.x, pv.y)
      ctx.lineTo(pv.x + (bob.x - pv.x) * vis, pv.y + (bob.y - pv.y) * vis)
      stroke('rgba(245,241,232,0.85)', 2.2)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(pv.x + (bob.x - pv.x) * vis, pv.y + (bob.y - pv.y) * vis, rad, 0, Math.PI * 2)
      ctx.fillStyle = '#f5f1e8'
      ctx.fill()
      ctx.beginPath()
      ctx.arc(pv.x + (bob.x - pv.x) * vis - rad * 0.28, pv.y + (bob.y - pv.y) * vis - rad * 0.28, rad * 0.28, 0, Math.PI * 2)
      ctx.fillStyle = '#9ec0ff'
      ctx.fill()
    }

    const drawAtwood = (g: number, dt: number) => {
      const { m1, m2, friction } = paramsRef.current.atwood
      if (!pulling) {
        const acc = (420 * (m1 - m2)) / (m1 + m2)
        atwood.v += acc * dt
        atwood.v *= friction
        atwood.y += atwood.v * dt
        if (atwood.y > 140 || atwood.y < -140) {
          atwood.y = Math.max(-140, Math.min(140, atwood.y))
          atwood.v *= -0.35
        }
      }
      const a = atwoodLayout()
      const vis = ease(g)
      const pr = a.r
      ctx.beginPath()
      ctx.arc(a.p.x, a.p.y, pr, 0, Math.PI * 2)
      stroke('rgba(245,241,232,0.85)', 3)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(a.p.x, a.p.y, 9, 0, Math.PI * 2)
      ctx.fillStyle = '#e3a23c'
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(a.left.x, a.p.y)
      ctx.arcTo(a.p.x - pr, a.p.y, a.p.x, a.p.y - pr, pr)
      ctx.arcTo(a.p.x + pr, a.p.y, a.right.x, a.p.y, pr)
      ctx.lineTo(a.right.x, a.p.y)
      ctx.moveTo(a.left.x, a.p.y)
      ctx.lineTo(a.left.x, a.p.y + (a.left.y - a.p.y) * vis)
      ctx.moveTo(a.right.x, a.p.y)
      ctx.lineTo(a.right.x, a.p.y + (a.right.y - a.p.y) * vis)
      stroke('rgba(245,241,232,0.75)', 2.6)
      ctx.stroke()
      const box = (b: { x: number; y: number; w: number; h: number }, fill: string) => {
        ctx.fillStyle = fill
        ctx.fillRect(b.x - b.w / 2, a.p.y + (b.y - a.p.y) * vis, b.w, b.h * vis)
      }
      box(a.left, '#f5f1e8')
      box(a.right, '#9ec0ff')
    }

    const drawSpring = (g: number, dt: number) => {
      const { k, width, rest } = paramsRef.current.spring
      if (!pulling) {
        spring.v += (-k * (spring.x - rest) - 1.6 * spring.v) * dt
        spring.x += spring.v * dt
      }
      const a = springAnchor()
      const m = springMass()
      const vis = ease(g)
      const y = a.y + (m.y - a.y) * vis
      const coils = springPath(a.x, a.y + 12, a.x, y - 28, 11, width)
      ctx.beginPath()
      ctx.moveTo(a.x - 28, a.y)
      ctx.lineTo(a.x + 28, a.y)
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(a.x, a.y + 12)
      stroke('rgba(245,241,232,0.55)', 2.2)
      ctx.stroke()
      ctx.beginPath()
      coils.forEach((pt, i) => {
        if (i === 0) ctx.moveTo(pt.x, pt.y)
        else ctx.lineTo(pt.x, a.y + (pt.y - a.y) * vis)
      })
      stroke('rgba(158,192,255,0.9)', 1.8 + width * 0.09)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(a.x, y, 32 * vis, 0, Math.PI * 2)
      ctx.fillStyle = '#f5f1e8'
      ctx.fill()
    }

    const drawOrbit = (g: number, dt: number) => {
      const { speed, sun } = paramsRef.current.orbit
      if (!pulling) {
        orbit.va = (0.55 + 0.7 / Math.max(0.4, orbit.r)) * speed
        orbit.ang += orbit.va * dt
        orbit.r += (1 - orbit.r) * 0.8 * dt
      }
      const c = orbitCenter()
      const r = orbitR()
      const vis = ease(g)
      ctx.beginPath()
      ctx.ellipse(c.x, c.y, r * vis, r * 0.72 * vis, 0, 0, Math.PI * 2)
      stroke('rgba(245,241,232,0.22)', 1.8)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(c.x, c.y, 18 * sun * vis, 0, Math.PI * 2)
      ctx.fillStyle = '#e3a23c'
      ctx.fill()
      const pl = planetPos()
      ctx.beginPath()
      ctx.arc(c.x + (pl.x - c.x) * vis, c.y + (pl.y - c.y) * vis, 16, 0, Math.PI * 2)
      ctx.fillStyle = '#f5f1e8'
      ctx.fill()
      ctx.beginPath()
      ctx.arc(c.x + (pl.x - c.x) * vis - 5, c.y + (pl.y - c.y) * vis - 4, 4.5, 0, Math.PI * 2)
      ctx.fillStyle = '#9ec0ff'
      ctx.fill()
    }

    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now

      const tp = paramsRef.current.tree
      const gp = paramsRef.current.graph
      const nextTree = `${tp.depth}:${tp.spread}:${w}:${h}`
      const nextGraph = `${Math.round(gp.count)}:${w}:${h}`
      if (nextTree !== treeKey) layoutTree()
      if (nextGraph !== graphKey) layoutGraph()

      if (busyRef.current || pulling) holdFrom = now

      if (!reduced) {
        grow = ease((now - t0) / 1000 / GROW)
        if (!pulling && !busyRef.current && now - holdFrom > HOLD * 1000 && grow > 0.98) {
          kindIndex = (kindIndex + 1) % ORDER.length
          t0 = now
          setScene(ORDER[kindIndex])
        }
        const remain = Math.max(0, HOLD - (now - holdFrom) / 1000)
        const sec = remainRef.current
        const fill = fillRef.current
        if (sec) {
          const text = remain.toFixed(1)
          if (sec.textContent !== text) sec.textContent = text
        }
        if (fill) fill.style.transform = `scaleX(${remain / HOLD})`
      } else {
        grow = 1
      }

      ctx.clearRect(0, 0, w, h)
      if (scene === 'tree') drawTree(grow)
      else if (scene === 'graph') drawGraph(grow, dt)
      else if (scene === 'plot') drawPlot(grow)
      else if (scene === 'pendulum') drawPendulum(grow, dt)
      else if (scene === 'atwood') drawAtwood(grow, dt)
      else if (scene === 'spring') drawSpring(grow, dt)
      else drawOrbit(grow, dt)

      raf = requestAnimationFrame(tick)
    }

    fit()
    onKindRef.current(scene)
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
      host.style.cursor = ''
      if (canvas.parentNode === host) host.removeChild(canvas)
    }
  }, [reduced])

  const formula =
    kind === 'plot'
      ? `r = ${show(params.plot.a)} cos(${show(params.plot.n, 1)}θ)(1 + ${show(params.plot.b)} sin(2θ))`
      : kind === 'pendulum'
        ? 'θ̈ + (g/ℓ) sin θ = 0'
        : kind === 'atwood'
          ? 'a = g(m₁ − m₂)/(m₁ + m₂)'
          : kind === 'spring'
            ? 'F = −kx'
            : kind === 'orbit'
              ? 'T² ∝ r³'
              : kind === 'tree'
                ? 'f → f(left), f(right)'
                : 'G = (V, E)'

  return (
    <>
      <div ref={hostRef} className="hero-stage-canvas" />
      <aside
        className="hero-life-desk"
        aria-label="Tune this generation"
        onPointerDown={() => {
          busyRef.current = true
          window.clearTimeout(idleRef.current)
        }}
        onPointerUp={markBusy}
        onPointerCancel={markBusy}
      >
        {reduced ? null : (
          <div className="hero-life-timer" aria-hidden>
            <span className="hero-life-timer-meta">
              <span>Next</span>
              <span>
                <span ref={remainRef}>6.4</span>s
              </span>
            </span>
            <span className="hero-life-timer-track">
              <span className="hero-life-timer-fill" ref={fillRef} />
            </span>
          </div>
        )}
        <p className="hero-life-formula">{formula}</p>
        {kind === 'tree' ? (
          <>
            <Slider
              label="Spread"
              value={params.tree.spread}
              min={0.22}
              max={0.72}
              step={0.01}
              display={show(params.tree.spread)}
              onChange={(n) => patch('tree', 'spread', n)}
            />
            <Slider
              label="Depth"
              value={params.tree.depth}
              min={4}
              max={7}
              step={1}
              display={String(Math.round(params.tree.depth))}
              onChange={(n) => patch('tree', 'depth', n)}
            />
          </>
        ) : null}
        {kind === 'graph' ? (
          <>
            <Slider
              label="Nodes"
              value={params.graph.count}
              min={6}
              max={14}
              step={1}
              display={String(Math.round(params.graph.count))}
              onChange={(n) => patch('graph', 'count', n)}
            />
            <Slider
              label="Tension"
              value={params.graph.stiffness}
              min={4}
              max={22}
              step={0.5}
              display={show(params.graph.stiffness, 1)}
              onChange={(n) => patch('graph', 'stiffness', n)}
            />
          </>
        ) : null}
        {kind === 'plot' ? (
          <>
            <Slider
              label="a"
              value={params.plot.a}
              min={0.45}
              max={1.35}
              step={0.01}
              display={show(params.plot.a)}
              onChange={(n) => patch('plot', 'a', n)}
            />
            <Slider
              label="n"
              value={params.plot.n}
              min={1.5}
              max={8}
              step={0.5}
              display={show(params.plot.n, 1)}
              onChange={(n) => patch('plot', 'n', n)}
            />
            <Slider
              label="b"
              value={params.plot.b}
              min={0}
              max={0.85}
              step={0.01}
              display={show(params.plot.b)}
              onChange={(n) => patch('plot', 'b', n)}
            />
          </>
        ) : null}
        {kind === 'pendulum' ? (
          <>
            <Slider
              label="Length"
              value={params.pendulum.length}
              min={0.18}
              max={0.48}
              step={0.01}
              display={show(params.pendulum.length)}
              onChange={(n) => patch('pendulum', 'length', n)}
            />
            <Slider
              label="Mass"
              value={params.pendulum.mass}
              min={0.4}
              max={2.2}
              step={0.05}
              display={show(params.pendulum.mass)}
              onChange={(n) => patch('pendulum', 'mass', n)}
            />
            <Slider
              label="Damping"
              value={params.pendulum.damping}
              min={0.04}
              max={0.85}
              step={0.01}
              display={show(params.pendulum.damping)}
              onChange={(n) => patch('pendulum', 'damping', n)}
            />
          </>
        ) : null}
        {kind === 'atwood' ? (
          <>
            <Slider
              label="m₁"
              value={params.atwood.m1}
              min={0.4}
              max={2.6}
              step={0.05}
              display={show(params.atwood.m1)}
              onChange={(n) => patch('atwood', 'm1', n)}
            />
            <Slider
              label="m₂"
              value={params.atwood.m2}
              min={0.4}
              max={2.6}
              step={0.05}
              display={show(params.atwood.m2)}
              onChange={(n) => patch('atwood', 'm2', n)}
            />
            <Slider
              label="Friction"
              value={params.atwood.friction}
              min={0.96}
              max={0.999}
              step={0.001}
              display={show(params.atwood.friction, 3)}
              onChange={(n) => patch('atwood', 'friction', n)}
            />
          </>
        ) : null}
        {kind === 'spring' ? (
          <>
            <Slider
              label="k"
              value={params.spring.k}
              min={4}
              max={40}
              step={0.5}
              display={show(params.spring.k, 1)}
              onChange={(n) => patch('spring', 'k', n)}
            />
            <Slider
              label="Width"
              value={params.spring.width}
              min={8}
              max={36}
              step={0.5}
              display={show(params.spring.width, 1)}
              onChange={(n) => patch('spring', 'width', n)}
            />
            <Slider
              label="Rest"
              value={params.spring.rest}
              min={36}
              max={160}
              step={1}
              display={String(Math.round(params.spring.rest))}
              onChange={(n) => patch('spring', 'rest', n)}
            />
          </>
        ) : null}
        {kind === 'orbit' ? (
          <>
            <Slider
              label="Radius"
              value={params.orbit.radius}
              min={0.2}
              max={0.44}
              step={0.01}
              display={show(params.orbit.radius)}
              onChange={(n) => patch('orbit', 'radius', n)}
            />
            <Slider
              label="Speed"
              value={params.orbit.speed}
              min={0.25}
              max={2.4}
              step={0.05}
              display={show(params.orbit.speed)}
              onChange={(n) => patch('orbit', 'speed', n)}
            />
            <Slider
              label="Sun"
              value={params.orbit.sun}
              min={0.55}
              max={2.1}
              step={0.05}
              display={show(params.orbit.sun)}
              onChange={(n) => patch('orbit', 'sun', n)}
            />
          </>
        ) : null}
      </aside>
    </>
  )
}
