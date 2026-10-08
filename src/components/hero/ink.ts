/** Short handwritten mark in world units (not a wavelength chart). */

export type InkPt = { x: number; y: number; z: number; p: number }

export function ribbonInk(): InkPt[] {
  const pts: InkPt[] = []
  const n = 56
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const x = (t - 0.5) * 2.55
    const y =
      Math.sin(t * Math.PI * 1.85) * 0.32 +
      Math.sin(t * 13.4) * 0.045 +
      Math.sin(t * 31) * 0.018
    const z = 0
    const p = 0.42 + 0.5 * Math.sin(t * Math.PI)
    pts.push({ x, y, z, p })
  }
  return pts
}
