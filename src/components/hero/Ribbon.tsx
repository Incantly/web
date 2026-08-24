'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { ribbonInk } from './ink'
import { createSim, T_LIFT, T_THICKEN, T_WRITE } from './sim'

type Props = {
  reduced: boolean
}

function smooth(a: number, b: number, t: number) {
  const u = Math.min(1, Math.max(0, (t - a) / (b - a)))
  return u * u * (3 - 2 * u)
}

export default function Ribbon({ reduced }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const sim = createSim(reduced)
    const ink = ribbonInk()
    const live = ink.map((p) => new THREE.Vector3(p.x, p.y, p.z))

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 40)
    camera.position.set(0, 0.08, 5.4)

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      return
    }
    renderer.setClearColor('#0f1111', 0)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    renderer.domElement.style.display = 'block'
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    renderer.domElement.dataset.hero = 'ribbon'
    host.appendChild(renderer.domElement)

    const fit = () => {
      const w = host.clientWidth || window.innerWidth
      const h = host.clientHeight || window.innerHeight
      camera.aspect = w / h
      camera.position.z = w / h < 0.72 ? 6.6 : 5.4
      camera.updateProjectionMatrix()
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
      renderer.setSize(w, h, true)
    }
    fit()

    scene.add(new THREE.AmbientLight(0xffffff, 0.55))
    scene.add(new THREE.HemisphereLight(0xe8eef8, 0x1a1c1e, 0.9))
    const key = new THREE.DirectionalLight(0xffffff, 1.6)
    key.position.set(2.4, 4, 5)
    scene.add(key)
    const amber = new THREE.PointLight(0xe3a23c, 8, 12)
    amber.position.set(1.8, -0.4, 2)
    scene.add(amber)

    const curve = new THREE.CatmullRomCurve3(live, false, 'catmullrom', 0.35)
    const geo = new THREE.TubeGeometry(curve, 96, 0.055, 14, false)
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uReveal: { value: sim.reveal },
        uLift: { value: sim.lift },
        uSag: { value: sim.sag },
        uBreathe: { value: 0 },
        uHot: { value: 0 },
      },
      vertexShader: `
        uniform float uLift;
        uniform float uSag;
        uniform float uBreathe;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec3 p = position;
          float mid = sin(uv.x * 3.14159);
          p.y -= uSag * 0.22 * mid;
          p.z += uLift * 0.42 + uBreathe * 0.03 * mid;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uReveal;
        uniform float uLift;
        uniform float uHot;
        varying vec2 vUv;
        void main() {
          if (vUv.x > uReveal + 0.002) discard;
          vec3 paper = vec3(0.96, 0.945, 0.91);
          vec3 cool = vec3(0.72, 0.82, 1.0);
          vec3 col = mix(paper, cool, uLift * 0.28);
          col += uHot * 0.12;
          float edge = smoothstep(uReveal - 0.05, uReveal, vUv.x);
          col += edge * vec3(0.89, 0.64, 0.24) * (1.0 - uLift);
          gl_FragColor = vec4(col, 0.94);
        }
      `,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.frustumCulled = false
    const group = new THREE.Group()
    group.rotation.set(-0.18, 0.12, -0.04)
    group.add(mesh)
    scene.add(group)

    const shadowGeo = new THREE.PlaneGeometry(2.8, 0.9)
    const shadowMat = new THREE.MeshBasicMaterial({
      color: '#000000',
      transparent: true,
      opacity: 0,
      depthWrite: false,
    })
    const shadow = new THREE.Mesh(shadowGeo, shadowMat)
    shadow.rotation.x = -Math.PI / 2
    shadow.position.set(0, -0.55, 0)
    group.add(shadow)

    const restPos = group.position.clone()
    const grab = new THREE.Vector3()
    const pointer = new THREE.Vector2()
    const ray = new THREE.Raycaster()
    const hitPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
    let hovering = false

    const onPointerMove = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
      ray.setFromCamera(pointer, camera)
      const hits = ray.intersectObject(mesh)
      hovering = hits.length > 0
      host.style.cursor = sim.lift > 0.85 && hovering ? 'grab' : ''

      if (!sim.dragging) return
      const hit = new THREE.Vector3()
      ray.ray.intersectPlane(hitPlane, hit)
      group.position.x = restPos.x + (hit.x - grab.x) * 0.55
      group.position.y = restPos.y + (hit.y - grab.y) * 0.55
    }

    const onPointerDown = (e: PointerEvent) => {
      if (sim.lift < 0.85) return
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
      ray.setFromCamera(pointer, camera)
      if (ray.intersectObject(mesh).length === 0) return
      sim.dragging = true
      host.style.cursor = 'grabbing'
      host.setPointerCapture(e.pointerId)
      ray.ray.intersectPlane(hitPlane, grab)
    }

    const onPointerUp = () => {
      sim.dragging = false
      host.style.cursor = hovering && sim.lift > 0.85 ? 'grab' : ''
    }

    host.addEventListener('pointermove', onPointerMove)
    host.addEventListener('pointerdown', onPointerDown)
    host.addEventListener('pointerup', onPointerUp)
    host.addEventListener('pointerleave', onPointerUp)
    host.addEventListener('pointercancel', onPointerUp)

    const t0 = performance.now()
    let raf = 0

    const tick = () => {
      const e = reduced ? 99 : (performance.now() - t0) / 1000
      if (!reduced) {
        if (e < T_WRITE) {
          sim.reveal = smooth(0.15, T_WRITE, e)
          sim.thick = 0.14
          sim.lift = 0
          sim.sag = 0
        } else if (e < T_THICKEN) {
          sim.reveal = 1
          sim.thick = 0.14 + 0.86 * smooth(T_WRITE, T_THICKEN, e)
          sim.lift = 0.08 * smooth(T_WRITE, T_THICKEN, e)
          sim.sag = 0.15 * sim.thick
        } else if (e < T_LIFT) {
          sim.reveal = 1
          sim.thick = 1
          sim.lift = 0.08 + 0.92 * smooth(T_THICKEN, T_LIFT, e)
          sim.sag = 0.15 + 0.25 * sim.lift
        } else {
          sim.reveal = 1
          sim.thick = 1
          sim.lift = 1
          sim.sag = 0.4
          sim.breathe = Math.sin(e * 1.4) * 0.5 + 0.5
        }
      } else {
        sim.breathe = 0.4
      }

      if (!sim.dragging) {
        group.position.x += (restPos.x - group.position.x) * 0.08
        group.position.y += (restPos.y - group.position.y) * 0.08
      }

      mesh.scale.set(1, sim.thick, sim.thick)
      mat.uniforms.uReveal.value = sim.reveal
      mat.uniforms.uLift.value = sim.lift
      mat.uniforms.uSag.value = sim.sag
      mat.uniforms.uBreathe.value = sim.breathe
      mat.uniforms.uHot.value = hovering || sim.dragging ? 1 : 0
      shadowMat.opacity = sim.lift * 0.22

      renderer.render(scene, camera)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    const ro = new ResizeObserver(fit)
    ro.observe(host)
    window.addEventListener('resize', fit)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('resize', fit)
      host.removeEventListener('pointermove', onPointerMove)
      host.removeEventListener('pointerdown', onPointerDown)
      host.removeEventListener('pointerup', onPointerUp)
      host.removeEventListener('pointerleave', onPointerUp)
      host.removeEventListener('pointercancel', onPointerUp)
      host.style.cursor = ''
      geo.dispose()
      mat.dispose()
      shadowGeo.dispose()
      shadowMat.dispose()
      renderer.dispose()
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement)
    }
  }, [reduced])

  return <div ref={hostRef} className="hero-stage-canvas" />
}
