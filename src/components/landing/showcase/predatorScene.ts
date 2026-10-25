import * as THREE from 'three'
import { equilibrium, peakTimes, simulate, type Sample } from './predatorPrey'
import type { ReadoutSink } from './scenes'
import { createStage } from './stage'

/**
 * Rabbits and foxes over time, in the same layout as the Euler scene: the joint state is a curve
 * running along the time axis, its shadow on the floor is the rabbit count, its shadow on the back
 * wall is the fox count, and the closed loop at time zero is the cycle the two keep repeating.
 */

const DURATION = 26 // model time units shown
const STRETCH = 0.21 // world units per model time unit
const BOX = 1.4 // populations map into −BOX…BOX
const WALL = -1.65
const FLOOR = -1.65
const SPEED = 2.2 // model time units per real second
const HOLD = 1.4
const FOXES_AT_START = 2 // tens of foxes

const LENGTH = DURATION * STRETCH

export function createPredatorScene(host: HTMLElement, onReadout: ReadoutSink) {
  const stage = createStage(host, {
    target: new THREE.Vector3(LENGTH / 2 - 0.4, 0, 0),
    initial: 'iso',
    views: {
      iso: { direction: [-1.15, 0.85, 1.35], extent: 3.4 },
      front: { direction: [-1, 0.0001, 0.0001], extent: 2.1 },
      side: { direction: [0.0001, 0.0001, 1], extent: 3.5 },
      top: { direction: [0.0001, 1, 0.002], extent: 3.5 },
    },
  })
  const { palette } = stage

  const panel = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 3.3), new THREE.MeshBasicMaterial({ color: palette.grid, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }))
  panel.rotation.y = Math.PI / 2
  stage.scene.add(panel)
  const axis = { width: 1.25, opacity: 0.9 }
  stage.line([new THREE.Vector3(0, FLOOR, WALL), new THREE.Vector3(LENGTH, FLOOR, WALL)], palette.grid, axis)
  stage.line([new THREE.Vector3(0, FLOOR, WALL), new THREE.Vector3(0, 1.6, WALL)], palette.grid, axis)
  stage.line([new THREE.Vector3(LENGTH, FLOOR, WALL), new THREE.Vector3(LENGTH, FLOOR, 1.6)], palette.grid, axis)
  const title = 'text-sm text-viz-guide'
  stage.label('time', new THREE.Vector3(LENGTH / 2, FLOOR - 0.45, WALL), title)
  stage.label('foxes', new THREE.Vector3(-0.55, 0.3, WALL), 'text-sm text-viz-3')
  stage.label('rabbits', new THREE.Vector3(LENGTH + 0.75, FLOOR, 0.3), 'text-sm text-viz-2')

  const loop = stage.line([new THREE.Vector3(), new THREE.Vector3(0, 1, 0)], palette.guide, { width: 1.5, opacity: 0.55 })
  const traces = [
    stage.line([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)], palette.s1, { width: 3 }),
    stage.line([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)], palette.s3, { width: 2.5 }),
    stage.line([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)], palette.s2, { width: 2.5 }),
  ]
  const dot = (color: string, size: number) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(size, 20, 14), new THREE.MeshBasicMaterial({ color }))
    stage.scene.add(mesh)
    return mesh
  }
  const point = dot(palette.s4, 0.09)
  const wallDot = dot(palette.s3, 0.07)
  const floorDot = dot(palette.s2, 0.07)
  const loopDot = dot(palette.guide, 0.05)
  const toWall = stage.line([new THREE.Vector3(), new THREE.Vector3(0, 0, 1)], palette.s3, { width: 2, dashed: true })
  const toFloor = stage.line([new THREE.Vector3(), new THREE.Vector3(0, 0, 1)], palette.s2, { width: 2, dashed: true })
  const balance = dot(palette.guide, 0.04)

  let samples: Sample[] = []
  let place: (sample: Sample) => THREE.Vector3 = () => new THREE.Vector3()
  let lag = 0
  let index = 0
  let hold = 0
  let playing = !stage.reduced

  const build = (rabbits: number) => {
    samples = simulate(rabbits / 10, FOXES_AT_START, DURATION, 0.02)
    const maxRabbits = Math.max(...samples.map((sample) => sample.rabbits))
    const maxFoxes = Math.max(...samples.map((sample) => sample.foxes))
    const z = (value: number) => (value / maxRabbits) * 2 * BOX - BOX
    const y = (value: number) => (value / maxFoxes) * 2 * BOX - BOX
    place = (sample) => new THREE.Vector3(sample.t * STRETCH, y(sample.foxes), z(sample.rabbits))
    stage.setLine(traces[0], samples.map(place))
    stage.setLine(traces[1], samples.map((sample) => place(sample).setZ(WALL)))
    stage.setLine(traces[2], samples.map((sample) => place(sample).setY(FLOOR)))
    // One full cycle is enough for the loop; later ones retrace it.
    const firstPeak = peakTimes(samples, 'rabbits')
    const cycle = firstPeak.length > 1 ? firstPeak[1] - firstPeak[0] : DURATION
    stage.setLine(loop, samples.filter((sample) => sample.t <= cycle + 0.1).map((sample) => place(sample).setX(0)))
    balance.position.set(0, y(equilibrium.foxes), z(equilibrium.rabbits))
    const foxPeaks = peakTimes(samples, 'foxes')
    const lags = firstPeak.map((time) => (foxPeaks.find((fox) => fox > time) ?? time) - time).filter((value) => value > 0)
    lag = lags.length && cycle ? lags.reduce((sum, value) => sum + value, 0) / lags.length / cycle : 0
    index = stage.reduced ? Math.floor(samples.length * 0.55) : 0
  }

  const draw = () => {
    const sample = samples[index]
    const at = place(sample)
    traces.forEach((trace) => { trace.geometry.instanceCount = index })
    point.position.copy(at)
    wallDot.position.copy(at.clone().setZ(WALL))
    floorDot.position.copy(at.clone().setY(FLOOR))
    loopDot.position.copy(at.clone().setX(0))
    stage.setLine(toWall, [at, at.clone().setZ(WALL)])
    stage.setLine(toFloor, [at, at.clone().setY(FLOOR)])
    onReadout([
      { label: 'Rabbits', value: String(Math.round(sample.rabbits * 10)), accent: true },
      { label: 'Foxes', value: String(Math.round(sample.foxes * 10)), accent: true },
      { label: 'Balance point', value: `${Math.round(equilibrium.rabbits * 10)} rabbits, ${Math.round(equilibrium.foxes * 10)} foxes` },
      { label: 'Fox peak lags by', value: `${Math.round(lag * 100)}% of a cycle` },
    ])
  }

  build(100)
  draw()
  stage.onFrame((dt) => {
    if (!playing) return
    if (index >= samples.length - 1) {
      hold += dt
      if (hold < HOLD) return
      hold = 0
      index = 0
    } else index = Math.min(samples.length - 1, index + Math.max(1, Math.round((dt * SPEED) / 0.02)))
    draw()
  })

  return {
    setPlaying: (value: boolean) => { playing = value },
    setView: stage.setView,
    restart: () => { index = 0; hold = 0; draw() },
    setParam: (value: number) => { build(value); draw() },
    dispose: stage.dispose,
  }
}
