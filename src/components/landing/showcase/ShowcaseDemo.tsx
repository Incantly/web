'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react'
import { AppIcon } from '../../product/AppIcon'
import { CurrentUserProvider } from '../../product/SessionGate'
import { Sidebar } from '../../product/workspace/Sidebar'
import { SpaceGlyph } from '../../product/workspace/ui'
import { demoNotes, demoScenes, demoSources, demoSpaces, demoUser } from './demoNotes'
import { freshVisual, VizBlock, type VisualKind, type VisualState } from './VizBlock'

/**
 * The landing page's product preview: the real workspace sidebar around a sample note, with a
 * demo cursor that asks Incantly for a visual and plays with it, then moves on to the next note.
 * Any real click hands control to the visitor and stops the tour.
 */

type Step = { wait: number; run: (tour: Tour) => void }
type Tour = { move: (target: string) => void; press: (target: string) => void; hover: (target: string | null) => void; next: () => void }

/** Look at the formula, ask for a visual, then try one or two of its controls. */
const generate: Step[] = [
    { wait: 900, run: (tour) => { tour.move('formula'); tour.hover('formula') } },
    { wait: 1500, run: (tour) => { tour.move('visualize'); tour.hover(null) } },
    { wait: 1100, run: (tour) => tour.press('visualize') },
]
const press = (target: string, wait: number): Step[] => [{ wait, run: (tour) => tour.move(target) }, { wait: 1000, run: (tour) => tour.press(target) }]
const next = (wait: number): Step => ({ wait, run: (tour) => tour.next() })

const STEPS: Record<VisualKind, Step[]> = {
  euler: [
    { wait: 900, run: (tour) => { tour.move('formula'); tour.hover('formula') } },
    { wait: 1500, run: (tour) => { tour.move('visualize'); tour.hover(null) } },
    { wait: 1100, run: (tour) => tour.press('visualize') },
    { wait: 4600, run: (tour) => tour.move('view-front') },
    { wait: 1000, run: (tour) => tour.press('view-front') },
    { wait: 2600, run: (tour) => tour.move('view-side') },
    { wait: 1000, run: (tour) => tour.press('view-side') },
    { wait: 2600, run: (tour) => tour.move('view-iso') },
    { wait: 1000, run: (tour) => tour.press('view-iso') },
    { wait: 4200, run: (tour) => tour.next() },
  ],
  doppler: [
    { wait: 900, run: (tour) => { tour.move('formula'); tour.hover('formula') } },
    { wait: 1800, run: (tour) => { tour.move('visualize'); tour.hover(null) } },
    { wait: 1100, run: (tour) => tour.press('visualize') },
    { wait: 5200, run: (tour) => tour.move('param-1.5') },
    { wait: 1000, run: (tour) => tour.press('param-1.5') },
    { wait: 7000, run: (tour) => tour.next() },
  ],
  kepler: [...generate, ...press('param-0.7', 3800), ...press('view-top', 3600), ...press('view-iso', 3600), next(2800)],
  fourier: [...generate, ...press('param-9', 3600), ...press('param-25', 2800), ...press('view-side', 2600), next(3800)],
  predator: [...generate, ...press('view-front', 4200), ...press('param-200', 3000), ...press('view-iso', 3200), next(3800)],
}
const GENERATING_MS = 1400

function subscribeReducedMotion(callback: () => void) {
  const query = window.matchMedia('(prefers-reduced-motion: reduce)')
  query.addEventListener('change', callback)
  return () => query.removeEventListener('change', callback)
}
const useReducedMotion = () => useSyncExternalStore(subscribeReducedMotion, () => window.matchMedia('(prefers-reduced-motion: reduce)').matches, () => false)

const tabClass = 'inline-flex min-h-11 items-center border-b-2 border-transparent px-1 py-2 text-[0.8125rem] font-semibold text-subtle hover:border-button hover:text-button focus-visible:border-button focus-visible:text-button aria-pressed:border-button aria-pressed:text-button'
const iconButton = 'grid size-11 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface hover:text-foreground'
const noop = () => {}

