import * as THREE from 'three'
import { approachFrequency, arrivals, machAngleDegrees, recedeFrequency } from './doppler'
import type { ReadoutSink } from './scenes'
import { createStage } from './stage'

/**
 * A source crossing a ground plane, emitting a wavefront on a fixed beat. Wavefronts are drawn as
 * rings on the ground; above Mach 1 the cone they pile into appears behind the source. A listener
 * sits just off the line of motion; with sound on, what it hears is synthesised from true travel
 * times (see `arrivals`), and a short boom is added when the cone reaches it. For hearing, the source
 * is taken to have been approaching forever; only its last PRE seconds of wavefronts are drawn.
 */

const TRACK = 6.5 // source runs from -TRACK to +TRACK along x
const BEAT = 0.22 // seconds between wavefronts, in sim time
const TIME_SCALE = 1.5 // sim seconds per real second; the speed of sound is 1 unit per sim second
const LISTENER = { lx: 1.2, ly: 0.7 }
const F0 = 440
const RINGS = 96
const PRE = 8 // the source has been emitting this long (sim seconds) when the scene opens
const RING_SAMPLES = 72

const hz = (value: number) => (Number.isFinite(value) ? `${Math.round(value).toLocaleString('en-US')} Hz` : '—')

export function createDopplerScene(host: HTMLElement, onReadout: ReadoutSink) {
  const stage = createStage(host, {
    target: new THREE.Vector3(0, 0, 0),
    initial: 'iso',
    views: {
      iso: { direction: [-0.9, 1.05, 1.25], extent: 4.2 },
      top: { direction: [0.0001, 1, 0.002], extent: 4.4 },
      side: { direction: [0.0001, 0.12, 1], extent: 4.2 },
    },
  })
  const { palette } = stage

  const grid = new THREE.GridHelper(2 * TRACK + 2, 15, palette.grid, palette.grid)
  ;(grid.material as THREE.Material).transparent = true
  ;(grid.material as THREE.Material).opacity = 0.55
  stage.scene.add(grid)
  stage.line([new THREE.Vector3(-TRACK - 1, 0.01, 0), new THREE.Vector3(TRACK + 1, 0.01, 0)], palette.guide, { width: 1.25, dashed: true, opacity: 0.45 })

  const circle = Array.from({ length: RING_SAMPLES + 1 }, (_, index) => {
    const angle = (index / RING_SAMPLES) * 2 * Math.PI
    return new THREE.Vector3(Math.cos(angle), 0.02, Math.sin(angle))
  })
  const rings = Array.from({ length: RINGS }, () => {
    const ring = stage.line(circle, palette.s1, { width: 1.75, opacity: 1 })
    ring.material.transparent = true
    ring.visible = false
    return { line: ring, emittedAt: 0, x: 0 }
  })

  const source = new THREE.Mesh(new THREE.SphereGeometry(0.16, 24, 16), new THREE.MeshBasicMaterial({ color: palette.s4 }))
  source.position.y = 0.16
  stage.scene.add(source)
  const listener = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.36, 18), new THREE.MeshBasicMaterial({ color: palette.s3 }))
  listener.position.set(LISTENER.lx, 0.18, LISTENER.ly)
  stage.scene.add(listener)
  stage.label('listener', new THREE.Vector3(LISTENER.lx, 0.55, LISTENER.ly))

  // Mach cone: a translucent shell plus its two edges on the ground.
  const cone = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 48, 1, true), new THREE.MeshBasicMaterial({ color: palette.s2, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false }))
  cone.rotation.z = -Math.PI / 2 // apex toward +x
  stage.scene.add(cone)
  const edges = [stage.line([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)], palette.s2, { width: 2.25 }), stage.line([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)], palette.s2, { width: 2.25 })]

  let mach = 0.9
  let playing = !stage.reduced
  let time = 0
  let lastBeat = -Infinity
  let next = 0
  const x0 = -TRACK
  const sourceX = () => x0 + mach * time
  const reset = () => {
    time = stage.reduced ? 5 / mach : 0
    rings.forEach((ring) => { ring.line.visible = false })
    for (let beat = -PRE; beat <= time; beat += BEAT) emit(beat)
  }
  const emit = (at: number) => {
    const ring = rings[next]
    next = (next + 1) % RINGS
    ring.emittedAt = at
    ring.x = x0 + mach * at
    ring.line.visible = true
    lastBeat = at
  }

  const draw = () => {
    const x = sourceX()
    source.position.x = x
    rings.forEach((ring) => {
      if (!ring.line.visible) return
      const radius = Math.max(0.001, time - ring.emittedAt)
      ring.line.position.x = ring.x
      ring.line.scale.set(radius, 1, radius)
      ring.line.material.opacity = Math.max(0, 1 - radius / 7.5)
    })
    const supersonic = mach > 1
    cone.visible = supersonic
    edges.forEach((edge) => { edge.visible = supersonic })
    if (supersonic) {
      const half = Math.asin(1 / mach)
      const length = Math.min(mach * (time + PRE), 9)
      const spread = length * Math.tan(half)
      cone.scale.set(spread, length, spread)
      cone.position.set(x - length / 2, 0.02, 0)
      stage.setLine(edges[0], [new THREE.Vector3(x, 0.03, 0), new THREE.Vector3(x - length, 0.03, spread)])
      stage.setLine(edges[1], [new THREE.Vector3(x, 0.03, 0), new THREE.Vector3(x - length, 0.03, -spread)])
    }
  }

  // Sound: one oscillator per audible wavefront (a supersonic pass can have two), plus a boom.
  let audio: { context: AudioContext; voices: { oscillator: OscillatorNode; gain: GainNode }[]; heardBefore: number } | null = null
  const startAudio = () => {
    const context = new AudioContext()
    const voices = [0, 1].map(() => {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.type = 'triangle'
      gain.gain.value = 0
      oscillator.connect(gain).connect(context.destination)
      oscillator.start()
      return { oscillator, gain }
    })
    void context.resume()
    audio = { context, voices, heardBefore: 0 }
  }
  const boom = (context: AudioContext) => {
    const length = Math.floor(context.sampleRate * 0.45)
    const buffer = context.createBuffer(1, length, context.sampleRate)
    const data = buffer.getChannelData(0)
    for (let index = 0; index < length; index++) data[index] = (Math.random() * 2 - 1) * (1 - index / length) ** 3
    const noise = context.createBufferSource()
    noise.buffer = buffer
    const filter = context.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 140
    const gain = context.createGain()
    gain.gain.value = 0.9
    noise.connect(filter).connect(gain).connect(context.destination)
    noise.start()
  }

  let reported = 0
  stage.onFrame((dt) => {
    if (playing) {
      time += dt * TIME_SCALE
      while (time - lastBeat >= BEAT && sourceX() <= TRACK) emit(lastBeat + BEAT)
      if (sourceX() > TRACK && time - lastBeat > 7.5) reset()
    }
    draw()
    const heard = playing ? arrivals(time, F0, { x0, mach, ...LISTENER, start: -Infinity }).filter((hit) => hit.emittedAt <= lastBeat + BEAT) : []
    if (audio) {
      const now = audio.context.currentTime
      audio.voices.forEach((voice, index) => {
        const hit = heard[index]
        voice.gain.gain.setTargetAtTime(hit ? 0.05 : 0, now, 0.03)
        if (hit) voice.oscillator.frequency.setTargetAtTime(Math.min(8000, hit.frequency), now, 0.015)
      })
      if (mach > 1 && audio.heardBefore === 0 && heard.length > 0) boom(audio.context)
      audio.heardBefore = heard.length
    }
    reported += dt
    if (reported > 0.12) {
      reported = 0
      const angle = machAngleDegrees(mach)
      onReadout([
        { label: 'Approaching', value: hz(approachFrequency(F0, mach)) },
        { label: 'Receding', value: hz(recedeFrequency(F0, mach)) },
        { label: 'Mach cone', value: angle ? `${angle.toFixed(1)}°` : 'none' },
        { label: 'Listener hears', value: heard.length ? heard.map((hit) => hz(hit.frequency)).join(' + ') : 'silence', accent: true },
      ])
    }
  })
  reset()
  draw()

  return {
    setPlaying: (value: boolean) => { playing = value },
    setView: stage.setView,
    restart: reset,
    setParam: (value: number) => { mach = value; reset() },
    setSound: (on: boolean) => {
      if (on && !audio) startAudio()
      if (!on && audio) { void audio.context.close(); audio = null }
    },
    dispose: () => { if (audio) void audio.context.close(); audio = null; stage.dispose() },
  }
}
