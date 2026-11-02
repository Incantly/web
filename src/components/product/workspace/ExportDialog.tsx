'use client'

import { useId } from 'react'
import type { NoteExportState } from '@/hooks/use-note-export'
import { AppIcon } from '../AppIcon'
import { Toggle } from './HeaderFooterSection'
import { Dialog, buttonPrimary, buttonQuiet, buttonSecondary, labelClass } from './ui'

/**
 * Export the open note: pick a format, choose whether headers and footers print, and for PDF see
 * the pages before printing. Draws only; `useNoteExport` holds the behaviour.
 */
export function ExportDialog({ state, onOpenPageSetup }: { state: NoteExportState; onOpenPageSetup: () => void }) {
  const name = useId()
  const { attachFrame, attachPreview } = state
  const pdf = state.format === 'pdf'
  const action = pdf ? 'Save as PDF' : state.busy ? 'Exporting…' : 'Download'
  return <Dialog open={state.open} onClose={state.close} title="Export" description="Download this note, or save it as a PDF."
    footer={<>
      <button type="button" onClick={state.close} className={buttonSecondary}>Cancel</button>
      <button type="button" onClick={() => void state.run()} disabled={!state.canRun} className={buttonPrimary}>{action}</button>
    </>}>
    <div className="space-y-5">
      <fieldset className="min-w-0">
        <legend className={labelClass}>Format</legend>
        <div className="mt-1.5 grid gap-1 rounded-xl border border-default bg-surface p-1">
          {state.formats.map((format) => <label key={format.value} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg px-3 py-2 text-sm transition-colors has-[:checked]:bg-raised has-[:checked]:shadow-sm has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus motion-reduce:transition-none">
            <input type="radio" name={name} value={format.value} checked={state.format === format.value} onChange={() => state.choose(format.value)} className="mt-1 size-4 shrink-0 accent-[var(--ui-button)]" />
            <span className="min-w-0"><span className="block font-medium text-foreground">{format.label}</span><span className="block text-xs leading-5 text-muted">{format.hint}</span></span>
          </label>)}
        </div>
      </fieldset>

      {state.keepsLayout ? <div className="space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <p className="flex min-w-0 items-center gap-2 text-sm text-foreground"><AppIcon name="paper" className="size-4 shrink-0 text-muted" /><span className="truncate">{state.summary}</span></p>
          <button type="button" onClick={onOpenPageSetup} className={buttonQuiet}>Page setup</button>
        </div>
        {state.hasHeaderFooter
          ? <Toggle label="Include header and footer" hint="Page numbers, title and date print on every page." checked={state.headerFooter} disabled={state.busy} onChange={state.setHeaderFooter} />
          : <p className="text-xs leading-5 text-muted">This note has no header or footer. Add them in Page setup.</p>}
      </div> : null}

      {pdf ? <div>
        <div className="flex items-baseline justify-between gap-3">
          <p className={labelClass}>Preview</p>
          <p role="status" className="text-xs text-muted tabular-nums">
            {state.preview.status === 'rendering' ? 'Drawing pages…' : state.preview.status === 'ready' ? `${state.preview.pages} ${state.preview.pages === 1 ? 'page' : 'pages'}` : null}
          </p>
        </div>
        {state.preview.status === 'error' ? <p role="alert" className="mt-1.5 rounded-xl border border-danger bg-danger-surface px-3.5 py-2.5 text-sm text-danger">{state.preview.message}</p> : null}
        <div ref={attachFrame} className="incantly-export-preview mt-1.5 max-h-[24rem] overflow-y-auto overscroll-contain rounded-xl border border-default bg-canvas p-3" data-ready={state.preview.status === 'ready' || undefined}>
          <div style={{ zoom: state.preview.status === 'ready' ? state.previewScale : 1 }}>
            <div ref={attachPreview} />
          </div>
        </div>
        <p className="mt-1.5 text-xs leading-5 text-muted">In the print window, choose <span className="font-medium text-foreground">Save as PDF</span> as the destination.</p>
      </div> : null}

      {state.error ? <p role="alert" className="rounded-xl border border-danger bg-danger-surface px-3.5 py-2.5 text-sm text-danger">{state.error}</p> : null}
      {state.notes.length ? <ul className="space-y-1 text-xs leading-5 text-muted" aria-label="Export notes">{state.notes.map((note) => <li key={note}>{note}</li>)}</ul> : null}
    </div>
  </Dialog>
}
