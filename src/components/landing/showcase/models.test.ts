import { describe, expect, it } from 'vitest'
import { epicycleChain, partialSum, peakHeight, squareWaveHarmonics } from './fourier'
import { eccentricAnomaly, orbitAt, sweptArea } from './kepler'
import { equilibrium, invariant, peakTimes, simulate } from './predatorPrey'

describe('Kepler orbits', () => {
  it('solves Kepler’s equation even for eccentric orbits', () => {
    for (const e of [0, 0.4, 0.7, 0.95]) {
      for (const M of [0.1, 1, 2.5, 4, 6]) {
        const E = eccentricAnomaly(M, e)
        expect(E - e * Math.sin(E)).toBeCloseTo(M, 10)
      }
    }
  })

  it('sweeps equal areas in equal times', () => {
    const e = 0.7
    const total = Math.PI * Math.sqrt(1 - e * e)
    for (let month = 0; month < 12; month++) expect(sweptArea(month / 12, (month + 1) / 12, e)).toBeCloseTo(total / 12, 4)
  })

  it('moves fastest at perihelion and slowest at aphelion', () => {
    const e = 0.7
    const perihelion = orbitAt(0, e)
    const aphelion = orbitAt(0.5, e)
    expect(perihelion.r).toBeCloseTo(1 - e, 9)
    expect(aphelion.r).toBeCloseTo(1 + e, 9)
    expect(perihelion.speed / aphelion.speed).toBeCloseTo((1 + e) / (1 - e), 6)
  })
})

describe('Fourier square wave', () => {
  it('uses odd harmonics with shrinking circles', () => {
    expect(squareWaveHarmonics(4).map((term) => term.frequency)).toEqual([1, 3, 5, 7])
    expect(squareWaveHarmonics(1)[0].radius).toBeCloseTo(4 / Math.PI, 12)
  })

  it('converges to ±1 away from the jumps', () => {
    const many = squareWaveHarmonics(400)
    expect(partialSum(Math.PI / 2, many)).toBeCloseTo(1, 2)
    expect(partialSum(-Math.PI / 2, many)).toBeCloseTo(-1, 2)
  })

  it('ends the circle chain at the partial sum', () => {
    const terms = squareWaveHarmonics(9)
    const chain = epicycleChain(0.7, terms)
    expect(chain).toHaveLength(10)
    expect(chain[9][1]).toBeCloseTo(partialSum(0.7, terms), 12)
  })

  it('overshoots the jump by about 9% however many circles there are (Gibbs)', () => {
    expect(peakHeight(squareWaveHarmonics(25))).toBeCloseTo(1.179, 2)
    expect(peakHeight(squareWaveHarmonics(200))).toBeGreaterThan(1.17)
  })
})

describe('Lotka–Volterra predator and prey', () => {
  it('stays put at the balance point', () => {
    const run = simulate(equilibrium.rabbits, equilibrium.foxes, 20)
    const last = run[run.length - 1]
    expect(last.rabbits).toBeCloseTo(equilibrium.rabbits, 9)
    expect(last.foxes).toBeCloseTo(equilibrium.foxes, 9)
  })

  it('keeps the conserved quantity constant, so the loop closes', () => {
    const run = simulate(10, 2, 60)
    const start = invariant(run[0].rabbits, run[0].foxes)
    for (const sample of run.filter((_, index) => index % 500 === 0)) expect(invariant(sample.rabbits, sample.foxes)).toBeCloseTo(start, 6)
  })

  it('peaks foxes after rabbits in every cycle', () => {
    const run = simulate(10, 2, 60)
    const rabbits = peakTimes(run, 'rabbits')
    const foxes = peakTimes(run, 'foxes')
    expect(rabbits.length).toBeGreaterThanOrEqual(3)
    rabbits.slice(0, 3).forEach((time, index) => {
      const nextFox = foxes.find((fox) => fox > time)!
      expect(nextFox).toBeGreaterThan(time)
      if (rabbits[index + 1]) expect(nextFox).toBeLessThan(rabbits[index + 1])
    })
  })
})
