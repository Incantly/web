import type { FieldsetHTMLAttributes } from 'react'
import type { HeaderFooterContent, HeaderFooterFieldType, PageHeaderFooterVariants, PageSetup } from '@incantly/canvas-core/document'
import { normalizePageSetup } from '@incantly/canvas-core/document'

export interface PageSettingsProps extends Omit<FieldsetHTMLAttributes<HTMLFieldSetElement>, 'onChange'> {
  value: PageSetup
  onChange: (value: PageSetup) => void
  disabled?: boolean
}
export function PageSettings({ value, onChange, disabled, className, ...props }: PageSettingsProps) {
  const update = (patch: Partial<PageSetup>) => {
    const next = { ...value, ...patch }
    if (next.size === 'custom') {
      next.width ??= 612
      next.height ??= 792
    }
    try { onChange(normalizePageSetup(next)) } catch { /* invalid numeric input is not committed */ }
  }
  const margin = (side: keyof PageSetup['margins'], next: number) => update({ margins: { ...value.margins, [side]: next } })
  return <fieldset {...props} className={['incantly-page-settings', className].filter(Boolean).join(' ')} disabled={disabled} aria-label={props['aria-label'] ?? 'Page settings'}>
    <label>Mode<select value={value.mode} onChange={(event) => update({ mode: event.target.value as PageSetup['mode'] })}><option value="continuous">Continuous</option><option value="paginated">Paginated</option></select></label>
    <label>Paper<select value={value.size} onChange={(event) => update({ size: event.target.value as PageSetup['size'] })}><option value="a4">A4</option><option value="letter">Letter</option><option value="legal">Legal</option><option value="custom">Custom</option></select></label>
    <label>Orientation<select value={value.orientation} onChange={(event) => update({ orientation: event.target.value as PageSetup['orientation'] })}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label>
    {value.size === 'custom' && <><label>Width (pt)<input type="number" min="72" value={value.width ?? 612} onChange={(event) => update({ width: event.currentTarget.valueAsNumber })} /></label><label>Height (pt)<input type="number" min="72" value={value.height ?? 792} onChange={(event) => update({ height: event.currentTarget.valueAsNumber })} /></label></>}
    {(['top', 'right', 'bottom', 'left'] as const).map((side) => <label key={side}>{side} margin (pt)<input type="number" min="0" value={value.margins[side]} onChange={(event) => margin(side, event.currentTarget.valueAsNumber)} /></label>)}
    <label>Header distance (pt)<input type="number" min="0" value={value.headerDistance ?? 36} onChange={(event) => update({ headerDistance: event.currentTarget.valueAsNumber })} /></label>
    <label>Footer distance (pt)<input type="number" min="0" value={value.footerDistance ?? 36} onChange={(event) => update({ footerDistance: event.currentTarget.valueAsNumber })} /></label>
    <label>Starting page number<input type="number" min="1" value={value.startingPageNumber ?? 1} onChange={(event) => update({ startingPageNumber: event.currentTarget.valueAsNumber })} /></label>
    <label><input type="checkbox" checked={value.mirroredMargins === true} onChange={(event) => update({ mirroredMargins: event.currentTarget.checked })} />Mirror inside/outside margins</label>
  </fieldset>
}

export interface HeaderFooterEditorProps extends Omit<FieldsetHTMLAttributes<HTMLFieldSetElement>, 'onChange'> {
  label: string
  value?: PageHeaderFooterVariants
  onChange: (value: PageHeaderFooterVariants) => void
  disabled?: boolean
}
export function HeaderFooterEditor({ label, value = {}, onChange, disabled, className, ...props }: HeaderFooterEditorProps) {
  const insertField = (variant: keyof PageHeaderFooterVariants, field: HeaderFooterFieldType) => {
    const content: HeaderFooterContent[] = [...(value[variant] ?? []), { type: 'field', field }]
    onChange({ ...value, [variant]: content })
  }
  return <fieldset {...props} className={['incantly-header-footer-editor', className].filter(Boolean).join(' ')} disabled={disabled} aria-label={props['aria-label'] ?? label}><legend>{label}</legend>{(['default', 'first', 'odd', 'even'] as const).map((variant) => <div key={variant}><strong>{variant}</strong>{(['pageNumber', 'pageCount', 'documentTitle', 'currentDate'] as const).map((field) => <button key={field} type="button" onClick={() => insertField(variant, field)}>Insert {field}</button>)}<output aria-live="polite">{(value[variant] ?? []).map((item) => item.type === 'field' ? `{${item.field}}` : `[${item.type}]`).join(' ')}</output></div>)}</fieldset>
}

export function PageSafeArea({ setup }: { setup: PageSetup }) {
  return <div className="incantly-page-safe-area" aria-hidden="true" style={{ inset: `${setup.margins.top}pt ${setup.margins.right}pt ${setup.margins.bottom}pt ${setup.margins.left}pt` }} />
}
