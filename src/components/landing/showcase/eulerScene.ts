import * as THREE from 'three'
import katex from 'katex'
import type { ReadoutSink } from './scenes'
import { createStage } from './stage'

/**
 * “Unrolling Euler's formula”: e^{iθ} traced along a θ axis. The helix is the point itself; its
 * shadow on the back wall is sin θ (the imaginary part) and on the floor is cos θ (the real part).
 */

const TURNS = 2
const THETA_MAX = TURNS * 2 * Math.PI
const STRETCH = 0.42 // world units per radian of θ
const WALL = -1.5 // z of the back wall (Im/θ plane)
const FLOOR = -1.5 // y of the floor (Re/θ plane)
const SPEED = 1.35 // radians per second
const HOLD = 1.4 // seconds to hold the finished curve before restarting
const SAMPLES = 360

const LENGTH = THETA_MAX * STRETCH
const helix = (theta: number) => new THREE.Vector3(theta * STRETCH, Math.sin(theta), Math.cos(theta))
const onWall = (theta: number) => new THREE.Vector3(theta * STRETCH, Math.sin(theta), WALL)
const onFloor = (theta: number) => new THREE.Vector3(theta * STRETCH, FLOOR, Math.cos(theta))

export function createEulerScene(host: HTMLElement, onReadout: ReadoutSink) {
  const stage = createStage(host, {
    target: new THREE.Vector3(LENGTH / 2 - 0.4, 0, 0),
    initial: 'iso',
    views: {
      iso: { direction: [-1.15, 0.85, 1.35], extent: 3.3 },
      front: { direction: [-1, 0.0001, 0.0001], extent: 2.1 },
      side: { direction: [0.0001, 0.0001, 1], extent: 3.4 },
      top: { direction: [0.0001, 1, 0.002], extent: 3.4 },
    },
  })
  const { palette } = stage

  // θ = 0 backing panel and the unit circle drawn on it.
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.MeshBasicMaterial({ color: palette.grid, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }))
  panel.rotation.y = Math.PI / 2
  stage.scene.add(panel)
  stage.line(Array.from({ length: 97 }, (_, index) => helix((index / 96) * 2 * Math.PI).setX(0)), palette.guide, { width: 1.5, opacity: 0.55 })

  // Axes along the wall/floor edges, with ticks.
  const axis = { width: 1.25, opacity: 0.9 }
  stage.line([new THREE.Vector3(0, FLOOR, WALL), new THREE.Vector3(LENGTH, FLOOR, WALL)], palette.grid, axis)
  stage.line([new THREE.Vector3(0, FLOOR, WALL), new THREE.Vector3(0, 1.5, WALL)], palette.grid, axis)
  stage.line([new THREE.Vector3(LENGTH, FLOOR, WALL), new THREE.Vector3(LENGTH, FLOOR, 1.5)], palette.grid, axis)
  const piLabels = ['0', 'π', '2π', '3π', '4π']
  piLabels.forEach((text, index) => stage.label(text, new THREE.Vector3(index * Math.PI * STRETCH, FLOOR - 0.22, WALL)))
  ;[-1, 0, 1].forEach((value) => {
    stage.label(String(value), new THREE.Vector3(-0.22, value, WALL))
    stage.label(String(value), new THREE.Vector3(LENGTH + 0.25, FLOOR, value))
  })
  const title = 'text-sm text-viz-guide'
  stage.label('θ', new THREE.Vector3(LENGTH / 2, FLOOR - 0.55, WALL), title)
  stage.label('Im', new THREE.Vector3(-0.5, 0.2, WALL), title)
  stage.label('Re', new THREE.Vector3(LENGTH + 0.6, FLOOR, 0.3), title)

  // Traces, drawn up to the current θ.
  const thetas = Array.from({ length: SAMPLES + 1 }, (_, index) => (index / SAMPLES) * THETA_MAX)
  const traces = [
    stage.line(thetas.map(helix), palette.s1, { width: 3 }),
    stage.line(thetas.map(onWall), palette.s2, { width: 2.5 }),
    stage.line(thetas.map(onFloor), palette.s3, { width: 2.5 }),
  ]

  // The moving point, its radius on the circle, and dashed drops to both shadows.
  const dot = (color: string, size: number) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(size, 20, 14), new THREE.MeshBasicMaterial({ color }))
    stage.scene.add(mesh)
    return mesh
  }
  const point = dot(palette.s4, 0.09)
  const wallDot = dot(palette.s2, 0.07)
  const floorDot = dot(palette.s3, 0.07)
  const circleDot = dot(palette.guide, 0.05)
  const radius = stage.line([new THREE.Vector3(), new THREE.Vector3(0, 0, 1)], palette.s4, { width: 2 })
  const toWall = stage.line([new THREE.Vector3(), new THREE.Vector3(0, 0, 1)], palette.s2, { width: 2, dashed: true })
  const toFloor = stage.line([new THREE.Vector3(), new THREE.Vector3(0, 0, 1)], palette.s3, { width: 2, dashed: true })
  const tag = stage.label(katex.renderToString('e^{i\\theta}', { throwOnError: false }), new THREE.Vector3(), 'text-sm text-viz-4 -translate-y-4')

  let theta = stage.reduced ? Math.PI * 1.3 : 0
  let hold = 0
  let playing = !stage.reduced
  const draw = () => {
    const visibleSegments = Math.max(0, Math.floor((theta / THETA_MAX) * SAMPLES))
    traces.forEach((trace) => { trace.geometry.instanceCount = visibleSegments })
    const p = helix(theta)
    point.position.copy(p)
    wallDot.position.copy(onWall(theta))
    floorDot.position.copy(onFloor(theta))
    circleDot.position.set(0, p.y, p.z)
    stage.setLine(radius, [new THREE.Vector3(), new THREE.Vector3(0, p.y, p.z)])
    stage.setLine(toWall, [p, onWall(theta)])
    stage.setLine(toFloor, [p, onFloor(theta)])
    tag.position.copy(p)
    onReadout([
      { label: 'θ', value: `${(theta / Math.PI).toFixed(2)}π`, accent: true },
      { label: 'Re = cos θ', value: Math.cos(theta).toFixed(2) },
      { label: 'Im = sin θ', value: Math.sin(theta).toFixed(2) },
    ])
  }
  draw()

  stage.onFrame((dt) => {
    if (!playing) return
    if (theta >= THETA_MAX) {
      hold += dt
      if (hold < HOLD) return
      hold = 0
      theta = 0
    } else theta = Math.min(THETA_MAX, theta + dt * SPEED)
    draw()
  })

  return {
    setPlaying: (next: boolean) => { playing = next },
    setView: stage.setView,
    restart: () => { theta = 0; hold = 0; draw() },
    dispose: stage.dispose,
  }
}
