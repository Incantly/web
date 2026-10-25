import * as THREE from 'three'
import { orbitAt, sweptArea } from './kepler'
import type { ReadoutSink } from './scenes'
import { createStage } from './stage'

/**
 * Kepler's second law: a planet on an ellipse around the Sun, with the area its radius line sweeps
 * in each twelfth of an orbit shaded as it goes. Every wedge has the same area, so the planet must
 * race through the thin wedges near the Sun and crawl through the wide ones far away.
 */

const SCALE = 2.2 // world units per semi-major axis
const PERIOD = 9 // real seconds per orbit
const WEDGES = 12
const SAMPLES = 240

// The orbit lies in the ground plane: orbit x → world x, orbit y → world −z.
const world = (x: number, y: number, lift = 0) => new THREE.Vector3(x * SCALE, lift, -y * SCALE)

export function createKeplerScene(host: HTMLElement, onReadout: ReadoutSink) {
  const stage = createStage(host, {
    target: new THREE.Vector3(-0.6, 0, 0),
    initial: 'iso',
    views: {
      iso: { direction: [-0.75, 1.05, 1.25], extent: 3.4 },
      top: { direction: [0.0001, 1, 0.002], extent: 3.6 },
      side: { direction: [0.0001, 0.08, 1], extent: 3.6 },
    },
  })
  const { palette } = stage

  const grid = new THREE.PolarGridHelper(5, 12, 6, 64, palette.grid, palette.grid)
  ;(grid.material as THREE.Material).transparent = true
  ;(grid.material as THREE.Material).opacity = 0.45
  grid.position.y = -0.01
  stage.scene.add(grid)

  const sun = new THREE.Mesh(new THREE.SphereGeometry(0.22, 32, 20), new THREE.MeshBasicMaterial({ color: palette.s4 }))
  stage.scene.add(sun)
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.36, 32, 20), new THREE.MeshBasicMaterial({ color: palette.s4, transparent: true, opacity: 0.18, depthWrite: false }))
  stage.scene.add(halo)
  stage.label('Sun', new THREE.Vector3(0, 0.55, 0), 'text-[0.6875rem] text-viz-4')

  const planet = new THREE.Mesh(new THREE.SphereGeometry(0.12, 24, 16), new THREE.MeshBasicMaterial({ color: palette.s1 }))
  stage.scene.add(planet)
  const orbitLine = stage.line([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)], palette.guide, { width: 1.5, opacity: 0.55 })
  const radius = stage.line([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)], palette.s1, { width: 2 })
  const perihelion = stage.label('perihelion', new THREE.Vector3())
  const aphelion = stage.label('aphelion', new THREE.Vector3())

  // One translucent fan per twelfth of the orbit, alternating colours.
  const wedges = Array.from({ length: WEDGES }, (_, index) => {
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: index % 2 ? palette.s2 : palette.s1, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }))
    mesh.visible = false
    stage.scene.add(mesh)
    return mesh
  })

  let e = 0.4
  let t = stage.reduced ? 0.62 : 0
  let playing = !stage.reduced
  let wedgeArea = 0

  const build = () => {
    stage.setLine(orbitLine, Array.from({ length: SAMPLES + 1 }, (_, index) => { const p = orbitAt(index / SAMPLES, e); return world(p.x, p.y) }))
    perihelion.position.copy(world(1 - e + 0.12, 0, 0.18))
    aphelion.position.copy(world(-(1 + e) - 0.12, 0, 0.18))
    wedges.forEach((mesh, index) => {
      const positions: number[] = []
      const steps = 24
      for (let step = 0; step < steps; step++) {
        const a = orbitAt((index + step / steps) / WEDGES, e)
        const b = orbitAt((index + (step + 1) / steps) / WEDGES, e)
        positions.push(0, 0.005, 0, a.x * SCALE, 0.005, -a.y * SCALE, b.x * SCALE, 0.005, -b.y * SCALE)
      }
      mesh.geometry.dispose()
      mesh.geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    })
    wedgeArea = sweptArea(0, 1 / WEDGES, e)
  }

  const draw = () => {
    const p = orbitAt(t, e)
    const at = world(p.x, p.y)
    planet.position.copy(at)
    stage.setLine(radius, [new THREE.Vector3(0, 0.005, 0), at])
    const filled = Math.floor((t - Math.floor(t)) * WEDGES)
    wedges.forEach((mesh, index) => { mesh.visible = index < filled })
    const fastest = orbitAt(0, e).speed
    const slowest = orbitAt(0.5, e).speed
    onReadout([
      { label: 'Distance from Sun', value: `${p.r.toFixed(2)} a` },
      { label: 'Speed vs circular orbit', value: `${(p.speed / (2 * Math.PI)).toFixed(2)}×`, accent: true },
      { label: 'Fastest ÷ slowest', value: `${(fastest / slowest).toFixed(1)}×` },
      { label: 'Each wedge', value: `${(wedgeArea * SCALE * SCALE).toFixed(2)} units²` },
    ])
  }

  build()
  draw()
  stage.onFrame((dt) => {
    if (!playing) return
    const next = t + dt / PERIOD
    // Clear the shading at the start of each new orbit.
    t = Math.floor(next) > Math.floor(t) ? 0 : next
    draw()
  })

  return {
    setPlaying: (value: boolean) => { playing = value },
    setView: stage.setView,
    restart: () => { t = 0; draw() },
    setParam: (value: number) => { e = value; t = 0; build(); draw() },
    dispose: stage.dispose,
  }
}
