'use client'

import { useState } from 'react'
import type { CSSProperties } from 'react'
import DecodeText from './DecodeText'
import { useInView } from '../hooks'

const FIELDS = [
  {
    n: '01',
    title: 'Accounting & finance',
    color: 'var(--accent-mint)',
    kind: 'bars' as const,
    body: 'Upload a CSV. Get a real dashboard — trends, outliers, breakdowns — instantly, editable, no spreadsheet gymnastics.',
  },
  {
    n: '02',
    title: 'Fashion & design',
    color: 'var(--accent-pink)',
    kind: 'circles' as const,
    body: 'Describe a concept or upload references. Incantly generates a visual moodboard or interactive layout you can rearrange and refine on the spot.',
  },
  {
    n: '03',
    title: 'Students & researchers',
    color: 'var(--brand-violet)',
    kind: 'diagram' as const,
    body: "Drop in a paper you're stuck on. Instead of a wall of text, get the concept rendered the way it actually makes sense — a diagram of the argument, a 3D model of the mechanism, an interactive walkthrough.",
  },
  {
    n: '04',
    title: 'Everyday tasks',
    color: 'var(--accent-blue)',
    kind: 'action' as const,
    body: '"Order food." "Book a ride." Incantly connects to what you need and builds the interface to do it — no app required.',
  },
  {
    n: '05',
    title: 'Curiosity, answered properly',
    color: 'var(--accent-amber)',
    kind: 'rings' as const,
    body: '"How do earthquakes work?" Get a real, explorable model — not a paragraph. Ask "what about magnitude 7+ zones this year?" and it pulls live data to show you.',
  },
]

