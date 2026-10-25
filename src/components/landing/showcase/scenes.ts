import type { ViewName } from './stage'

/**
 * Every visual the showcase can generate: its camera views, its one adjustable parameter, and a
 * lazy loader so three.js and the scene code download only when a visual is generated.
 */

export type VisualKind = 'euler' | 'kepler' | 'doppler' | 'fourier' | 'predator'

/** A live number shown over the stage; `accent` highlights the one that changes most. */
export type Readout = { label: string; value: string; accent?: boolean }
export type ReadoutSink = (rows: Readout[]) => void

export type SceneController = {
  setPlaying: (playing: boolean) => void
  setView: (view: ViewName) => void
  restart: () => void
  setParam?: (value: number) => void
  setSound?: (on: boolean) => void
  dispose: () => void
}

type ParamOption = { value: number; label: string; description: string }

export type SceneConfig = {
  label: string
  views: { name: ViewName; label: string }[]
  param?: { label: string; initial: number; options: ParamOption[] }
  sound?: boolean
  load: (host: HTMLElement, onReadout: ReadoutSink) => Promise<SceneController>
}

export const sceneConfigs: Record<VisualKind, SceneConfig> = {
  euler: {
    label: 'Interactive 3D visual of Euler’s formula',
    views: [{ name: 'iso', label: 'Isometric' }, { name: 'front', label: 'Circle' }, { name: 'side', label: 'Sine' }, { name: 'top', label: 'Cosine' }],
    load: (host, onReadout) => import('./eulerScene').then((module) => module.createEulerScene(host, onReadout)),
  },
  kepler: {
    label: 'Interactive 3D visual of a planet’s orbit and Kepler’s second law',
    views: [{ name: 'iso', label: 'Isometric' }, { name: 'top', label: 'Face-on' }, { name: 'side', label: 'Edge-on' }],
    param: {
      label: 'Orbit eccentricity',
      initial: 0.4,
      options: [
        { value: 0, label: 'e = 0', description: 'Circular orbit' },
        { value: 0.4, label: 'e = 0.4', description: 'Eccentricity 0.4' },
        { value: 0.7, label: 'e = 0.7', description: 'Eccentricity 0.7, like a comet' },
      ],
    },
    load: (host, onReadout) => import('./keplerScene').then((module) => module.createKeplerScene(host, onReadout)),
  },
  doppler: {
    label: 'Interactive 3D visual of the Doppler effect',
    views: [{ name: 'iso', label: 'Isometric' }, { name: 'top', label: 'Top' }, { name: 'side', label: 'Side' }],
    param: {
      label: 'Source speed',
      initial: 0.9,
      options: [
        { value: 0.5, label: '0.5c', description: '0.5 times the speed of sound' },
        { value: 0.9, label: '0.9c', description: '0.9 times the speed of sound' },
        { value: 1.5, label: '1.5c', description: '1.5 times the speed of sound' },
      ],
    },
    sound: true,
    load: (host, onReadout) => import('./dopplerScene').then((module) => module.createDopplerScene(host, onReadout)),
  },
  fourier: {
    label: 'Interactive 3D visual of a square wave built from spinning circles',
    views: [{ name: 'iso', label: 'Isometric' }, { name: 'front', label: 'Circles' }, { name: 'side', label: 'Wave' }],
    param: {
      label: 'Number of circles',
      initial: 3,
      options: [
        { value: 1, label: '1', description: 'One circle' },
        { value: 3, label: '3', description: 'Three circles' },
        { value: 9, label: '9', description: 'Nine circles' },
        { value: 25, label: '25', description: 'Twenty-five circles' },
      ],
    },
    load: (host, onReadout) => import('./fourierScene').then((module) => module.createFourierScene(host, onReadout)),
  },
  predator: {
    label: 'Interactive 3D visual of rabbit and fox populations over time',
    views: [{ name: 'iso', label: 'Isometric' }, { name: 'front', label: 'Cycle' }, { name: 'side', label: 'Foxes' }, { name: 'top', label: 'Rabbits' }],
    param: {
      label: 'Starting rabbits',
      initial: 100,
      options: [
        { value: 50, label: '50', description: 'Start with 50 rabbits' },
        { value: 100, label: '100', description: 'Start with 100 rabbits' },
        { value: 200, label: '200', description: 'Start with 200 rabbits' },
      ],
    },
    load: (host, onReadout) => import('./predatorScene').then((module) => module.createPredatorScene(host, onReadout)),
  },
}
