'use client'

import { useState } from 'react'
import { AppIcon } from '../AppIcon'
import type { SourceKind, SourceRecord, SourceStatus, SpaceRecord, SpaceSourceLink } from './model'
import { sensitivities, sourceKindMeta, sourceKinds } from './model'
import type { PreviewStore } from './usePreviewStore'
import { updatedLabel } from './SpaceViews'
import { ConfirmDialog, Dialog, EmptyState, PageFrame, PageHeading, SpaceGlyph, StatusChip, buttonPrimary, buttonSecondary, inputClass, labelClass } from './ui'

const statusFilters: { value: SourceStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'READY', label: 'Ready' },
  { value: 'PROCESSING', label: 'Processing' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'ARCHIVED', label: 'Archived' },
]

function matchesStatus(source: SourceRecord, filter: SourceStatus | 'ALL') {
  if (filter === 'ALL') return source.status !== 'ARCHIVED'
  if (filter === 'READY') return source.status === 'READY' || source.status === 'PARTIALLY_READY'
  if (filter === 'PROCESSING') return source.status === 'PENDING' || source.status === 'PROCESSING'
  if (filter === 'FAILED') return source.status === 'FAILED' || source.status === 'QUARANTINED'
  return source.status === filter
}

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" aria-pressed={selected} onClick={onClick} className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors ${selected ? 'border-foreground bg-foreground text-inverse' : 'border-default text-muted hover:border-strong hover:text-foreground'}`}>{children}</button>
}

export function LibraryView({ sources, spaces, links, store, onAdd }: { sources: SourceRecord[]; spaces: SpaceRecord[]; links: SpaceSourceLink[]; store: PreviewStore; onAdd: () => void }) {
  const [kind, setKind] = useState<SourceKind | 'ALL'>('ALL')
  const [status, setStatus] = useState<SourceStatus | 'ALL'>('ALL')
  const [openId, setOpenId] = useState<string | null>(null)
  const visible = sources.filter((source) => (kind === 'ALL' || source.kind === kind) && matchesStatus(source, status))
  const open = sources.find((source) => source.id === openId)

  return <PageFrame wide>
    <PageHeading title="Library" subtitle="Everything you study from: files, recordings, captions, web pages and text. Add a source once and use it in any Space or note."
      actions={<button type="button" onClick={onAdd} className={buttonPrimary}><AppIcon name="upload" className="size-4" />Add to Library</button>} />

    <div className="mt-8 space-y-3">
      <div role="group" aria-label="Filter by type" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        <Chip selected={kind === 'ALL'} onClick={() => setKind('ALL')}>All types</Chip>
        {sourceKinds.map((item) => <Chip key={item.kind} selected={kind === item.kind} onClick={() => setKind(item.kind)}><AppIcon name={item.icon} className="size-4" />{item.label}</Chip>)}
      </div>
      <div role="group" aria-label="Filter by status" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {statusFilters.map((item) => <Chip key={item.value} selected={status === item.value} onClick={() => setStatus(item.value)}>{item.label}</Chip>)}
      </div>
    </div>

    <div className="mt-6">
      {visible.length ? <ul className="divide-y divide-default border-y border-default">
        {visible.map((source) => {
          const meta = sourceKindMeta(source.kind)
          const used = links.filter((link) => link.sourceId === source.id).length
          return <li key={source.id}><button type="button" onClick={() => setOpenId(source.id)} className="flex min-h-[4.5rem] w-full items-center gap-3 py-3 text-left">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-surface text-muted"><AppIcon name={meta.icon} className="size-5" /></span>
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-foreground">{source.title}</span><span className="mt-0.5 block truncate text-xs text-muted">{meta.label} · {used ? `In ${used} ${used === 1 ? 'Space' : 'Spaces'}` : 'Not in a Space'} · {updatedLabel(source.updatedAt)}</span></span>
            <StatusChip status={source.status} />
            <AppIcon name="chevron" className="size-4 shrink-0 text-subtle" />
          </button></li>
        })}
      </ul> : sources.length
        ? <EmptyState icon="search" title="Nothing matches these filters" action={<button type="button" onClick={() => { setKind('ALL'); setStatus('ALL') }} className={buttonSecondary}>Clear filters</button>} />
        : <EmptyState icon="library" title="Your Library is empty" body="Add PDFs, lecture recordings, YouTube captions, web pages or pasted text. They become searchable study material for your notes and Spaces." action={<button type="button" onClick={onAdd} className={buttonPrimary}><AppIcon name="upload" className="size-4" />Add to Library</button>} />}
    </div>

    <SourceDrawer source={open} spaces={spaces} links={links} store={store} onClose={() => setOpenId(null)} />
  </PageFrame>
}

