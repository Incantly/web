export type HeroBeat = 'write' | 'thicken' | 'lift' | 'hang'

export type RibbonSim = {
  reveal: number
  thick: number
  lift: number
  sag: number
  breathe: number
  dragging: boolean
}

export function createSim(reduced: boolean): RibbonSim {
  return {
    reveal: reduced ? 1 : 0,
    thick: reduced ? 1 : 0.14,
    lift: reduced ? 1 : 0,
    sag: reduced ? 0.4 : 0,
    breathe: 0,
    dragging: false,
  }
}

export const T_WRITE = 2.2
export const T_THICKEN = 3.4
export const T_LIFT = 4.8