function FieldArt({ kind, color }: { kind: (typeof FIELDS)[number]['kind']; color: string }) {
  const style = { '--c': color } as CSSProperties
  const mono = 'var(--font-mono, ui-monospace, monospace)'

  switch (kind) {
    case 'bars':
      // Finance: area graph — line draws itself, dots pop, chip lands, tip pulses
      return (
        <div className="field-stage-art" style={style} aria-hidden>
          <svg viewBox="0 0 340 150" fill="none">
            {[30, 62, 94, 126].map((y, i) => (
              <line
                key={y}
                className="fa-draw"
                style={{ animationDelay: `${i * 0.08}s` }}
                pathLength={1}
                x1="16"
                y1={y}
                x2="324"
                y2={y}
                stroke="rgba(20,17,27,0.08)"
              />
            ))}
            <defs>
              <linearGradient id="fin-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.28" />
                <stop offset="100%" stopColor={color} stopOpacity="0" />
              </linearGradient>
            </defs>
            <g className="fa-fade" style={{ animationDelay: '0.9s' }}>
              <path
                d="M16 118 C56 108 74 122 104 100 C134 78 152 92 188 72 C224 52 246 66 282 44 L324 30 L324 134 L16 134 Z"
                fill="url(#fin-area)"
              />
            </g>
            <path
              className="fa-draw"
              style={{ animationDuration: '1.2s', animationDelay: '0.15s' }}
              pathLength={1}
              d="M16 118 C56 108 74 122 104 100 C134 78 152 92 188 72 C224 52 246 66 282 44 L324 30"
              stroke={color}
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            {[
              [104, 100, 0.5],
              [188, 72, 0.75],
              [282, 44, 1.0],
            ].map(([x, y, d]) => (
              <circle
                key={x}
                className="fa-pop"
                style={{ animationDelay: `${d}s` }}
                cx={x}
                cy={y}
                r="4"
                fill="#fdfcf8"
                stroke={color}
                strokeWidth="2.5"
              />
            ))}
            <circle className="fa-pulse" style={{ animationDelay: '1.3s' }} cx="324" cy="30" r="6" fill={color} opacity="0.25" />
            <circle className="fa-pop" style={{ animationDelay: '1.2s' }} cx="324" cy="30" r="3.5" fill={color} />
            <g className="fa-pop" style={{ animationDelay: '1.05s' }}>
              <rect x="240" y="86" width="70" height="24" rx="12" fill={color} />
              <text x="275" y="102" textAnchor="middle" fontFamily={mono} fontSize="11" fill="#fdfcf8">
                +12.4%
              </text>
            </g>
          </svg>
        </div>
      )
    case 'circles':
      // Fashion: swatches drop in and sway, stitches march, button pops
      return (
        <div className="field-stage-art" style={style} aria-hidden>
          <svg viewBox="0 0 340 150" fill="none">
            <g transform="rotate(-8 110 78)">
              <g className="fa-pop fa-sway" style={{ animationDelay: '0.05s, 1.2s' }}>
                <rect x="58" y="34" width="104" height="88" rx="14" fill={color} opacity="0.2" />
                <rect
                  className="fa-march"
                  x="66"
                  y="42"
                  width="88"
                  height="72"
                  rx="10"
                  stroke={color}
                  strokeWidth="1.6"
                  strokeDasharray="5 5"
                />
              </g>
            </g>
            <g transform="rotate(5 190 76)">
              <g className="fa-pop fa-sway" style={{ animationDelay: '0.25s, 1.6s' }}>
                <rect x="138" y="28" width="104" height="88" rx="14" fill={color} opacity="0.5" />
                <rect
                  className="fa-march"
                  x="146"
                  y="36"
                  width="88"
                  height="72"
                  rx="10"
                  stroke="#fdfcf8"
                  strokeWidth="1.6"
                  strokeDasharray="5 5"
                  opacity="0.8"
                />
              </g>
            </g>
            <g transform="rotate(-3 258 84)">
              <g className="fa-pop fa-sway" style={{ animationDelay: '0.45s, 1.4s' }}>
                <rect x="212" y="44" width="96" height="80" rx="14" fill={color} />
                <rect
                  className="fa-march"
                  x="220"
                  y="52"
                  width="80"
                  height="64"
                  rx="10"
                  stroke="#fdfcf8"
                  strokeWidth="1.6"
                  strokeDasharray="5 5"
                  opacity="0.85"
                />
              </g>
            </g>
            <g className="fa-pop fa-spinwobble" style={{ animationDelay: '0.7s, 1.8s' }}>
              <circle cx="98" cy="112" r="16" fill="#fdfcf8" stroke={color} strokeWidth="2.5" />
              <circle cx="93" cy="108" r="1.8" fill={color} />
              <circle cx="103" cy="108" r="1.8" fill={color} />
              <circle cx="93" cy="117" r="1.8" fill={color} />
              <circle cx="103" cy="117" r="1.8" fill={color} />
            </g>
          </svg>
        </div>
      )
    case 'diagram':
      // Students: book settles, the concept graph draws itself and pulses
      return (
        <div className="field-stage-art" style={style} aria-hidden>
          <svg viewBox="0 0 340 150" fill="none">
            <g className="fa-fade">
              <path
                d="M170 128 C140 112 96 110 62 118 L62 132 C96 124 140 126 170 142 Z"
                fill={color}
                opacity="0.25"
              />
              <path
                d="M170 128 C200 112 244 110 278 118 L278 132 C244 124 200 126 170 142 Z"
                fill={color}
                opacity="0.25"
              />
              <path
                d="M170 122 C142 107 100 105 68 112 L68 126 C100 119 142 121 170 136 C198 121 240 119 272 126 L272 112 C240 105 198 107 170 122 Z"
                fill="#fdfcf8"
                stroke={color}
                strokeWidth="2"
                strokeLinejoin="round"
              />
              <line x1="170" y1="122" x2="170" y2="136" stroke={color} strokeWidth="2" />
            </g>
            <line
              className="fa-draw"
              style={{ animationDelay: '0.35s' }}
              pathLength={1}
              x1="170"
              y1="118"
              x2="170"
              y2="82"
              stroke={color}
              strokeWidth="1.6"
              strokeDasharray="4 4"
            />
            {[
              ['170', '82', '116', '52', 0.6],
              ['170', '82', '224', '44', 0.75],
              ['224', '44', '272', '66', 0.9],
            ].map(([x1, y1, x2, y2, d]) => (
              <line
                key={`${x2}-${y2}`}
                className="fa-draw"
                style={{ animationDelay: `${d}s` }}
                pathLength={1}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={color}
                strokeWidth="1.6"
              />
            ))}
            <circle className="fa-pop fa-pulse" style={{ animationDelay: '0.5s, 1.6s' }} cx="170" cy="82" r="11" fill={color} />
            <circle className="fa-pop" style={{ animationDelay: '0.85s' }} cx="116" cy="52" r="8" fill="#fdfcf8" stroke={color} strokeWidth="2.2" />
            <circle className="fa-pop" style={{ animationDelay: '1s' }} cx="224" cy="44" r="8" fill="#fdfcf8" stroke={color} strokeWidth="2.2" />
            <circle className="fa-pop" style={{ animationDelay: '1.15s' }} cx="272" cy="66" r="6" fill={color} opacity="0.55" />
            <circle className="fa-twinkle" cx="86" cy="30" r="3" fill={color} opacity="0.4" />
            <circle className="fa-twinkle" style={{ animationDelay: '0.9s' }} cx="250" cy="18" r="2.5" fill={color} opacity="0.4" />
          </svg>
        </div>
      )
    case 'action':
      // Everyday: dotted route marches, a courier dot rides it, the pin bobs
      return (
        <div className="field-stage-art" style={style} aria-hidden>
          <svg viewBox="0 0 340 150" fill="none">
            <path
              className="fa-march"
              d="M46 118 C96 128 108 76 158 78 C210 80 216 118 262 96"
              stroke={color}
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeDasharray="1 9"
            />
            {/* courier riding the route */}
            <circle r="5" fill={color}>
              <animateMotion
                dur="3.2s"
                repeatCount="indefinite"
                path="M46 118 C96 128 108 76 158 78 C210 80 216 118 262 96"
                keyPoints="0;1"
                keyTimes="0;1"
                calcMode="spline"
                keySplines="0.45 0 0.4 1"
              />
            </circle>
            <circle className="fa-pulse" cx="46" cy="118" r="7" fill="#fdfcf8" stroke={color} strokeWidth="2.6" />
            <circle cx="46" cy="118" r="2.4" fill={color} />
            <g className="fa-bob">
              <path
                d="M262 44 C247 44 236 55 236 69 C236 87 262 106 262 106 C262 106 288 87 288 69 C288 55 277 44 262 44 Z"
                fill={color}
              />
              <circle cx="262" cy="68" r="9" fill="#fdfcf8" />
              <circle cx="262" cy="68" r="3.4" fill={color} />
            </g>
            <ellipse className="fa-shadow" cx="262" cy="112" rx="16" ry="4" fill={color} opacity="0.2" />
            <g className="fa-pop fa-float" style={{ animationDelay: '0.5s, 1.4s' }}>
              <rect x="88" y="34" width="76" height="26" rx="13" fill="#fdfcf8" stroke={color} strokeWidth="1.6" />
              <circle cx="103" cy="47" r="4.5" fill={color} />
              <text x="138" y="51" textAnchor="middle" fontFamily={mono} fontSize="11" fill={color}>
                12 min
              </text>
            </g>
          </svg>
        </div>
      )
    default:
      // Curiosity: planet breathes, a moon orbits it, stars twinkle
      return (
        <div className="field-stage-art" style={style} aria-hidden>
          <svg viewBox="0 0 340 150" fill="none">
            <ellipse
              className="fa-march"
              cx="170"
              cy="78"
              rx="118"
              ry="34"
              stroke={color}
              strokeWidth="1.4"
              strokeDasharray="3 7"
              opacity="0.55"
              transform="rotate(-10 170 78)"
            />
            <g className="fa-breathe">
              <circle cx="170" cy="78" r="38" fill={color} opacity="0.9" />
              <circle cx="158" cy="66" r="9" fill="#fdfcf8" opacity="0.35" />
              <circle cx="184" cy="90" r="5" fill="#14111b" opacity="0.15" />
              <ellipse
                cx="170"
                cy="78"
                rx="62"
                ry="16"
                stroke={color}
                strokeWidth="3"
                transform="rotate(-10 170 78)"
                opacity="0.7"
              />
            </g>
            <g className="fa-orbit">
              <circle cx="278" cy="52" r="8" fill="#fdfcf8" stroke={color} strokeWidth="2.4" />
            </g>
            <path className="fa-twinkle" d="M64 30 l2.4 6 6 2.4 -6 2.4 -2.4 6 -2.4 -6 -6 -2.4 6 -2.4 Z" fill={color} opacity="0.7" />
            <path
              className="fa-twinkle"
              style={{ animationDelay: '1.1s' }}
              d="M268 118 l1.8 4.6 4.6 1.8 -4.6 1.8 -1.8 4.6 -1.8 -4.6 -4.6 -1.8 4.6 -1.8 Z"
              fill={color}
              opacity="0.5"
            />
            <circle className="fa-twinkle" style={{ animationDelay: '0.5s' }} cx="96" cy="120" r="2.4" fill={color} opacity="0.45" />
            <circle className="fa-twinkle" style={{ animationDelay: '1.6s' }} cx="242" cy="24" r="2" fill={color} opacity="0.45" />
          </svg>
        </div>
      )
  }
}

