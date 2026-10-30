'use client'

import { useState } from 'react'
import { AppIcon } from '../AppIcon'
import { apiErrorMessage } from '../../../lib/api/errors'
import type { ContextBindingDto } from '../../../lib/api/bindings'
import { bindingNotice, bindingUsages, revisionPolicies, type BindingUsage, type RevisionPolicy } from './bindingModel'
import { PickerDialog } from './dialogs'
import { sourceKindMeta, type SourceRecord } from './model'
import { StatusChip, buttonQuiet, buttonSecondary, iconButton } from './ui'
import { useNoteBindings, useNoteSourceChoices } from '@/hooks/use-note-bindings'

const selectClass = 'mt-1 min-h-11 w-full rounded-lg border border-default bg-surface px-2 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-60'

/** The Library sources this note relies on (its context bindings): list, attach, change and remove. */
export function NoteSourcesSection() {
  const { bindings, limit, status, bind, change, unbind, savingSourceId, error, clearError } = useNoteBindings()
  const { choices, full, libraryEmpty, spaceName } = useNoteSourceChoices()
  // Whether the picker dialog is open is local to this section.
  const [picking, setPicking] = useState(false)

  return <section aria-labelledby="note-sources" className="space-y-3 border-b border-default px-5 py-5">
    <div>
      <h3 id="note-sources" className="flex items-center gap-2 text-sm font-semibold text-foreground"><AppIcon name="link" className="size-4 text-muted" />Sources for this note</h3>
      <p className="mt-1 text-xs leading-5 text-muted">Library sources this note relies on. Questions about this note look in them too.</p>
    </div>

    {status.loading ? <div role="status" aria-label="Loading sources" className="h-14 animate-pulse rounded-xl bg-surface motion-reduce:animate-none" />
      : status.error ? <div className="space-y-2"><p role="alert" className="text-sm text-danger">{apiErrorMessage(status.error)}</p><button type="button" onClick={status.retry} className={buttonSecondary}>Try again</button></div>
      : bindings.length ? <ul className="divide-y divide-default border-y border-default">
        {bindings.map((binding) => <BindingRow key={binding.sourceId} binding={binding} saving={savingSourceId === binding.sourceId}
          onChange={(next) => change(binding, next)} onRemove={() => unbind(binding.sourceId)} />)}
      </ul>
      : <p className="text-sm text-muted">No sources yet. Add one from your Library so answers about this note can draw on it.</p>}

    {error ? <p role="alert" className="flex items-start gap-2 text-sm text-danger"><AppIcon name="alert" className="mt-0.5 size-4 shrink-0" /><span className="min-w-0 flex-1">{error}</span><button type="button" onClick={clearError} className="-my-3 -mr-3 grid size-11 shrink-0 place-items-center rounded-lg text-muted hover:text-foreground" aria-label="Dismiss"><AppIcon name="close" className="size-4" /></button></p> : null}

    {status.loading || status.error ? null : <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => setPicking(true)} disabled={full} className={buttonSecondary}><AppIcon name="plus" className="size-4" />Add a source</button>
      {full ? <span role="status" className="text-xs text-muted">This note has the maximum of {limit} sources.</span> : null}
    </div>}

    <details className="group text-xs leading-5 text-muted">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 font-medium text-foreground [&::-webkit-details-marker]:hidden"><AppIcon name="chevron" className="size-3.5 transition-transform group-open:rotate-90 motion-reduce:transition-none" />How these settings work</summary>
      <dl className="space-y-2 pb-1">
        {[...bindingUsages, ...revisionPolicies].map((option) => <div key={option.value}><dt className="font-medium text-foreground">{option.label}</dt><dd>{option.help}</dd></div>)}
      </dl>
    </details>

    <PickerDialog open={picking} onClose={() => setPicking(false)} title="Add a source to this note" description={spaceName ? `Sources in “${spaceName}” are listed first. Only ready sources can be added.` : 'Only ready sources can be added.'}
      items={choices} empty={libraryEmpty ? 'Your Library is empty. Add a source to your Library first.' : 'Every ready source is already added.'}
      render={(source) => <PickerRow source={source} />} onPick={(source) => bind(source.id)} />
  </section>
}

function PickerRow({ source }: { source: SourceRecord & { inSpace: boolean } }) {
  return <>
    <AppIcon name={sourceKindMeta(source.kind).icon} className="size-4 shrink-0 text-muted" />
    <span className="min-w-0 flex-1 truncate text-sm text-foreground">{source.title}</span>
    {source.inSpace ? <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-xs text-muted">In this Space</span> : null}
  </>
}

function BindingRow({ binding, saving, onChange, onRemove }: { binding: ContextBindingDto; saving: boolean; onChange: (change: { type?: BindingUsage; revisionPolicy?: RevisionPolicy; useNewest?: boolean }) => void; onRemove: () => void }) {
  const meta = sourceKindMeta(binding.source.kind)
  const notice = bindingNotice(binding)
  const generated = binding.type === 'GENERATED_FROM'
  return <li className="space-y-2 py-3" aria-busy={saving}>
    <div className="flex min-w-0 items-center gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface text-muted"><AppIcon name={meta.icon} className="size-4" /></span>
      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-foreground">{binding.source.title}</span><span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">{meta.label}<StatusChip status={binding.source.status} /></span></span>
      <button type="button" onClick={onRemove} disabled={saving} className={iconButton} aria-label={`Remove ${binding.source.title} from this note`} title="Remove from this note"><AppIcon name="unlink" className="size-4" /></button>
    </div>
    {generated ? <p className="text-xs text-muted">This note was made from this source.</p> : <div className="grid grid-cols-2 gap-2">
      <label className="min-w-0 text-xs text-muted">Use
        <select value={binding.type} disabled={saving} onChange={(event) => onChange({ type: event.target.value as BindingUsage })} className={selectClass}>
          {bindingUsages.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <label className="min-w-0 text-xs text-muted">Version
        <select value={binding.revisionPolicy} disabled={saving} onChange={(event) => onChange({ revisionPolicy: event.target.value as RevisionPolicy })} className={selectClass}>
          {revisionPolicies.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
    </div>}
    {notice ? <p className={`flex flex-wrap items-center gap-x-2 text-xs ${notice.tone === 'warning' ? 'text-danger' : 'text-muted'}`}>
      <AppIcon name={notice.tone === 'warning' ? 'alert' : 'clock'} className="size-3.5 shrink-0" /><span className="min-w-0 flex-1">{notice.text}</span>
      {notice.canUseNewest ? <button type="button" onClick={() => onChange({ useNewest: true })} disabled={saving} className={`${buttonQuiet} -my-2`}>Use newest</button> : null}
    </p> : null}
  </li>
}
