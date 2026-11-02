'use client'

import { useId } from 'react'
import type { HeaderFooterState } from '@/hooks/use-header-footer'
import { HeaderFooterTextEditor } from '@/lib/document-editor/components/HeaderFooterTextEditor'
import type { NumberStyle } from './headerFooterModel'
import { Tabs, inputClass, labelClass } from './ui'

export function Toggle({ label, hint, checked, disabled, onChange }: { label: string; hint: string; checked: boolean; disabled: boolean; onChange: (checked: boolean) => void }) {
  return <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-foreground has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60">
    <input type="checkbox" disabled={disabled} checked={checked} onChange={(event) => onChange(event.target.checked)} className="size-5 accent-[var(--ui-button)]" />
    <span>{label}<span className="block text-xs text-muted">{hint}</span></span>
  </label>
}

/** One header or footer: its presets, then its editor. */
function Slot({ kind, state }: { kind: 'header' | 'footer'; state: HeaderFooterState }) {
  const title = kind === 'header' ? 'Header' : 'Footer'
  const tab = state.tabs.find((item) => item.id === state.variant)?.label.toLowerCase() ?? 'all pages'
  return <div className="space-y-2">
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <p className={labelClass}>{title}</p>
      <div className="flex flex-wrap gap-1" role="group" aria-label={`${title} presets`}>
        {state.presets[kind].map((preset) => <button key={preset.id} type="button" disabled={!state.ready} onClick={() => state.applyPreset(kind, preset.id)} className="group inline-flex min-h-11 items-center disabled:opacity-50">
          <span className="rounded-full bg-surface px-2.5 py-1 text-xs font-medium text-muted transition-colors group-hover:bg-canvas group-hover:text-foreground motion-reduce:transition-none">{preset.label}</span>
        </button>)}
      </div>
    </div>
    <HeaderFooterTextEditor key={`${kind}:${state.editorKey}`} value={state[kind]} disabled={!state.ready} label={`${title}, ${tab}`}
      placeholder={state.variant === 'first' ? 'Blank on the first page' : `No ${kind}`}
      onChange={(content) => state.edit(kind, state.variant, content)} />
  </div>
}

/**
 * Headers and footers in the Page setup panel: Word's two switches, a tab per version, presets,
 * an editor per slot with page fields, number style, and a preview of pages 1–3. Draws only;
 * `useHeaderFooter` holds the behaviour.
 */
export function HeaderFooterSection({ state }: { state: HeaderFooterState }) {
  const styleId = useId()
  return <div className="space-y-4">
    {state.error ? <p role="alert" className="rounded-xl border border-danger bg-danger-surface px-3.5 py-2.5 text-sm text-danger">{state.error}</p> : null}
    <div className="space-y-1">
      <Toggle label="Different first page" hint="A title page with its own header and footer, or none." checked={state.differentFirstPage} disabled={!state.ready} onChange={state.setDifferentFirstPage} />
      <Toggle label="Different odd and even pages" hint="For printing double-sided." checked={state.differentOddEven} disabled={!state.ready} onChange={state.setDifferentOddEven} />
    </div>
    {state.tabs.length > 1 ? <Tabs label="Header and footer versions" tabs={state.tabs} value={state.variant} onChange={state.selectVariant} /> : null}
    <Slot kind="header" state={state} />
    <Slot kind="footer" state={state} />
    <div>
      <label htmlFor={styleId} className={labelClass}>Page number style</label>
      <select id={styleId} disabled={!state.ready} value={state.numberStyle} onChange={(event) => state.setNumberStyle(event.target.value as NumberStyle)} className={inputClass}>
        {state.numberStyles.map((style) => <option key={style.value} value={style.value}>{style.label}</option>)}
      </select>
    </div>
    {state.preview.some((page) => page.header || page.footer) ? <div>
      <p className={labelClass}>Preview</p>
      <ol className="mt-1.5 divide-y divide-default rounded-xl border border-default text-sm" aria-label="What the first pages show">
        {state.preview.map((page) => <li key={page.page} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 px-3.5 py-2">
          <span className="row-span-2 text-xs font-semibold text-muted tabular-nums">p. {page.page}</span>
          <span className="truncate text-foreground">{page.header || <span className="text-muted">No header</span>}</span>
          <span className="truncate text-foreground">{page.footer || <span className="text-muted">No footer</span>}</span>
        </li>)}
      </ol>
    </div> : null}
  </div>
}
