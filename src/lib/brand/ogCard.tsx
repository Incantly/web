import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'

/**
 * The 1200×630 link-preview card. Images are generated at build time, so colors are read from the
 * palette block in globals.css (the one place raw colors live) instead of being repeated here.
 */

export const ogSize = { width: 1200, height: 630 }
export const ogContentType = 'image/png'

const root = process.cwd()
const css = readFileSync(join(root, 'src/app/globals.css'), 'utf8')
const palette = (name: string) => {
  const match = css.match(new RegExp(`--palette-${name}:\\s*(#[0-9a-fA-F]{6})`))
  if (!match) throw new Error(`Missing --palette-${name} in globals.css`)
  return match[1]
}
/** Same as CSS `color-mix(in srgb, color P%, black)`, which the text tokens use. */
const towardBlack = (hex: string, share: number) => {
  const channels = [1, 3, 5].map((offset) => Math.round(parseInt(hex.slice(offset, offset + 2), 16) * share))
  return `rgb(${channels.join(', ')})`
}

const colors = {
  canvas: palette('white'),
  surface: palette('soft'),
  border: palette('border'),
  text: towardBlack(palette('ink'), 0.38),
  muted: towardBlack(palette('ink'), 0.72),
  subtle: palette('ink'),
  stage: palette('night'),
  grid: palette('night-line'),
  guide: palette('night-glow'),
  helix: palette('viz-blue'),
  sine: palette('viz-green'),
  cosine: palette('viz-pink'),
  point: palette('viz-orange'),
}

const serif = readFileSync(join(root, 'node_modules/katex/dist/fonts/KaTeX_Main-Regular.ttf'))
const logo = `data:image/svg+xml;base64,${readFileSync(join(root, 'public/incantly-logo.svg')).toString('base64')}`

/** Euler's helix with its sine and cosine shadows, drawn at an isometric angle like the landing showcase. */
function helixArt() {
  const size = 380
  const margin = 34
  const turns = 2
  const samples = 240
  const stretch = 0.42
  // Isometric-style projection of (θ axis, Im, Re) onto the page.
  const project = (x: number, y: number, z: number): [number, number] => [(x - z * 0.9) * Math.cos(Math.PI / 6), (x * 0.35 + z * 0.55) * 0.9 - y]
  const thetas = Array.from({ length: samples + 1 }, (_, index) => (index / samples) * turns * 2 * Math.PI)
  const curves = {
    circle: Array.from({ length: 97 }, (_, index) => project(0, Math.sin((index / 96) * 2 * Math.PI), Math.cos((index / 96) * 2 * Math.PI))),
    cosine: thetas.map((t) => project(t * stretch, -1.5, Math.cos(t))),
    sine: thetas.map((t) => project(t * stretch, Math.sin(t), -1.5)),
    helix: thetas.map((t) => project(t * stretch, Math.sin(t), Math.cos(t))),
  }
  const theta = 3.4 * Math.PI
  const marks = {
    point: project(theta * stretch, Math.sin(theta), Math.cos(theta)),
    wall: project(theta * stretch, Math.sin(theta), -1.5),
    floor: project(theta * stretch, -1.5, Math.cos(theta)),
  }
  // Fit everything into the square, centred.
  const all = Object.values(curves).flat()
  const xs = all.map(([x]) => x)
  const ys = all.map(([, y]) => y)
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const scale = (size - 2 * margin) / Math.max(maxX - minX, maxY - minY)
  const offsetX = (size - (maxX - minX) * scale) / 2
  const offsetY = (size - (maxY - minY) * scale) / 2
  const fit = ([x, y]: [number, number]) => [(offsetX + (x - minX) * scale).toFixed(1), (offsetY + (y - minY) * scale).toFixed(1)]
  const path = (points: [number, number][]) => points.map((point, index) => `${index ? 'L' : 'M'}${fit(point).join(' ')}`).join(' ')
  const [hx, hy] = fit(marks.point)
  const [wx, wy] = fit(marks.wall)
  const [fx, fy] = fit(marks.floor)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="${path(curves.circle)}" stroke="${colors.guide}" stroke-opacity="0.5" stroke-width="2"/>
    <path d="${path(curves.cosine)}" stroke="${colors.cosine}" stroke-width="3"/>
    <path d="${path(curves.sine)}" stroke="${colors.sine}" stroke-width="3"/>
    <path d="${path(curves.helix)}" stroke="${colors.helix}" stroke-width="4"/>
    <path d="M${hx} ${hy} L${wx} ${wy}" stroke="${colors.sine}" stroke-width="2.5" stroke-dasharray="7 6"/>
    <path d="M${hx} ${hy} L${fx} ${fy}" stroke="${colors.cosine}" stroke-width="2.5" stroke-dasharray="7 6"/>
    <circle cx="${wx}" cy="${wy}" r="7" fill="${colors.sine}"/>
    <circle cx="${fx}" cy="${fy}" r="7" fill="${colors.cosine}"/>
    <circle cx="${hx}" cy="${hy}" r="9" fill="${colors.point}"/>
  </svg>`
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}
const art = helixArt()

export function ogCard({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', background: colors.surface, padding: 48 }}>
      <div style={{ flex: 1, display: 'flex', borderRadius: 36, border: `2px solid ${colors.border}`, background: colors.canvas, overflow: 'hidden' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '52px 40px 48px 56px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse renders plain img only */}
            <img src={logo} width={30} height={42} alt="" />
            <span style={{ fontFamily: 'Serif', fontSize: 44, letterSpacing: -1.5, color: colors.text }}>incantly</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: colors.subtle }}>{eyebrow}</span>
            <span style={{ marginTop: 14, fontFamily: 'Serif', fontSize: title.length > 26 ? 62 : 74, lineHeight: 1.04, letterSpacing: -2, color: colors.text }}>{title}</span>
            <span style={{ marginTop: 20, fontSize: 26, lineHeight: 1.4, color: colors.muted, maxWidth: 560 }}>{subtitle}</span>
          </div>
          <span style={{ fontSize: 22, color: colors.subtle }}>incantly.xyz</span>
        </div>
        <div style={{ width: 440, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ width: 400, height: 438, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 28, background: colors.stage, border: `2px solid ${colors.grid}` }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse renders plain img only */}
            <img src={art} width={380} height={380} alt="" />
          </div>
        </div>
      </div>
    </div>,
    { ...ogSize, fonts: [{ name: 'Serif', data: serif, style: 'normal', weight: 400 }] },
  )
}
