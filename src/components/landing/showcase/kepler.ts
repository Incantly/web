/**
 * Kepler orbits for the landing showcase, in units of the semi-major axis and the orbital period
 * (so GM = 4π²). The Sun sits at the origin, which is one focus of the ellipse.
 */

/** Solves Kepler's equation M = E − e·sin E for the eccentric anomaly E. */
export function eccentricAnomaly(meanAnomaly: number, e: number) {
  let E = e < 0.8 ? meanAnomaly : Math.PI
  for (let step = 0; step < 30; step++) {
    const delta = (E - e * Math.sin(E) - meanAnomaly) / (1 - e * Math.cos(E))
    E -= delta
    if (Math.abs(delta) < 1e-12) break
  }
  return E
}

export type OrbitPoint = { x: number; y: number; r: number; speed: number }

/**
 * Position at time t (in periods) on an orbit with semi-major axis 1, starting at perihelion.
 * x points from the Sun to perihelion; speed comes from the vis-viva equation.
 */
export function orbitAt(t: number, e: number): OrbitPoint {
  const meanAnomaly = 2 * Math.PI * (t - Math.floor(t))
  const E = eccentricAnomaly(meanAnomaly, e)
  const x = Math.cos(E) - e
  const y = Math.sqrt(1 - e * e) * Math.sin(E)
  const r = 1 - e * Math.cos(E)
  const speed = 2 * Math.PI * Math.sqrt(2 / r - 1)
  return { x, y, r, speed }
}

/** Area swept by the Sun–planet line between two times, summed from thin triangles at the focus. */
export function sweptArea(from: number, to: number, e: number, slices = 400) {
  let area = 0
  let previous = orbitAt(from, e)
  for (let index = 1; index <= slices; index++) {
    const next = orbitAt(from + ((to - from) * index) / slices, e)
    area += (previous.x * next.y - next.x * previous.y) / 2
    previous = next
  }
  return area
}
