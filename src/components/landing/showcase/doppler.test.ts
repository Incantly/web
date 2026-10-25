import { describe, expect, it } from 'vitest'
import { approachFrequency, arrivals, machAngleDegrees, recedeFrequency } from './doppler'

describe('Doppler formulas', () => {
  it('matches the note: 440 Hz at 0.9c is 4400 Hz approaching and about 232 Hz receding', () => {
    expect(approachFrequency(440, 0.9)).toBeCloseTo(4400, 6)
    expect(Math.round(recedeFrequency(440, 0.9))).toBe(232)
  })

  it('gives a 41.8° Mach cone at 1.5c and none below the speed of sound', () => {
    expect(machAngleDegrees(1.5)).toBeCloseTo(41.81, 2)
    expect(machAngleDegrees(0.9)).toBeNull()
    expect(approachFrequency(440, 1.5)).toBe(Infinity)
  })
})

describe('arrivals from true travel times', () => {
  const pass = { x0: -10, mach: 0.9, lx: 0, ly: 0, start: -100 }

  it('hears the approach pitch before the source passes and the recede pitch after', () => {
    const before = arrivals(5, 440, pass)
    expect(before).toHaveLength(1)
    expect(before[0].frequency).toBeCloseTo(4400, 3)
    const after = arrivals(30, 440, pass)
    expect(after).toHaveLength(1)
    expect(after[0].frequency).toBeCloseTo(440 / 1.9, 3)
  })

  it('solves the travel time exactly', () => {
    const [hit] = arrivals(20, 440, { ...pass, ly: 2 })
    const dx = pass.x0 + pass.mach * hit.emittedAt
    expect(20 - hit.emittedAt).toBeCloseTo(Math.hypot(dx, 2), 9)
  })

  it('is silent until a supersonic source’s cone arrives, then hears two wavefronts', () => {
    const fast = { x0: -10, mach: 1.5, lx: 0, ly: 2, start: -100 }
    expect(arrivals(6, 440, fast)).toHaveLength(0)
    expect(arrivals(12, 440, fast)).toHaveLength(2)
  })

  it('ignores emissions from before the source started', () => {
    expect(arrivals(1, 440, { ...pass, start: 0 })).toHaveLength(0)
  })
})