function SourceDrawer({ source, spaces, links, store, onClose }: { source?: SourceRecord; spaces: SpaceRecord[]; links: SpaceSourceLink[]; store: PreviewStore; onClose: () => void }) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const meta = source ? sourceKindMeta(source.kind) : null
  const inSpaces = source ? spaces.filter((space) => links.some((link) => link.sourceId === source.id && link.spaceId === space.id)) : []
  const archived = source?.status === 'ARCHIVED'

  return <>
    <Dialog variant="drawer" open={Boolean(source)} onClose={onClose} title={source?.title ?? 'Source'} description={meta ? meta.label : undefined}
      footer={source ? <>
        <button type="button" onClick={() => setConfirmDelete(true)} className={`${buttonSecondary} mr-auto text-danger`}><AppIcon name="trash" className="size-4" />Delete</button>
        {archived
          ? <button type="button" onClick={() => store.updateSource(source.id, { status: 'PENDING' })} className={buttonSecondary}><AppIcon name="restore" className="size-4" />Restore</button>
          : <button type="button" onClick={() => store.updateSource(source.id, { status: 'ARCHIVED' })} className={buttonSecondary}><AppIcon name="archive" className="size-4" />Archive</button>}
      </> : undefined}>
      {source ? <div className="space-y-6">
        <div className="flex items-center gap-2"><StatusChip status={source.status} /><span className="text-xs text-muted">Updated {updatedLabel(source.updatedAt)}</span></div>
        {source.status === 'PENDING' || source.status === 'PROCESSING' ? <p className="rounded-xl bg-surface p-3 text-sm leading-6 text-muted">This source is waiting to be processed. It becomes searchable when it’s ready.</p> : null}
        <label className={labelClass}>Title
          <input key={source.id} defaultValue={source.title} maxLength={300} disabled={archived} onBlur={(event) => { const title = event.target.value.trim(); if (title && title !== source.title) store.updateSource(source.id, { title }) }} className={inputClass} />
        </label>
        <label className={labelClass}>Sensitivity
          <select value={source.sensitivity} disabled={archived} onChange={(event) => store.updateSource(source.id, { sensitivity: event.target.value as SourceRecord['sensitivity'] })} className={inputClass}>
            {sensitivities.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <span className="mt-1.5 block text-xs font-normal leading-5 text-muted">{sensitivities.find((item) => item.value === source.sensitivity)?.help}</span>
        </label>
        <section aria-labelledby="source-spaces">
          <h3 id="source-spaces" className={labelClass}>Used in</h3>
          {inSpaces.length ? <ul className="mt-2 space-y-1">{inSpaces.map((space) => <li key={space.id} className="flex items-center gap-2 text-sm text-foreground"><SpaceGlyph icon={space.icon} size="sm" /><span className="truncate">{space.name}</span></li>)}</ul>
            : <p className="mt-1.5 text-sm text-muted">Not linked to any Space yet. Link it from a Space’s Sources tab.</p>}
        </section>
      </div> : null}
    </Dialog>
    {source ? <ConfirmDialog open={confirmDelete} onClose={() => setConfirmDelete(false)} destructive confirmLabel="Delete source" title={`Delete “${source.title}”?`}
      body="It’s removed from every Space and note that uses it. The original file stays available in any note that shows it."
      onConfirm={() => { store.deleteSource(source.id); onClose() }} /> : null}
  </>
}
