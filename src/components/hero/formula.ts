/** Borderless point-plots: formula creature, helix, wavelength. Units ≈ p5 200×200 space. */

export type LessonId = 'formula' | 'dna' | 'wave'

export const LESSONS: Array<{
  id: LessonId
  kicker: string
  caption: string
}> = [
  {
    id: 'formula',
    kicker: 'A living notebook',
    caption: "Your text, alive. Don't watch a tutorial.",
  },
  {
    id: 'dna',
    kicker: 'Notation, then a body',
    caption: 'Write a helix. Hold it. Twist it.',
  },
  {
    id: 'wave',
    kicker: 'No box. No chart.',
    caption: 'A wavelength that lives on the page.',
  },
]

export type Vec = { x: number; y: number }

function mag(x: number, y: number) {
  return Math.hypot(x, y)
}

/** Port of the p5 `a()` plot — white ink from a compact formula. */
export function plotFormula(i: number, t: number): Vec {
  const m = (i % 16) * 13
  const k = 9 * Math.cos(i * 5) * Math.sin(i)
  const e = Math.cos(i * 3) * Math.cos(i * 2) * 9
  const d = mag(k, e) ** 3 / 1999 + 1.5 - Math.sin(t / 2 + m) ** 3 / 3
  const c = d / 16 - t / 48 + m
  const p = d ** Math.sin(d * d - t + m)
  return {
    x: 99 * Math.sin(c) + k * p,
    y: 99 * Math.sin(c * 4) + e * p,
  }
}

export function plotDna(i: number, t: number, count: number): Vec {
  const u = i / count
  const turns = u * Math.PI * 12 + t * 0.35
  const r = 28 + Math.sin(u * Math.PI * 8 + t) * 4
  const strand = i % 2 === 0 ? 0 : Math.PI
  return {
    x: Math.cos(turns + strand) * r,
    y: (u - 0.5) * 188 + Math.sin(turns * 0.5) * 6,
  }
}

export function plotWave(i: number, t: number, count: number): Vec {
  const u = i / (count - 1)
  const x = (u - 0.5) * 200
  const y =
    Math.sin(u * Math.PI * 4.7 - t * 0.9) * 36 +
    Math.sin(u * Math.PI * 11 - t * 1.4) * 8
  return { x, y }
}

export function plotLesson(id: LessonId, i: number, t: number, count: number): Vec {
  if (id === 'dna') return plotDna(i, t, count)
  if (id === 'wave') return plotWave(i, t, count)
  return plotFormula(i, t)
}
