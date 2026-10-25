import * as THREE from 'three'
import { epicycleChain, partialSum, peakHeight, squareWaveHarmonics, type Harmonic } from './fourier'
import type { ReadoutSink } from './scenes'
import { createStage } from './stage'

/**
 * A square wave drawn by spinning circles. The circles turn in the plane at time zero, like the
 * unit circle in the Euler scene; the height of the last tip is traced along the time axis on the
 * back wall, next to the faint square wave it is trying to become.
 */

const PERIODS = 2
const T_MAX = PERIODS * 2 * Math.PI
const STRETCH = 0.42 // world units per unit of time
const WALL = -1.8
const FLOOR = -1.7
const SPEED = 1.2 // time units per real second
const HOLD = 1.2
const SAMPLES = 720
const MAX_CIRCLES = 25

const LENGTH = T_MAX * STRETCH

export function createFourierScene(host: HTMLElement, onReadout: ReadoutSink) {
  const stage = createStage(host, {
    target: new THREE.Vector3(LENGTH / 2 - 0.6, 0, -0.3),
    initial: 'iso',
    views: {
      iso: { direction: [-1.15, 0.8, 1.35], extent: 3.5 },
      front: { direction: [-1, 0.0001, 0.0001], extent: 2.2 },
      side: { direction: [0.0001, 0.0001, 1], extent: 3.5 },
    },
  })
  const { palette } = stage

  // Back wall axes and the target square wave.
  const axis = { width: 1.25, opacity: 0.9 }
  stage.line([new THREE.Vector3(0, FLOOR, WALL), new THREE.Vector3(LENGTH, FLOOR, WALL)], palette.grid, axis)
  stage.line([new THREE.Vector3(0, FLOOR, WALL), new THREE.Vector3(0, 1.7, WALL)], palette.grid, axis)
  stage.line([new THREE.Vector3(0, 0, WALL), new THREE.Vector3(LENGTH, 0, WALL)], palette.grid, { width: 1, opacity: 0.5 })
  const square: THREE.Vector3[] = []
  for (let half = 0; half < PERIODS * 2; half++) {
    const level = half % 2 ? -1 : 1
    square.push(new THREE.Vector3(half * Math.PI * STRETCH, level, WALL), new THREE.Vector3((half + 1) * Math.PI * STRETCH, level, WALL))
  }
  stage.line(square, palette.guide, { width: 1.5, dashed: true, opacity: 0.35 })
  ;['0', '2π', '4π'].forEach((text, index) => stage.label(text, new THREE.Vector3(index * 2 * Math.PI * STRETCH, FLOOR - 0.22, WALL)))
  ;[-1, 1].forEach((value) => stage.label(value > 0 ? '+1' : '−1', new THREE.Vector3(-0.25, value, WALL)))
  stage.label('t', new THREE.Vector3(LENGTH / 2, FLOOR - 0.5, WALL), 'text-sm text-viz-guide')

  // One unit circle per possible term, scaled and moved into place each frame.
  const unit = Array.from({ length: 65 }, (_, index) => new THREE.Vector3(0, Math.sin((index / 64) * 2 * Math.PI), Math.cos((index / 64) * 2 * Math.PI)))
  const circles = Array.from({ length: MAX_CIRCLES }, () => stage.line(unit, palette.guide, { width: 1.25, opacity: 0.45 }))
  const arms = stage.line([new THREE.Vector3(), new THREE.Vector3(0, 0, 1)], palette.s4, { width: 2 })
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.075, 20, 14), new THREE.MeshBasicMaterial({ color: palette.s4 }))
  stage.scene.add(tip)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.07, 20, 14), new THREE.MeshBasicMaterial({ color: palette.s1 }))
  stage.scene.add(head)
  const connector = stage.line([new THREE.Vector3(), new THREE.Vector3(0, 0, 1)], palette.s2, { width: 1.75, dashed: true })
  const wave = stage.line([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)], palette.s1, { width: 3 })

  let harmonics: Harmonic[] = squareWaveHarmonics(3)
  let peak = peakHeight(harmonics)
  let t = stage.reduced ? 2.6 * Math.PI : 0
  let hold = 0
  let playing = !stage.reduced

  const build = () => {
    const times = Array.from({ length: SAMPLES + 1 }, (_, index) => (index / SAMPLES) * T_MAX)
    stage.setLine(wave, times.map((time) => new THREE.Vector3(time * STRETCH, partialSum(time, harmonics), WALL)))
    circles.forEach((circle, index) => { circle.visible = index < harmonics.length })
    peak = peakHeight(harmonics)
  }

  const draw = () => {
    const chain = epicycleChain(t, harmonics)
    chain.slice(0, -1).forEach(([x, y], index) => {
      circles[index].position.set(0, y, x)
      circles[index].scale.set(1, harmonics[index].radius, harmonics[index].radius)
    })
    const points = chain.map(([x, y]) => new THREE.Vector3(0, y, x))
    stage.setLine(arms, points)
    const end = points[points.length - 1]
    tip.position.copy(end)
    const height = end.y
    const at = new THREE.Vector3(t * STRETCH, height, WALL)
    head.position.copy(at)
    stage.setLine(connector, [end, at])
    wave.geometry.instanceCount = Math.max(0, Math.floor((t / T_MAX) * SAMPLES))
    onReadout([
      { label: 'Circles', value: String(harmonics.length) },
      { label: 'Frequencies', value: harmonics.length > 3 ? `1, 3, 5 … ${2 * harmonics.length - 1}` : harmonics.map((term) => term.frequency).join(', ') },
      { label: 'Height now', value: height.toFixed(2), accent: true },
      { label: 'Peak height', value: `${peak.toFixed(3)} (target 1)` },
    ])
  }

  build()
  draw()
  stage.onFrame((dt) => {
    if (!playing) return
    if (t >= T_MAX) {
      hold += dt
      if (hold < HOLD) return
      hold = 0
      t = 0
    } else t = Math.min(T_MAX, t + dt * SPEED)
    draw()
  })

  return {
    setPlaying: (value: boolean) => { playing = value },
    setView: stage.setView,
    restart: () => { t = 0; hold = 0; draw() },
    setParam: (value: number) => { harmonics = squareWaveHarmonics(Math.min(MAX_CIRCLES, Math.max(1, Math.round(value)))); build(); draw() },
    dispose: stage.dispose,
  }
}
