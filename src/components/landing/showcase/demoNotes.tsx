import type { ReactNode } from 'react'
import katex from 'katex'
import type { CurrentUser } from '../../product/SessionGate'
import type { NoteRecord, SourceRecord, SpaceRecord } from '../../product/workspace/model'
import type { VisualKind } from './VizBlock'

/** Sample workspace the landing showcase renders the real sidebar against. */

export const demoUser: CurrentUser = { id: 'demo', name: 'Ada Okafor', email: 'ada@example.com' }

const space = (id: string, name: string, icon: string): SpaceRecord => ({ id, name, icon, description: null, homeNoteId: null, status: 'ACTIVE', retentionHold: false, updatedAt: 0 })
export const demoSpaces: SpaceRecord[] = [space('maths', 'Maths, slowly', '∑'), space('waves', 'Sound & waves', '≈'), space('field', 'Field notes', '✎')]

const note = (id: string, title: string, spaceId: string): NoteRecord => ({ id, title, spaceId, updatedAt: 0, currentRevisionId: null })
export const demoNotes: NoteRecord[] = [
  note('euler', 'Unrolling Euler’s formula', 'maths'),
  note('doppler', 'Why a passing siren drops in pitch', 'waves'),
  note('cities', 'Why do cities stay warm at night?', 'field'),
  note('tides', 'Two tides a day', 'field'),
]

const source = (id: string, kind: SourceRecord['kind'], title: string): SourceRecord => ({ id, kind, title, status: 'READY', sensitivity: 'PRIVATE', updatedAt: 0, stage: null, failureCode: null, partialReason: null, assetId: null })
export const demoSources: SourceRecord[] = [
  source('complex', 'FILE', 'Complex numbers, chapter 3.pdf'),
  source('lecture', 'YOUTUBE_TRANSCRIPT', 'Lecture: waves and sound'),
  source('speed', 'WEB_PAGE', 'Speed of sound in air'),
]

const tex = (source: string, displayMode = false) => katex.renderToString(source, { throwOnError: false, displayMode })
const TeX = ({ source, display = false, demo }: { source: string; display?: boolean; demo?: string }) =>
  // KaTeX output is generated from the constant strings in this file, never from user input.
  display
    ? <div data-type="block-math" data-demo={demo} className="rounded-lg py-1 transition-colors" dangerouslySetInnerHTML={{ __html: tex(source, true) }} />
    : <span dangerouslySetInnerHTML={{ __html: tex(source) }} />

export type DemoNote = { kind: VisualKind; noteId: string; spaceId: string; title: string; prompt: string; body: ReactNode }

export const demoScenes: DemoNote[] = [
  {
    kind: 'euler',
    noteId: 'euler',
    spaceId: 'maths',
    title: 'Unrolling Euler’s formula',
    prompt: 'Show this formula unrolled in 3D, at an isometric angle.',
    body: <>
      <p>Raising <TeX source="e" /> to an imaginary power doesn’t make anything grow. It turns. As <TeX source="\theta" /> increases, <TeX source="e^{i\theta}" /> walks around the unit circle.</p>
      <TeX display demo="formula" source="e^{i\theta} = \cos\theta + i\sin\theta" />
      <p>Unroll the circle along <TeX source="\theta" /> and the point traces a helix. From the side you see <TeX source="\sin\theta" />; from above, <TeX source="\cos\theta" />. One rotation, two waves.</p>
    </>,
  },
  {
    kind: 'doppler',
    noteId: 'doppler',
    spaceId: 'waves',
    title: 'Why a passing siren drops in pitch',
    prompt: 'Show the waves bunching up, and what happens past the speed of sound.',
    body: <>
      <p data-demo="formula">A moving source squeezes its waves together ahead of it and stretches them behind. On the line of motion you hear <TeX source="\frac{f_0}{1 - v/c}" /> as it comes at you and <TeX source="\frac{f_0}{1 + v/c}" /> as it leaves, so a 440 Hz source at 0.9 times the speed of sound is heard at 4400 Hz approaching and 232 Hz receding.</p>
      <p>At the speed of sound the wavefronts pile up; above it they form a Mach cone, 41.8° at <TeX source="1.5c" />. Pitch is computed from true wave travel times; the boom is added.</p>
    </>,
  },
]
