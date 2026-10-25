import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import { Line2 } from 'three/addons/lines/Line2.js'
import { LineGeometry } from 'three/addons/lines/LineGeometry.js'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'

/**
 * Shared three.js stage for the showcase visuals: an orthographic camera that tweens between named
 * views, drag-to-orbit on fine pointers, thick lines, DOM labels, and a render loop that only runs
 * while the stage is on screen.
 */

export type ViewName = 'iso' | 'front' | 'side' | 'top'
export type ViewPreset = { direction: [number, number, number]; extent: number }

export type Palette = Record<'stage' | 'grid' | 'label' | 'guide' | 's1' | 's2' | 's3' | 's4', string>

/** Series colors come from the `--ui-viz-*` tokens so the palette stays in globals.css. */
export function readPalette(element: Element): Palette {
  const style = getComputedStyle(element)
  const token = (name: string) => style.getPropertyValue(`--ui-viz-${name}`).trim()
  return { stage: token('stage'), grid: token('grid'), label: token('label'), guide: token('guide'), s1: token('1'), s2: token('2'), s3: token('3'), s4: token('4') }
}

type LineOptions = { width?: number; dashed?: boolean; opacity?: number }

export type Stage = {
  scene: THREE.Scene
  palette: Palette
  reduced: boolean
  setView: (name: ViewName) => void
  onFrame: (callback: (dt: number) => void) => void
  line: (points: THREE.Vector3[], color: string, options?: LineOptions) => Line2
  setLine: (line: Line2, points: THREE.Vector3[]) => void
  label: (html: string, position: THREE.Vector3, className?: string) => CSS2DObject
  dispose: () => void
}

const flat = (points: THREE.Vector3[]) => points.flatMap((point) => [point.x, point.y, point.z])

export function createStage(host: HTMLElement, { target, views, initial }: { target: THREE.Vector3; views: Partial<Record<ViewName, ViewPreset>>; initial: ViewName }): Stage {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const palette = readPalette(host)
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setClearColor(0x000000, 0)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.domElement.style.display = 'block'
  renderer.domElement.style.width = '100%'
  renderer.domElement.style.height = '100%'
  host.appendChild(renderer.domElement)

  const labels = new CSS2DRenderer()
  labels.domElement.style.position = 'absolute'
  labels.domElement.style.inset = '0'
  labels.domElement.style.pointerEvents = 'none'
  host.appendChild(labels.domElement)

  const scene = new THREE.Scene()
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100)
  const distance = 30
  const direction = new THREE.Vector3()
  let extent = views[initial]?.extent ?? 4
  const place = (dir: THREE.Vector3) => { camera.position.copy(target).addScaledVector(dir, distance); camera.lookAt(target) }
  direction.set(...(views[initial]?.direction ?? [1, 1, 1])).normalize()
  place(direction)

  // Orbit only with a mouse or pen; on touch the drag must keep scrolling the page.
  const fine = window.matchMedia('(pointer: fine)').matches
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.target.copy(target)
  controls.enableZoom = false
  controls.enablePan = false
  controls.enableDamping = !reduced
  controls.enabled = fine
  if (!fine) renderer.domElement.style.touchAction = 'pan-y'

  const materials = new Set<LineMaterial>()
  let width = 1
  let height = 1
  const fit = () => {
    width = Math.max(1, host.clientWidth)
    height = Math.max(1, host.clientHeight)
    const aspect = width / height
    const half = aspect >= 1 ? extent : extent / aspect
    camera.left = -half * aspect
    camera.right = half * aspect
    camera.top = half
    camera.bottom = -half
    camera.updateProjectionMatrix()
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setSize(width, height, false)
    labels.setSize(width, height)
    materials.forEach((material) => material.resolution.set(width, height))
  }
  fit()
  const resize = new ResizeObserver(fit)
  resize.observe(host)

  let tween: { from: THREE.Vector3; to: THREE.Vector3; fromExtent: number; toExtent: number; elapsed: number } | null = null
  const setView = (name: ViewName) => {
    const preset = views[name]
    if (!preset) return
    const to = new THREE.Vector3(...preset.direction).normalize()
    const from = camera.position.clone().sub(target).normalize()
    if (reduced) { extent = preset.extent; place(to); fit(); return }
    tween = { from, to, fromExtent: extent, toExtent: preset.extent, elapsed: 0 }
  }

  const frameCallbacks: ((dt: number) => void)[] = []
  let visible = false
  let raf = 0
  let last = 0
  const tick = (now: number) => {
    raf = 0
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0
    last = now
    if (tween) {
      tween.elapsed += dt
      const u = Math.min(1, tween.elapsed / 0.7)
      const eased = u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2
      place(tween.from.clone().lerp(tween.to, eased).normalize())
      extent = tween.fromExtent + (tween.toExtent - tween.fromExtent) * eased
      fit()
      if (u >= 1) tween = null
    } else if (controls.enabled) controls.update()
    frameCallbacks.forEach((callback) => callback(dt))
    renderer.render(scene, camera)
    labels.render(scene, camera)
    if (visible) raf = requestAnimationFrame(tick)
  }
  const start = () => { if (!raf) { last = 0; raf = requestAnimationFrame(tick) } }
  const seen = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting
    if (visible) start()
  })
  seen.observe(host)

  const line = (points: THREE.Vector3[], color: string, { width: lineWidth = 2.5, dashed = false, opacity = 1 }: LineOptions = {}) => {
    const geometry = new LineGeometry()
    geometry.setPositions(flat(points))
    const material = new LineMaterial({ color, linewidth: lineWidth, dashed, dashSize: 0.12, gapSize: 0.09, transparent: opacity < 1, opacity })
    material.resolution.set(width, height)
    materials.add(material)
    const result = new Line2(geometry, material)
    result.frustumCulled = false
    if (dashed) result.computeLineDistances()
    scene.add(result)
    return result
  }
  const setLine = (target: Line2, points: THREE.Vector3[]) => {
    target.geometry.setPositions(flat(points))
    if (target.material.dashed) target.computeLineDistances()
  }

  const label = (html: string, position: THREE.Vector3, className = 'text-[0.6875rem] text-viz-label') => {
    const element = document.createElement('div')
    element.className = `${className} pointer-events-none select-none whitespace-nowrap`
    element.innerHTML = html
    const object = new CSS2DObject(element)
    object.position.copy(position)
    scene.add(object)
    return object
  }

  return {
    scene, palette, reduced, setView, line, setLine, label,
    onFrame: (callback) => { frameCallbacks.push(callback) },
    dispose: () => {
      cancelAnimationFrame(raf)
      visible = false
      seen.disconnect()
      resize.disconnect()
      controls.dispose()
      scene.traverse((object) => {
        if (object instanceof CSS2DObject) object.element.remove()
        const mesh = object as THREE.Mesh
        mesh.geometry?.dispose()
        const material = mesh.material as THREE.Material | THREE.Material[] | undefined
        if (Array.isArray(material)) material.forEach((item) => item.dispose())
        else material?.dispose()
      })
      renderer.dispose()
      renderer.domElement.remove()
      labels.domElement.remove()
    },
  }
}
