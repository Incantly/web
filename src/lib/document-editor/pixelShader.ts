/** Shader breathing room: 0 ambles, 1 breathes, 2 throbs. */
export type PlaceholderEnergy = 0 | 1 | 2

type Blob = { x: number; y: number; r: number; dx: number; dy: number; hue: 'blue' | 'warm' }

/**
 * Pixelation the cheap honest way: paint tiny, upscale with smoothing off. The canvas is
 * 72x40 backing pixels stretched over its host, so every blob reads as chunky pixels;
 * a slow scale oscillation on the element is the zoom in and out. Energy quickens the
 * drift and wakes more blobs (planning ambles, repair throbs). Blue (#2b62d9) on bone
 * (#f6f3ec), the project's own pair — never blue on white.
 *
 * Shared by the generation placeholder and the change cover: both moments mean "a figure
 * is becoming", so they look like one language. The host gives the canvas room to zoom
 * (inset -8%, 116% size, pixelated rendering) inside an overflow-hidden frame.
 */
export function startPixelShader(canvas: HTMLCanvasElement): { stop: () => void; setEnergy: (energy: PlaceholderEnergy) => void } {
  const W = 72
  const H = 40
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  let energy: PlaceholderEnergy = 0
  let raf = 0
  let t = Math.random() * 1000
  const blobs: Blob[] = Array.from({ length: 26 }, (_, i) => ({
    x: (i * 37) % W,
    y: (i * 53) % H,
    r: 3 + ((i * 7) % 5),
    dx: 0.08 + ((i * 13) % 10) / 60,
    dy: 0.06 + ((i * 11) % 8) / 70,
    hue: i % 3 === 0 ? 'blue' : 'warm',
  }))
  const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  const frame = () => {
    if (!canvas.isConnected || !ctx) return
    const speed = [0.35, 0.8, 1.6][energy]
    t += speed
    ctx.fillStyle = '#f6f3ec'
    ctx.fillRect(0, 0, W, H)
    const awake = [10, 18, 26][energy]
    for (let i = 0; i < awake; i++) {
      const blob = blobs[i % blobs.length]
      const x = ((blob.x + t * blob.dx) % (W + 12)) - 6
      const y = ((blob.y + t * blob.dy * 0.7) % (H + 12)) - 6
      ctx.fillStyle = blob.hue === 'blue' ? 'rgba(43, 98, 217, 0.20)' : 'rgba(139, 132, 117, 0.16)'
      ctx.fillRect(Math.round(x - blob.r), Math.round(y - blob.r), blob.r * 2, blob.r * 2)
    }
    // Sparse sparkle pixels, denser with energy.
    const sparks = [6, 14, 26][energy]
    for (let i = 0; i < sparks; i++) {
      const sx = Math.floor((i * 29 + t * 7) % W)
      const sy = Math.floor((i * 41 + t * 5) % H)
      ctx.fillStyle = 'rgba(43, 98, 217, 0.35)'
      ctx.fillRect(sx, sy, 1, 1)
    }
    const zoom = 1 + 0.07 * Math.sin(t / (reducedMotion ? 1 : 26)) * (1 + energy * 0.4)
    canvas.style.transform = `scale(${zoom.toFixed(3)})`
    if (!reducedMotion) raf = requestAnimationFrame(frame)
  }
  if (reducedMotion) {
    // One still frame: the block's meaning without the motion.
    frame()
  } else {
    raf = requestAnimationFrame(frame)
  }
  return {
    stop: () => cancelAnimationFrame(raf),
    setEnergy: (next) => {
      energy = next
    },
  }
}
