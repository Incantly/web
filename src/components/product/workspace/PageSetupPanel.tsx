'use client'

import { useId, useState, type ReactNode } from 'react'
import type { HeaderFooterState } from '@/hooks/use-header-footer'
import type { PageSetupState } from '@/hooks/use-page-setup'
import { AppIcon, type IconName } from '../AppIcon'
import { HeaderFooterSection } from './HeaderFooterSection'
import type { LengthUnit, MarginPreset } from './pageSetupModel'
import { inputClass, labelClass } from './ui'

/** A row of radio buttons drawn as one segmented control (each option is a 44 px target). */
function Segmented<T extends string | number>({ label, value, options, onChange, disabled }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (value: T) => void; disabled: boolean }) {
  const name = useId()
  return <fieldset disabled={disabled} className="min-w-0">
    <legend className={labelClass}>{label}</legend>
    <div className="mt-1.5 grid auto-cols-fr grid-flow-col gap-1 rounded-xl border border-default bg-surface p-1">
      {options.map((option) => <label key={String(option.value)} className="relative flex min-h-11 cursor-pointer items-center justify-center rounded-lg px-2 text-sm font-medium text-muted transition-colors has-[:checked]:bg-raised has-[:checked]:text-foreground has-[:checked]:shadow-sm has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus has-[:disabled]:cursor-not-allowed">
        <input type="radio" name={name} value={String(option.value)} checked={option.value === value} onChange={() => onChange(option.value)} className="sr-only" />
        {option.label}
      </label>)}
    </div>
  </fieldset>
}

/** A length in the chosen unit. Typing keeps a draft; Enter or leaving the field saves it. */
function LengthField({ label, points, state, onCommit }: { label: string; points: number; state: PageSetupState; onCommit: (text: string) => boolean }) {
  const shown = state.show(points)
  const [draft, setDraft] = useState<string | null>(null)
  const id = useId()
  const commit = () => {
    if (draft === null || draft === shown) { setDraft(null); return }
    if (onCommit(draft)) setDraft(null)
  }
  return <div className="min-w-0">
    <label htmlFor={id} className={labelClass}>{label}</label>
    <div className="relative">
      <input id={id} inputMode="decimal" disabled={!state.ready} value={draft ?? shown}
        onChange={(event) => setDraft(event.target.value)} onBlur={commit}
        onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commit() } if (event.key === 'Escape') setDraft(null) }}
        className={`${inputClass} pr-11 tabular-nums`} />
      <span aria-hidden="true" className="pointer-events-none absolute bottom-0 right-3.5 flex h-11 items-center text-sm text-muted">{state.unitLabel}</span>
    </div>
  </div>
}

/** A titled group, headed like the other note side panels (Context, Sources). */
function Section({ title, icon, children }: { title: string; icon: IconName; children: ReactNode }) {
  return <section className="space-y-4 border-t border-default pt-5 first:border-t-0 first:pt-0">
    <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground"><AppIcon name={icon} className="size-4 text-muted" />{title}</h3>
    {children}
  </section>
}

/**
 * Paper, orientation, margins, columns, page numbering, and headers and footers for the open
 * note, plus Continuous or Pages. Read from and saved through `usePageSetup` and
 * `useHeaderFooter`; this only draws.
 */
