'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AppIcon, type IconName } from '../../product/AppIcon'
import { approachFrequency, machAngleDegrees, recedeFrequency } from './doppler'
import type { ViewName } from './stage'

export type VisualKind = 'euler' | 'doppler'
export type VisualPhase = 'idle' | 'generating' | 'live'
export type VisualState = { phase: VisualPhase; playing: boolean; view: ViewName; mach: number; sound: boolean }

type Controller = {
  setPlaying: (playing: boolean) => void
  setView: (view: ViewName) => void
  restart: () => void
  setMach?: (mach: number) => void
  setSound?: (on: boolean) => void
  dispose: () => void
}

const VIEWS: Record<VisualKind, { name: ViewName; label: string }[]> = {
  euler: [{ name: 'iso', label: 'Isometric' }, { name: 'front', label: 'Circle' }, { name: 'side', label: 'Sine' }, { name: 'top', label: 'Cosine' }],
  doppler: [{ name: 'iso', label: 'Isometric' }, { name: 'top', label: 'Top' }, { name: 'side', label: 'Side' }],
}
const MACHS = [0.5, 0.9, 1.5]
const F0 = 440

const stageButton = 'inline-flex shrink-0 whitespace-nowrap min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-viz-label transition-colors hover:bg-viz-grid hover:text-viz-guide aria-pressed:bg-viz-grid aria-pressed:text-viz-guide'

function StageButton({ icon, label, pressed, onClick, demo, children }: { icon?: IconName; label: string; pressed?: boolean; onClick: () => void; demo?: string; children?: ReactNode }) {
  return <button type="button" onClick={onClick} aria-pressed={pressed} aria-label={children ? undefined : label} title={children ? undefined : label} data-demo={demo} className={stageButton}>
    {icon ? <AppIcon name={icon} className="size-4" /> : null}{children}
  </button>
}

const hz = (value: number) => (Number.isFinite(value) ? `${Math.round(value).toLocaleString('en-US')} Hz` : '—')

export function VizBlock({ kind, state, update, onVisualize, prompt }: { kind: VisualKind; state: VisualState; update: (patch: Partial<VisualState>) => void; onVisualize: () => void; prompt: string }) {
  const host = useRef<HTMLDivElement>(null)
  const controller = useRef<Controller | null>(null)
  const [failed, setFailed] = useState(false)
  const [ready, setReady] = useState(0)
  const [heard, setHeard] = useState<number[]>([])
  const live = state.phase === 'live'

  useEffect(() => {
    if (!live || !host.current) return
    const element = host.current
    let cancelled = false
    const load = kind === 'euler'
      ? import('./eulerScene').then((module) => module.createEulerScene(element))
      : import('./dopplerScene').then((module) => module.createDopplerScene(element, (hearing) => setHeard(hearing.frequencies)))
    load.then((created) => {
      if (cancelled) { created.dispose(); return }
      controller.current = created
      setFailed(false)
      setReady((count) => count + 1)
    }).catch(() => { if (!cancelled) setFailed(true) })
    return () => {
      cancelled = true
      controller.current?.dispose()
      controller.current = null
    }
  }, [kind, live])

  // Mirror the controls into the running scene once it has loaded.
  useEffect(() => { controller.current?.setPlaying(state.playing) }, [ready, state.playing])
  useEffect(() => { controller.current?.setView(state.view) }, [ready, state.view])
  useEffect(() => { controller.current?.setMach?.(state.mach) }, [ready, state.mach])
  useEffect(() => { controller.current?.setSound?.(state.sound) }, [ready, state.sound])

  if (state.phase === 'idle') {
    return <div className="mt-6 flex flex-col gap-3 rounded-xl border border-dashed border-default bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="m-0 flex items-start gap-2 text-sm text-muted"><AppIcon name="sparkles" className="mt-0.5 size-4 shrink-0 text-foreground" />{prompt}</p>
      <button type="button" onClick={onVisualize} data-demo="visualize" className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-button px-4 text-sm font-medium text-inverse hover:bg-button-hover">
        <AppIcon name="sparkles" className="size-4" />Visualize
      </button>
    </div>
  }

  const angle = machAngleDegrees(state.mach)
  return <figure className="m-0 mt-6 overflow-hidden rounded-xl bg-viz-stage" aria-label={kind === 'euler' ? 'Interactive 3D visual of Euler’s formula' : 'Interactive 3D visual of the Doppler effect'}>
    <div className="relative aspect-[4/3] w-full sm:aspect-[16/10]">
      {state.phase === 'generating'
        ? <div className="absolute inset-0 grid place-items-center" role="status">
          <span className="flex items-center gap-2 text-sm text-viz-label"><AppIcon name="sparkles" className="size-4 animate-pulse motion-reduce:animate-none" />Building the visual from this note…</span>
        </div>
        : <div ref={host} className="absolute inset-0" />}
      {failed ? <p className="absolute inset-0 m-0 grid place-items-center p-6 text-center text-sm text-viz-label">This visual needs WebGL, which this browser has turned off.</p> : null}
      {live && kind === 'doppler' ? <dl className="pointer-events-none absolute left-3 top-3 m-0 grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 rounded-lg bg-viz-stage/80 px-3 py-2 text-[0.6875rem] text-viz-label">
        <dt>Approaching</dt><dd className="m-0 text-right tabular-nums text-viz-guide">{hz(approachFrequency(F0, state.mach))}</dd>
        <dt>Receding</dt><dd className="m-0 text-right tabular-nums text-viz-guide">{hz(recedeFrequency(F0, state.mach))}</dd>
        <dt>Mach cone</dt><dd className="m-0 text-right tabular-nums text-viz-guide">{angle ? `${angle.toFixed(1)}°` : 'none'}</dd>
        <dt>Listener hears</dt><dd className="m-0 text-right tabular-nums text-viz-3">{heard.length ? heard.map(hz).join(' + ') : 'silence'}</dd>
      </dl> : null}
    </div>
    {live ? <figcaption className="flex items-center gap-1 overflow-x-auto border-t border-viz-grid px-2 py-1 sm:flex-wrap">
      <StageButton icon={state.playing ? 'pause' : 'play'} label={state.playing ? 'Pause' : 'Play'} onClick={() => update({ playing: !state.playing })} demo="play" />
      <StageButton icon="restore" label="Restart" onClick={() => controller.current?.restart()} />
      <span aria-hidden="true" className="mx-1 h-5 w-px bg-viz-grid" />
      <div role="group" aria-label="Camera view" className="flex shrink-0 sm:flex-wrap">
        {VIEWS[kind].map((view) => <StageButton key={view.name} label={view.label} pressed={state.view === view.name} onClick={() => update({ view: view.name })} demo={`view-${view.name}`}>{view.label}</StageButton>)}
      </div>
      {kind === 'doppler' ? <>
        <span aria-hidden="true" className="mx-1 h-5 w-px bg-viz-grid" />
        <div role="group" aria-label="Source speed" className="flex shrink-0 sm:flex-wrap">
          {MACHS.map((mach) => <StageButton key={mach} label={`${mach} times the speed of sound`} pressed={state.mach === mach} onClick={() => update({ mach })} demo={`mach-${mach}`}>{mach}c</StageButton>)}
        </div>
        <span className="ml-auto" />
        <StageButton icon="audio" label={state.sound ? 'Sound on' : 'Sound off'} pressed={state.sound} onClick={() => update({ sound: !state.sound })}>{state.sound ? 'Sound on' : 'Sound off'}</StageButton>
      </> : null}
    </figcaption> : null}
  </figure>
}
