/**
 * Doppler and Mach-cone math for the landing showcase. Distances are in units where the speed of
 * sound is 1 per second, so a Mach number is also the source speed.
 */

/** Pitch heard on the line of motion while the source approaches; unbounded at or above Mach 1. */
export function approachFrequency(f0: number, mach: number) {
  return mach < 1 ? f0 / (1 - mach) : Infinity
}

/** Pitch heard on the line of motion once the source has passed. */
export function recedeFrequency(f0: number, mach: number) {
  return f0 / (1 + mach)
}

/** Half-angle of the Mach cone in degrees, or null below the speed of sound. */
export function machAngleDegrees(mach: number) {
  return mach > 1 ? (Math.asin(1 / mach) * 180) / Math.PI : null
}

export type Pass = {
  /** Source position along x at t = 0. */
  x0: number
  /** Source speed as a Mach number; the source moves along +x on y = 0. */
  mach: number
  /** Listener position. */
  lx: number
  ly: number
  /** The source starts emitting at this time; nothing older exists. */
  start: number
}

export type Arrival = { emittedAt: number; frequency: number }

/**
 * Every wavefront reaching the listener at time `t`, found from true travel times: emission time
 * te solves c·(t − te) = |source(te) − listener|. A supersonic source can have two (one arriving
 * time-reversed), or none before its cone has swept past the listener.
 */
export function arrivals(t: number, f0: number, pass: Pass): Arrival[] {
  const { x0, mach: v, lx, ly, start } = pass
  const a = x0 - lx
  // (1 − v²)·te² − 2(t + a·v)·te + (t² − a² − ly²) = 0, with c = 1.
  const qa = 1 - v * v
  const qb = -2 * (t + a * v)
  const qc = t * t - a * a - ly * ly
  const roots: number[] = []
  if (Math.abs(qa) < 1e-9) {
    if (Math.abs(qb) > 1e-12) roots.push(-qc / qb)
  } else {
    const disc = qb * qb - 4 * qa * qc
    if (disc >= 0) {
      const s = Math.sqrt(disc)
      roots.push((-qb - s) / (2 * qa), (-qb + s) / (2 * qa))
    }
  }
  return roots
    .filter((te) => te <= t + 1e-9 && te >= start)
    .map((te) => {
      const dx = x0 + v * te - lx
      const d = Math.hypot(dx, ly)
      // d(te)/dt = 1 / (1 + v·cos φ), where cos φ points from listener to source.
      const cos = d > 1e-9 ? dx / d : 0
      return { emittedAt: te, frequency: Math.abs(f0 / (1 + v * cos)) }
    })
    .sort((left, right) => left.emittedAt - right.emittedAt)
}