export default function Fields() {
  const { ref, inView } = useInView<HTMLElement>(0.15)
  const [active, setActive] = useState(0)
  const field = FIELDS[active]

  return (
    <section className={`fields${inView ? ' fields--in' : ''}`} id="fields" ref={ref}>
      <div className="fields-head">
        <p className="kicker">One tool, every field</p>
        <h2 className="section-title">
          <DecodeText text="Whatever you do, it builds for it." start={inView} stagger={80} />
        </h2>
      </div>

      {/* Desktop: interactive list + stage */}
      <div className="fields-explorer">
        <ul className="fields-list" role="tablist" aria-label="Use cases">
          {FIELDS.map((f, i) => (
            <li key={f.n}>
              <button
                type="button"
                role="tab"
                aria-selected={i === active}
                className={`fields-item${i === active ? ' fields-item--active' : ''}`}
                style={{ '--c': f.color } as CSSProperties}
                onClick={() => setActive(i)}
                onMouseEnter={() => setActive(i)}
              >
                <span className="fields-item-n">{f.n}</span>
                <span className="fields-item-title">{f.title}</span>
              </button>
            </li>
          ))}
        </ul>

        <div
          className="fields-stage"
          role="tabpanel"
          style={{ '--c': field.color } as CSSProperties}
        >
          <FieldArt key={field.kind} kind={field.kind} color={field.color} />
          <p className="mono-label" style={{ color: 'var(--c)' }}>
            {field.n} · Generated for you
          </p>
          <h3>{field.title}</h3>
          <p>{field.body}</p>
        </div>
      </div>

      {/* Mobile: stacked field + art (no tab switching) */}
      <div className="fields-stack">
        {FIELDS.map((f) => (
          <article
            key={f.n}
            className="fields-block"
            style={{ '--c': f.color } as CSSProperties}
          >
            <header className="fields-block-head">
              <span className="fields-item-n">{f.n}</span>
              <h3 className="fields-item-title">{f.title}</h3>
            </header>
            <div className="fields-block-stage">
              <FieldArt kind={f.kind} color={f.color} />
              <p className="mono-label" style={{ color: 'var(--c)' }}>
                {f.n} · Generated for you
              </p>
              <p>{f.body}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
