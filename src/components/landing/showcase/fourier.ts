/**
 * The Fourier series of a square wave, f(t) = (4/π)(sin t + sin 3t / 3 + sin 5t / 5 + …), drawn as
 * a chain of spinning circles: one circle per odd harmonic, each riding on the tip of the last.
 */

export type Harmonic = { frequency: number; radius: number }

/** The first `count` terms: odd frequencies 1, 3, 5… with radius 4 / (π·frequency). */
export function squareWaveHarmonics(count: number): Harmonic[] {
  return Array.from({ length: count }, (_, index) => {
    const frequency = 2 * index + 1
    return { frequency, radius: 4 / (Math.PI * frequency) }
  })
}

/**
 * Where each circle's centre and the final tip sit at time t, as [cos, sin] sums. The last
 * point's second coordinate is the partial sum of the series.
 */
export function epicycleChain(t: number, harmonics: Harmonic[]): [number, number][] {
  const points: [number, number][] = [[0, 0]]
  let x = 0
  let y = 0
  for (const { frequency, radius } of harmonics) {
    x += radius * Math.cos(frequency * t)
    y += radius * Math.sin(frequency * t)
    points.push([x, y])
  }
  return points
}

export function partialSum(t: number, harmonics: Harmonic[]) {
  return harmonics.reduce((sum, { frequency, radius }) => sum + radius * Math.sin(frequency * t), 0)
}

/** The highest point of the partial sum within one half-period: above 1 is the Gibbs overshoot. */
export function peakHeight(harmonics: Harmonic[], samples = 4000) {
  let peak = -Infinity
  for (let index = 1; index < samples; index++) peak = Math.max(peak, partialSum((index / samples) * Math.PI, harmonics))
  return peak
}
