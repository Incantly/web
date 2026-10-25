'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AppIcon, type IconName } from '../../product/AppIcon'
import { sceneConfigs, type Readout, type SceneController, type VisualKind } from './scenes'
import type { ViewName } from './stage'

export type { VisualKind } from './scenes'
export type VisualPhase = 'idle' | 'generating' | 'live'
export type VisualState = { phase: VisualPhase; playing: boolean; view: ViewName; param: number | null; sound: boolean }

/** A fresh, un-generated visual for a scene, keeping the visitor's sound choice. */
export const freshVisual = (kind: VisualKind, sound: boolean, live: boolean): VisualState =>
  ({ phase: live ? 'live' : 'idle', playing: true, view: 'iso', param: sceneConfigs[kind].param?.initial ?? null, sound })

const stageButton = 'inline-flex shrink-0 whitespace-nowrap min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-viz-label transition-colors hover:bg-viz-grid hover:text-viz-guide aria-pressed:bg-viz-grid aria-pressed:text-viz-guide'

function StageButton({ icon, label, pressed, onClick, demo, children }: { icon?: IconName; label: string; pressed?: boolean; onClick: () => void; demo?: string; children?: ReactNode }) {
  const named = children !== undefined && children !== label
  return <button type="button" onClick={onClick} aria-pressed={pressed} aria-label={children === undefined || named ? label : undefined} title={children === undefined || named ? label : undefined} data-demo={demo} className={stageButton}>
    {icon ? <AppIcon name={icon} className="size-4" /> : null}{children}
  </button>
}

const Divider = () => <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-viz-grid" />

export function VizBlock({ kind, state, update, onVisualize, prompt }: { kind: VisualKind; state: VisualState; update: (patch: Partial<VisualState>) => void; onVisualize: () => void; prompt: string }) {
  const config = sceneConfigs[kind]
  const host = useRef<HTMLDivElement>(null)
  const controller = useRef<SceneController | null>(null)
  const [failed, setFailed] = useState(false)
  const [ready, setReady] = useState(0)
  const [readouts, setReadouts] = useState<Readout[]>([])
  const live = state.phase === 'live'

  useEffect(() => {
    if (!live || !host.current) return
    const element = host.current
    let cancelled = false
    // Scenes report every frame; show the latest values a few times a second.
    let latest: Readout[] | null = null
    let flush = 0
    const sink = (rows: Readout[]) => {
      latest = rows
      if (!flush) flush = window.setTimeout(() => { flush = 0; if (!cancelled && latest) setReadouts(latest) }, 150)
    }
    config.load(element, sink).then((created) => {
      if (cancelled) { created.dispose(); return }
      controller.current = created
      setFailed(false)
      setReady((count) => count + 1)
    }).catch(() => { if (!cancelled) setFailed(true) })
    return () => {
      cancelled = true
      window.clearTimeout(flush)
      controller.current?.dispose()
      controller.current = null
    }
  }, [config, live])

  // Mirror the controls into the running scene once it has loaded.
  useEffect(() => { controller.current?.setPlaying(state.playing) }, [ready, state.playing])
  useEffect(() => { controller.current?.setView(state.view) }, [ready, state.view])
  useEffect(() => { if (state.param !== null) controller.current?.setParam?.(state.param) }, [ready, state.param])
  useEffect(() => { controller.current?.setSound?.(state.sound) }, [ready, state.sound])

  if (state.phase === 'idle') {
    return <div className="mt-6 flex flex-col gap-3 rounded-xl border border-dashed border-default bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="m-0 flex items-start gap-2 text-sm text-muted"><AppIcon name="sparkles" className="mt-0.5 size-4 shrink-0 text-foreground" />{prompt}</p>
      <button type="button" onClick={onVisualize} data-demo="visualize" className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-button px-4 text-sm font-medium text-inverse hover:bg-button-hover">
        <AppIcon name="sparkles" className="size-4" />Visualize
      </button>
    </div>
  }

  return <figure className="m-0 mt-6 overflow-hidden rounded-xl bg-viz-stage" aria-label={config.label}>
    <div className="relative aspect-[4/3] w-full sm:aspect-[16/10]">
      {state.phase === 'generating'
        ? <div className="absolute inset-0 grid place-items-center" role="status">
          <span className="flex items-center gap-2 text-sm text-viz-label"><AppIcon name="sparkles" className="size-4 animate-pulse motion-reduce:animate-none" />Building the visual from this note…</span>
        </div>
        : <div ref={host} className="absolute inset-0" />}
      {failed ? <p className="absolute inset-0 m-0 grid place-items-center p-6 text-center text-sm text-viz-label">This visual needs WebGL, which this browser has turned off.</p> : null}
      {live && readouts.length ? <dl className="pointer-events-none absolute left-3 top-3 m-0 grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 rounded-lg bg-viz-stage/80 px-3 py-2 text-[0.6875rem] text-viz-label">
        {readouts.map((row) => <div key={row.label} className="contents">
          <dt>{row.label}</dt><dd className={`m-0 text-right tabular-nums ${row.accent ? 'text-viz-3' : 'text-viz-guide'}`}>{row.value}</dd>
        </div>)}
      </dl> : null}
    </div>
    {live ? <figcaption className="flex items-center gap-1 overflow-x-auto border-t border-viz-grid px-2 py-1 sm:flex-wrap">
      <StageButton icon={state.playing ? 'pause' : 'play'} label={state.playing ? 'Pause' : 'Play'} onClick={() => update({ playing: !state.playing })} demo="play" />
      <StageButton icon="restore" label="Restart" onClick={() => controller.current?.restart()} />
      <Divider />
      <div role="group" aria-label="Camera view" className="flex shrink-0 sm:flex-wrap">
        {config.views.map((view) => <StageButton key={view.name} label={view.label} pressed={state.view === view.name} onClick={() => update({ view: view.name })} demo={`view-${view.name}`}>{view.label}</StageButton>)}
      </div>
      {config.param ? <>
        <Divider />
        <div role="group" aria-label={config.param.label} className="flex shrink-0 items-center sm:flex-wrap">
          {config.param.options.map((option) => <StageButton key={option.value} label={option.description} pressed={state.param === option.value} onClick={() => update({ param: option.value })} demo={`param-${option.value}`}>{option.label}</StageButton>)}
        </div>
      </> : null}
      {config.sound ? <>
        <span className="ml-auto" />
        <StageButton icon="audio" label={state.sound ? 'Sound on' : 'Sound off'} pressed={state.sound} onClick={() => update({ sound: !state.sound })}>{state.sound ? 'Sound on' : 'Sound off'}</StageButton>
      </> : null}
    </figcaption> : null}
  </figure>
}