export function ShowcaseDemo({ backdrop }: { backdrop?: ReactNode }) {
  const reduced = useReducedMotion()
  const root = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLElement>(null)
  const [sceneIndex, setSceneIndex] = useState(0)
  const [step, setStep] = useState(0)
  const [touring, setTouring] = useState(true)
  const [inView, setInView] = useState(false)
  const [visual, setVisual] = useState<VisualState>(() => freshVisual(demoScenes[0].kind, false, false))
  const [cursor, setCursor] = useState({ target: '', x: 0, y: 0, pressing: false })
  const [hot, setHot] = useState<string | null>(null)
  const generating = useRef(0)
  const scene = demoScenes[sceneIndex]
  const autoplay = touring && !reduced

  // Reduced motion: no tour; show the finished visual, paused, until the visitor changes something.
  const settled = (current: VisualState): VisualState => current.phase === 'idle' ? { ...current, phase: 'live', playing: false } : current
  const shownVisual = reduced ? settled(visual) : visual
  const update = useCallback((patch: Partial<VisualState>) => setVisual((current) => ({ ...(reduced ? settled(current) : current), ...patch })), [reduced])

  const visualize = useCallback(() => {
    window.clearTimeout(generating.current)
    setVisual((current) => ({ ...current, phase: 'generating' }))
    generating.current = window.setTimeout(() => setVisual((current) => ({ ...current, phase: 'live' })), GENERATING_MS)
  }, [])
  useEffect(() => () => window.clearTimeout(generating.current), [])

  const locate = useCallback((target: string) => {
    const frame = root.current
    const element = frame?.querySelector<HTMLElement>(`[data-demo="${target}"]`)
    if (!frame || !element) return null
    const box = frame.getBoundingClientRect()
    const rect = element.getBoundingClientRect()
    return { x: rect.left - box.left + Math.min(rect.width / 2, 48), y: rect.top - box.top + rect.height / 2 }
  }, [])

  // The tour: one timer per step, paused whenever the preview is off screen.
  useEffect(() => {
    if (!autoplay || !inView) return
    const steps = STEPS[scene.kind]
    const current = steps[step]
    if (!current) return
    const tour: Tour = {
      move: (target) => {
        const element = root.current?.querySelector<HTMLElement>(`[data-demo="${target}"]`)
        const area = scroller.current
        // Keep the target inside the note's own scroll box; never scroll the page.
        if (element && area && area.scrollHeight > area.clientHeight) {
          const top = element.getBoundingClientRect().top - area.getBoundingClientRect().top + area.scrollTop
          if (top < area.scrollTop + 48 || top > area.scrollTop + area.clientHeight - 96) area.scrollTo({ top: Math.max(0, top - area.clientHeight / 3), behavior: 'smooth' })
        }
        window.setTimeout(() => {
          const point = locate(target)
          if (point) setCursor({ target, ...point, pressing: false })
        }, 60)
      },
      press: (target) => {
        setCursor((value) => ({ ...value, pressing: true }))
        window.setTimeout(() => {
          setCursor((value) => ({ ...value, pressing: false }))
          root.current?.querySelector<HTMLElement>(`[data-demo="${target}"]`)?.click()
        }, 180)
      },
      hover: setHot,
      next: () => {
        const following = (sceneIndex + 1) % demoScenes.length
        setSceneIndex(following)
        setVisual((value) => freshVisual(demoScenes[following].kind, value.sound, false))
        scroller.current?.scrollTo({ top: 0 })
        setStep(-1)
      },
    }
    const timer = window.setTimeout(() => { current.run(tour); setStep((value) => value + 1) }, current.wait)
    return () => window.clearTimeout(timer)
  }, [autoplay, inView, locate, scene.kind, sceneIndex, step])

  useEffect(() => {
    const frame = root.current
    if (!frame) return
    const seen = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.2 })
    seen.observe(frame)
    // Keep the cursor on its target when the layout reflows.
    const resize = new ResizeObserver(() => setCursor((value) => {
      const point = value.target ? locate(value.target) : null
      return point ? { ...value, ...point } : value
    }))
    resize.observe(frame)
    return () => { seen.disconnect(); resize.disconnect() }
  }, [locate])

  const takeOver = (event: { isTrusted: boolean }) => { if (event.isTrusted && touring) setTouring(false) }
  const openScene = (index: number) => {
    setTouring(false)
    setSceneIndex(index)
    setVisual((value) => freshVisual(demoScenes[index].kind, value.sound, true))
    scroller.current?.scrollTo({ top: 0 })
  }
  const replay = () => {
    setVisual((value) => freshVisual(scene.kind, value.sound, false))
    setStep(0)
    setHot(null)
    scroller.current?.scrollTo({ top: 0 })
    setTouring(true)
  }

  const space = demoSpaces.find((item) => item.id === scene.spaceId) ?? null
  const sidebar = { view: `note:${scene.noteId}` as const, notes: demoNotes, spaces: demoSpaces, sources: demoSources, navigate: noop, onNew: noop, onOpenSource: noop, onOpenSettings: noop }

  return <>
    <div className="mx-auto mt-11 flex max-w-[72rem] flex-wrap items-center justify-center gap-x-4 gap-y-1 border-b border-default">
      <div role="group" aria-label="Sample notes" className="flex flex-wrap justify-center gap-x-4">
        {demoScenes.map((item, index) => <button key={item.noteId} type="button" aria-pressed={index === sceneIndex} onClick={() => openScene(index)} className={tabClass}>{item.tab}</button>)}
      </div>
      {!autoplay && !reduced ? <button type="button" onClick={replay} className={`${tabClass} gap-1.5`}><AppIcon name="play" className="size-3.5" />Replay the tour</button> : null}
    </div>

    <div className="relative mx-auto mt-10 max-w-[78rem] overflow-hidden rounded-[1.25rem] border border-default bg-surface p-[clamp(0.5rem,3vw,2rem)]">
      {backdrop}
      <CurrentUserProvider user={demoUser}>
        <div ref={root} role="region" aria-label="Incantly workspace preview" onClickCapture={takeOver} onKeyDownCapture={takeOver}
          className="relative flex overflow-hidden rounded-xl border border-default bg-surface lg:h-[46rem]">
          <div className="hidden w-[15.5rem] shrink-0 lg:block"><Sidebar {...sidebar} /></div>

          <div className="min-w-0 flex-1 p-1.5 sm:p-2 lg:pl-0">
            <section ref={scroller} aria-label="Note" className="h-full rounded-[1.15rem] border border-default bg-raised lg:overflow-y-auto">
              <div className="flex min-h-12 items-center gap-1.5 px-2 pt-1 sm:px-4">
                <span className={`${iconButton} lg:hidden`} aria-hidden="true"><AppIcon name="panel" className="size-5" /></span>
                <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-1.5 text-sm">
                  {space ? <><span className="flex min-h-11 max-w-[40%] shrink items-center gap-1.5 px-1.5 text-muted"><SpaceGlyph icon={space.icon} size="sm" /><span className="truncate">{space.name}</span></span><span aria-hidden="true" className="text-subtle">/</span></> : null}
                  <span className="min-w-0 truncate font-display text-base text-foreground">{scene.title}</span>
                </nav>
                <div className="ml-auto flex shrink-0 items-center gap-0.5">
                  <span className="hidden items-center gap-1.5 px-2 text-xs text-muted sm:flex"><AppIcon name="check" className="size-3.5" />Saved</span>
                  <span className={`${iconButton} hidden sm:grid`} aria-hidden="true"><AppIcon name="link" className="size-5" /></span>
                  <span className={iconButton} aria-hidden="true"><AppIcon name="more" className="size-5" /></span>
                </div>
              </div>

              <div className="incantly-document-editor bg-transparent [&_.ProseMirror]:min-h-0 [&_[data-demo=formula]]:transition-colors [&[data-hot=formula]_[data-demo=formula]]:bg-surface"
                data-hot={hot ?? undefined}
                style={{ '--incantly-document-background': 'transparent', '--incantly-document-surface': 'transparent', '--incantly-document-padding-block': 'clamp(1rem, 3vw, 2rem)', '--incantly-document-content-width': '46rem' } as CSSProperties}>
                <div className="incantly-document-editor__content">
                  <div className="ProseMirror" key={scene.noteId}>
                    <h1>{scene.title}</h1>
                    {scene.body}
                    <VizBlock key={scene.kind} kind={scene.kind} state={shownVisual} update={update} onVisualize={visualize} prompt={scene.prompt} />
                  </div>
                </div>
              </div>
            </section>
          </div>

          {autoplay && cursor.target ? <div aria-hidden="true" className="pointer-events-none absolute left-0 top-0 z-30 transition-transform duration-[900ms] ease-[cubic-bezier(0.32,0.72,0,1)]" style={{ transform: `translate(${cursor.x}px, ${cursor.y}px)` }}>
            <svg viewBox="0 0 24 24" className={`size-6 -translate-x-1 -translate-y-0.5 fill-foreground stroke-raised drop-shadow transition-transform duration-150 ${cursor.pressing ? 'scale-75' : 'scale-100'}`} strokeWidth="1.5" strokeLinejoin="round"><path d="M5 3v16l4.5-4.2 3 6.7 2.6-1.2-3-6.6H18z" /></svg>
          </div> : null}
        </div>
      </CurrentUserProvider>
    </div>
  </>
}
