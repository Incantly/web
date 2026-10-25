import type { ReactNode } from 'react'
import katex from 'katex'
import type { CurrentUser } from '../../product/SessionGate'
import type { NoteRecord, SourceRecord, SpaceRecord } from '../../product/workspace/model'
import type { VisualKind } from './VizBlock'

/** Sample workspace the landing showcase renders the real sidebar against. */

export const demoUser: CurrentUser = { id: 'demo', name: 'Ada Okafor', email: 'ada@example.com' }

const space = (id: string, name: string, icon: string): SpaceRecord => ({ id, name, icon, description: null, homeNoteId: null, status: 'ACTIVE', retentionHold: false, updatedAt: 0 })
export const demoSpaces: SpaceRecord[] = [space('maths', 'Maths, slowly', '∑'), space('orbits', 'Sky & orbits', '☉'), space('waves', 'Sound & waves', '≈'), space('living', 'Living systems', '❦'), space('field', 'Field notes', '✎')]

const note = (id: string, title: string, spaceId: string): NoteRecord => ({ id, title, spaceId, updatedAt: 0, currentRevisionId: null })
export const demoNotes: NoteRecord[] = [
  note('euler', 'Unrolling Euler’s formula', 'maths'),
  note('kepler', 'Why planets speed up near the Sun', 'orbits'),
  note('doppler', 'Why a passing siren drops in pitch', 'waves'),
  note('fourier', 'Drawing a square wave with circles', 'maths'),
  note('predator', 'Why fox numbers lag behind rabbits', 'living'),
  note('cities', 'Why do cities stay warm at night?', 'field'),
  note('tides', 'Two tides a day', 'field'),
]

const source = (id: string, kind: SourceRecord['kind'], title: string): SourceRecord => ({ id, kind, title, status: 'READY', sensitivity: 'PRIVATE', updatedAt: 0, stage: null, failureCode: null, partialReason: null, assetId: null })
export const demoSources: SourceRecord[] = [
  source('complex', 'FILE', 'Complex numbers, chapter 3.pdf'),
  source('lecture', 'YOUTUBE_TRANSCRIPT', 'Lecture: waves and sound'),
  source('speed', 'WEB_PAGE', 'Speed of sound in air'),
  source('kepler', 'FILE', 'Kepler, Astronomia Nova (excerpt).pdf'),
  source('ecology', 'WEB_PAGE', 'Hudson’s Bay lynx and hare records'),
]

const tex = (source: string, displayMode = false) => katex.renderToString(source, { throwOnError: false, displayMode })
const TeX = ({ source, display = false, demo }: { source: string; display?: boolean; demo?: string }) =>
  // KaTeX output is generated from the constant strings in this file, never from user input.
  display
    ? <div data-type="block-math" data-demo={demo} className="overflow-x-auto rounded-lg py-1 text-[0.8em] transition-colors sm:text-base" dangerouslySetInnerHTML={{ __html: tex(source, true) }} />
    : <span dangerouslySetInnerHTML={{ __html: tex(source) }} />

export type DemoNote = { kind: VisualKind; noteId: string; spaceId: string; title: string; tab: string; prompt: string; body: ReactNode }

export const demoScenes: DemoNote[] = [
  {
    kind: 'euler',
    noteId: 'euler',
    spaceId: 'maths',
    title: 'Unrolling Euler’s formula',
    tab: 'Euler’s formula',
    prompt: 'Show this formula unrolled in 3D, at an isometric angle.',
    body: <>
      <p>Raising <TeX source="e" /> to an imaginary power doesn’t make anything grow. It turns. As <TeX source="\theta" /> increases, <TeX source="e^{i\theta}" /> walks around the unit circle.</p>
      <TeX display demo="formula" source="e^{i\theta} = \cos\theta + i\sin\theta" />
      <p>Unroll the circle along <TeX source="\theta" /> and the point traces a helix. From the side you see <TeX source="\sin\theta" />; from above, <TeX source="\cos\theta" />. One rotation, two waves.</p>
    </>,
  },
  {
    kind: 'kepler',
    noteId: 'kepler',
    spaceId: 'orbits',
    title: 'Why planets speed up near the Sun',
    tab: 'Kepler’s orbits',
    prompt: 'Show the orbit in 3D and shade the area swept each month.',
    body: <>
      <p>Kepler found that a planet moves on an ellipse with the Sun at one focus, and that the line from the Sun to the planet sweeps out <strong>equal areas in equal times</strong>.</p>
      <TeX display demo="formula" source="\frac{dA}{dt} = \frac{L}{2m} = \text{constant}" />
      <p>Close to the Sun that line is short, so the planet has to move fast to cover its share of area; far away it crawls. For Earth (<TeX source="e = 0.017" />) the difference is tiny. At <TeX source="e = 0.7" />, like a comet, the planet moves almost six times faster at perihelion than at aphelion.</p>
    </>,
  },
  {
    kind: 'doppler',
    noteId: 'doppler',
    spaceId: 'waves',
    title: 'Why a passing siren drops in pitch',
    tab: 'Doppler effect',
    prompt: 'Show the waves bunching up, and what happens past the speed of sound.',
    body: <>
      <p data-demo="formula">A moving source squeezes its waves together ahead of it and stretches them behind. On the line of motion you hear <TeX source="\frac{f_0}{1 - v/c}" /> as it comes at you and <TeX source="\frac{f_0}{1 + v/c}" /> as it leaves, so a 440 Hz source at 0.9 times the speed of sound is heard at 4400 Hz approaching and 232 Hz receding.</p>
      <p>At the speed of sound the wavefronts pile up; above it they form a Mach cone, 41.8° at <TeX source="1.5c" />. Pitch is computed from true wave travel times; the boom is added.</p>
    </>,
  },
  {
    kind: 'fourier',
    noteId: 'fourier',
    spaceId: 'maths',
    title: 'Drawing a square wave with circles',
    tab: 'Fourier circles',
    prompt: 'Show the circles drawing the wave, and what more terms do.',
    body: <>
      <p>Any repeating signal can be built from sine waves. A square wave needs only the odd harmonics, each one smaller than the last:</p>
      <TeX display demo="formula" source="\begin{aligned} f(t) &= \tfrac{4}{\pi}\big(\sin t + \tfrac{1}{3}\sin 3t \\ &\qquad + \tfrac{1}{5}\sin 5t + \cdots\big) \end{aligned}" />
      <p>Give each term its own spinning circle, stack them tip to tail, and follow the height of the last tip over time. More circles sharpen the corners, but the wave always overshoots each jump by about 9% of its height: the Gibbs phenomenon.</p>
    </>,
  },
  {
    kind: 'predator',
    noteId: 'predator',
    spaceId: 'living',
    title: 'Why fox numbers lag behind rabbits',
    tab: 'Predator & prey',
    prompt: 'Plot rabbits, foxes and time together in 3D.',
    body: <>
      <p>When rabbits are plentiful, foxes thrive and multiply. Then the rabbits are eaten down, the foxes starve, and the rabbits recover. The Lotka–Volterra equations capture the loop:</p>
      <TeX display demo="formula" source="\begin{gathered} \frac{dR}{dt} = \alpha R - \beta R F \\ \frac{dF}{dt} = \delta R F - \gamma F \end{gathered}" />
      <p>The populations never settle. They circle a balance point, and the foxes’ peak always arrives after the rabbits’: a quarter of a cycle later when the swings are small, and sooner when they are wild.</p>
    </>,
  },
]