export function PageSetupPanel({ state, headerFooter }: { state: PageSetupState; headerFooter: HeaderFooterState }) {
  const { setup, ready } = state
  const paperId = useId()
  const marginsId = useId()
  const unitId = useId()
  const startId = useId()
  const [startDraft, setStartDraft] = useState<string | null>(null)
  const commitStart = () => {
    if (startDraft === null) return
    const value = Number(startDraft)
    if (state.update({ startingPageNumber: Number.isInteger(value) ? value : NaN })) setStartDraft(null)
  }

  return <div className="space-y-6">
    {/* The page, small: its shape, margins and columns. */}
    <div aria-hidden="true" className="flex justify-center rounded-2xl bg-surface p-5">
      <div className="relative w-28 rounded-sm border border-default bg-raised shadow-sm transition-[aspect-ratio] motion-reduce:transition-none" style={{ aspectRatio: state.preview.aspectRatio }}>
        <div className={`absolute grid gap-1 rounded-[1px] border border-dashed border-strong/40 ${setup.columns === 2 ? 'grid-cols-2' : ''}`} style={state.preview.inset}>
          {Array.from({ length: setup.columns }, (_, index) => <div key={index} className="flex flex-col gap-1 p-1">{[100, 90, 95, 70].map((width, line) => <span key={line} className="h-0.5 rounded-full bg-default" style={{ width: `${width}%` }} />)}</div>)}
        </div>
      </div>
    </div>

    {state.error ? <p role="alert" className="rounded-xl border border-danger bg-danger-surface px-3.5 py-2.5 text-sm text-danger">{state.error}</p> : null}
    {!ready ? <p className="text-sm text-muted">Page setup can be changed once the note has loaded and can be edited.</p> : null}

    <Section title="Layout" icon="paper">
      <Segmented label="View" value={setup.mode} disabled={!ready} onChange={(mode) => state.update({ mode })}
        options={[{ value: 'continuous', label: 'Continuous' }, { value: 'paginated', label: 'Pages' }]} />
      <p className="-mt-2 text-sm leading-6 text-muted">{state.paginated ? 'Shows where each page ends, like a printed paper.' : 'One long page. Page lines are hidden.'}</p>
    </Section>

    <Section title="Paper" icon="file">
      <div>
        <label htmlFor={paperId} className={labelClass}>Size</label>
        <select id={paperId} disabled={!ready} value={setup.size} onChange={(event) => state.update({ size: event.target.value as typeof setup.size })} className={inputClass}>
          {state.options.paperSizes.map((size) => <option key={size.value} value={size.value}>{size.label}</option>)}
        </select>
      </div>
      {setup.size === 'custom' ? <div className="grid grid-cols-2 gap-3">
        <LengthField label="Width" points={setup.width ?? 0} state={state} onCommit={(text) => state.updateLength((width) => ({ width }), text)} />
        <LengthField label="Height" points={setup.height ?? 0} state={state} onCommit={(text) => state.updateLength((height) => ({ height }), text)} />
      </div> : null}
      <Segmented label="Orientation" value={setup.orientation} disabled={!ready} onChange={(orientation) => state.update({ orientation })}
        options={[{ value: 'portrait', label: 'Portrait' }, { value: 'landscape', label: 'Landscape' }]} />
    </Section>

    <Section title="Margins" icon="panel">
      <div>
        <label htmlFor={marginsId} className={labelClass}>Preset</label>
        <select id={marginsId} disabled={!ready} value={state.marginPreset} onChange={(event) => state.applyMarginPreset(event.target.value as MarginPreset)} className={inputClass}>
          {state.options.marginPresets.map((preset) => <option key={preset.value} value={preset.value} disabled={preset.value === 'custom'}>{preset.label}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <LengthField label="Top" points={setup.margins.top} state={state} onCommit={(text) => state.updateLength((top) => ({ margins: { top } }), text)} />
        <LengthField label="Bottom" points={setup.margins.bottom} state={state} onCommit={(text) => state.updateLength((bottom) => ({ margins: { bottom } }), text)} />
        <LengthField label={state.marginLabels.left} points={setup.margins.left} state={state} onCommit={(text) => state.updateLength((left) => ({ margins: { left } }), text)} />
        <LengthField label={state.marginLabels.right} points={setup.margins.right} state={state} onCommit={(text) => state.updateLength((right) => ({ margins: { right } }), text)} />
      </div>
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-foreground has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60">
        <input type="checkbox" disabled={!ready} checked={setup.mirroredMargins === true} onChange={(event) => state.update({ mirroredMargins: event.target.checked })} className="size-5 accent-[var(--ui-button)]" />
        <span>Mirror margins for facing pages<span className="block text-xs text-muted">For printing double-sided and binding.</span></span>
      </label>
    </Section>

    <Section title="Columns and numbering" icon="table">
      <Segmented label="Columns" value={setup.columns} disabled={!ready} onChange={(columns) => state.update({ columns })}
        options={[{ value: 1 as const, label: 'One' }, { value: 2 as const, label: 'Two' }]} />
      <div>
        <label htmlFor={startId} className={labelClass}>First page number</label>
        <input id={startId} type="number" inputMode="numeric" min={1} step={1} disabled={!ready} value={startDraft ?? String(setup.startingPageNumber ?? 1)}
          onChange={(event) => setStartDraft(event.target.value)} onBlur={commitStart}
          onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commitStart() } }}
          className={`${inputClass} tabular-nums`} />
      </div>
    </Section>

    <Section title="Header and footer" icon="journal">
      <HeaderFooterSection state={headerFooter} />
    </Section>

    <Section title="Measurements" icon="settings">
      <div>
        <label htmlFor={unitId} className={labelClass}>Show sizes in</label>
        <select id={unitId} value={state.unit} onChange={(event) => state.setUnit(event.target.value as LengthUnit)} className={inputClass}>
          {state.options.units.map((unit) => <option key={unit.value} value={unit.value}>{unit.label}</option>)}
        </select>
      </div>
    </Section>
  </div>
}
