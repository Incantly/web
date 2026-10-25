'use client'

import { useState } from 'react'
import { AppIcon } from '../AppIcon'
import { apiErrorMessage, isApiError } from '../../../lib/api/errors'
import { assetsApi } from '../../../lib/api/assets'
import type { SourceVersionDto } from '../../../lib/api/library'
import type { Navigate, SourceKind, SourceRecord, SourceStatus, SpaceRecord } from './model'
import { sensitivities, sourceKindMeta, sourceKinds } from './model'
import { updatedLabel } from './SpaceViews'
import { processingSummary, stageLabel } from './sourceStatus'
import { useLibraryActions, useSource, useSourceProcessing, useSourceSpaces } from './useLibrary'
import type { ListStatus } from './views'
import { SidePanel } from './sidePanel'
import { IndexStatusView } from './ContextSearch'
import { useSourceIndexStatus } from './useContextSearch'
import { ConfirmDialog, EmptyState, ErrorState, ListSkeleton, PageFrame, PageHeading, SpaceGlyph, StatusChip, buttonPrimary, buttonQuiet, buttonSecondary, inputClass, labelClass } from './ui'

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
  return <button type="button" aria-pressed={selected} onClick={onClick} className={`inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-full border px-3 text-sm transition-colors ${selected ? 'border-foreground bg-foreground text-inverse' : 'border-default text-muted hover:border-strong hover:text-foreground'}`}>{children}</button>
}

export function LibraryView({ userId, sources, status: listStatus, spaces, navigate, openSourceId, onOpenSource, onAdd }: { userId: string; sources: SourceRecord[]; status: ListStatus; spaces: SpaceRecord[]; navigate: Navigate; openSourceId: string | null; onOpenSource: (sourceId: string | null) => void; onAdd: () => void }) {
  const [kind, setKind] = useState<SourceKind | 'ALL'>('ALL')
  const [status, setStatus] = useState<SourceStatus | 'ALL'>('ALL')
  const visible = sources.filter((source) => (kind === 'ALL' || source.kind === kind) && matchesStatus(source, status))

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
      {listStatus.loading ? <ListSkeleton rows={5} label="Loading Library" />
        : listStatus.error ? <ErrorState message={apiErrorMessage(listStatus.error)} onRetry={listStatus.retry} />
        : visible.length ? <ul className="divide-y divide-default border-y border-default">
        {visible.map((source) => {
          const meta = sourceKindMeta(source.kind)
          return <li key={source.id}><button type="button" onClick={() => onOpenSource(source.id)} className="flex min-h-[4.5rem] w-full min-w-0 items-center gap-3 py-3 text-left">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-surface text-muted"><AppIcon name={meta.icon} className="size-5" /></span>
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-foreground">{source.title}</span><span className="mt-0.5 block truncate text-xs text-muted">{meta.label} · {updatedLabel(source.updatedAt)}</span></span>
            <StatusChip status={source.status} stage={source.stage} />
            <AppIcon name="chevron" className="size-4 shrink-0 text-subtle" />
          </button></li>
        })}
      </ul> : sources.length
        ? <EmptyState icon="search" title="Nothing matches these filters" action={<button type="button" onClick={() => { setKind('ALL'); setStatus('ALL') }} className={buttonSecondary}>Clear filters</button>} />
        : <EmptyState icon="library" title="Your Library is empty" body="Add PDFs, lecture recordings, YouTube captions, web pages or pasted text. They become searchable study material for your notes and Spaces." action={<button type="button" onClick={onAdd} className={buttonPrimary}><AppIcon name="upload" className="size-4" />Add to Library</button>} />}
    </div>

    <SourceDrawer userId={userId} sourceId={openSourceId} listed={sources.find((source) => source.id === openSourceId)} spaces={spaces} navigate={navigate} onClose={() => onOpenSource(null)} />
  </PageFrame>
}

function provenanceFacts(version: SourceVersionDto | undefined) {
  const facts: string[] = []
  const provenance = version?.provenance
  if (!provenance) return facts
  if (provenance.pagesParsed != null) facts.push(provenance.pageCount != null && provenance.pageCount !== provenance.pagesParsed ? `${provenance.pagesParsed} of ${provenance.pageCount} pages read` : `${provenance.pagesParsed} pages`)
  if (provenance.durationMs != null) { const minutes = Math.round(provenance.durationMs / 60000); facts.push(minutes >= 1 ? `${minutes} min` : `${Math.round(provenance.durationMs / 1000)} s`) }
  if (provenance.coverage != null) facts.push(`${Math.round(provenance.coverage * 100)}% transcribed`)
  if (provenance.host) facts.push(provenance.host)
  return facts
}

function SourceDrawer({ userId, sourceId, listed, spaces, navigate, onClose }: { userId: string; sourceId: string | null; listed?: SourceRecord; spaces: SpaceRecord[]; navigate: Navigate; onClose: () => void }) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [fileError, setFileError] = useState('')
  const detail = useSource(sourceId)
  const processing = useSourceProcessing(sourceId)
  const actions = useLibraryActions(userId)
  const usedIn = useSourceSpaces(sourceId, spaces.filter((space) => space.status === 'ACTIVE'))
  const source = detail.data
  const title = source?.title ?? listed?.title ?? 'Source'
  const status = processing.data?.sourceStatus ?? source?.status ?? listed?.status ?? 'PENDING'
  const latest = source?.versions[0]
  const stage = processing.data?.version?.processingStage ?? latest?.processingStage ?? listed?.stage ?? null
  const archived = status === 'ARCHIVED'
  const meta = sourceKindMeta(source?.kind ?? listed?.kind ?? 'FILE')
  const fileAssetId = latest?.assetId ?? listed?.assetId ?? null
  const searchable = status === 'READY' || status === 'PARTIALLY_READY'
  const index = useSourceIndexStatus(sourceId, searchable)

  async function openFile() {
    if (!fileAssetId) return
    setFileError('')
    const tab = window.open('', '_blank')
    try {
      const { url } = await assetsApi.download(fileAssetId)
      if (tab) { tab.opener = null; tab.location.href = url } else if (!window.open(url, '_blank', 'noopener,noreferrer')) setFileError('Your browser blocked the new tab. Allow pop-ups to open the file.')
    } catch (cause) { tab?.close(); setFileError(apiErrorMessage(cause)) }
  }

  const retryError = actions.retry.error && isApiError(actions.retry.error, 'NOTHING_TO_RETRY') ? 'There’s nothing to retry: this source didn’t fail.' : null
  const cancelError = actions.cancel.error && isApiError(actions.cancel.error, 'NOT_CANCELLABLE') ? 'This source has already finished processing.' : null

  return <>
    <SidePanel open={Boolean(sourceId)} onClose={onClose} title={title} description={meta.label}
      footer={sourceId ? <>
        <button type="button" onClick={() => setConfirmDelete(true)} disabled={actions.remove.isPending} className={`${buttonSecondary} mr-auto text-danger`}><AppIcon name="trash" className="size-4" />Delete</button>
        {archived
          ? <button type="button" disabled={actions.restore.isPending} onClick={() => actions.restore.mutate(sourceId)} className={buttonSecondary}><AppIcon name="restore" className="size-4" />Restore</button>
          : <button type="button" disabled={actions.archive.isPending} onClick={() => actions.archive.mutate(sourceId)} className={buttonSecondary}><AppIcon name="archive" className="size-4" />Archive</button>}
      </> : undefined}>
      {sourceId ? <div className="space-y-6">
        {detail.isError ? <ErrorState message={apiErrorMessage(detail.error)} onRetry={() => void detail.refetch()} /> : null}
        <section aria-label="Processing" className="space-y-3">
          <div className="flex flex-wrap items-center gap-2"><StatusChip status={status} stage={stage} />{source ? <span className="text-xs text-muted">Updated {updatedLabel(Date.parse(source.updatedAt) || 0)}</span> : null}</div>
          <p role="status" aria-live="polite" className="rounded-xl bg-surface p-3 text-sm leading-6 text-muted">{processingSummary(status, processing.data?.version ?? latest)}</p>
          {searchable ? <IndexStatusView status={index.data} subject="source" loading={index.isPending} /> : null}
          {processing.data?.canRetry || processing.data?.canCancel ? <div className="flex flex-wrap gap-2">
            {processing.data.canRetry ? <button type="button" disabled={actions.retry.isPending} onClick={() => actions.retry.mutate(sourceId)} className={buttonSecondary}><AppIcon name="restore" className="size-4" />{actions.retry.isPending ? 'Retrying…' : 'Retry processing'}</button> : null}
            {processing.data.canCancel ? <button type="button" disabled={actions.cancel.isPending} onClick={() => actions.cancel.mutate(sourceId)} className={buttonQuiet}><AppIcon name="close" className="size-4" />Cancel processing</button> : null}
          </div> : null}
          {retryError || cancelError ? <p role="alert" className="text-sm text-muted">{retryError ?? cancelError}</p> : null}
          {fileAssetId ? <div><button type="button" onClick={() => void openFile()} className={buttonSecondary}><AppIcon name="file" className="size-4" />Open file</button>{fileError ? <p role="alert" className="mt-2 text-sm text-danger">{fileError}</p> : null}</div> : null}
        </section>

        {source ? <>
          <label className={labelClass}>Title
            <input key={`${source.id}:${source.title}`} defaultValue={source.title} maxLength={300} disabled={archived}
              onBlur={(event) => { const next = event.target.value.trim(); if (next && next !== source.title) actions.update.mutate({ sourceId: source.id, body: { title: next } }); else event.target.value = source.title }}
              onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} className={inputClass} />
          </label>
          <label className={labelClass}>Sensitivity
            <select value={source.sensitivity} disabled={archived || actions.update.isPending} onChange={(event) => actions.update.mutate({ sourceId: source.id, body: { sensitivity: event.target.value as SourceRecord['sensitivity'] } })} className={inputClass}>
              {sensitivities.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            <span className="mt-1.5 block text-xs font-normal leading-5 text-muted">{sensitivities.find((item) => item.value === source.sensitivity)?.help} Restricted material is never sent to external AI.</span>
          </label>
        </> : <ListSkeleton rows={2} label="Loading source" />}

        <section aria-labelledby="source-spaces">
          <h3 id="source-spaces" className={labelClass}>Used in</h3>
          {usedIn.length ? <ul className="mt-2 space-y-1">{usedIn.map((space) => <li key={space.id}><button type="button" onClick={() => { onClose(); navigate(`space:${space.id}`) }} className="flex min-h-11 w-full min-w-0 items-center gap-2 rounded-lg px-1 text-left text-sm text-foreground hover:bg-surface"><SpaceGlyph icon={space.icon} size="sm" /><span className="truncate">{space.name}</span></button></li>)}</ul>
            : <p className="mt-1.5 text-sm text-muted">Not linked to any Space yet. Link it from a Space’s Sources tab.</p>}
        </section>

        {source?.versions.length ? <section aria-labelledby="source-versions">
          <h3 id="source-versions" className={labelClass}>Versions</h3>
          <ol className="mt-2 divide-y divide-default border-y border-default">
            {source.versions.map((version) => {
              const facts = provenanceFacts(version)
              return <li key={version.id} className="py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2"><span className="font-medium text-foreground">Version {version.versionNumber}</span><StatusChip status={version.status} stage={version.processingStage} /></div>
                {version.provenance?.documentTitle ? <p className="mt-1 break-words text-xs text-muted">Titled “{version.provenance.documentTitle}”</p> : null}
                {facts.length ? <p className="mt-1 text-xs text-muted">{facts.join(' · ')}</p> : null}
                {version.status === 'PROCESSING' && stageLabel(version.processingStage) ? <p className="mt-1 text-xs text-muted">{stageLabel(version.processingStage)}…</p> : null}
              </li>
            })}
          </ol>
        </section> : null}
      </div> : null}
    </SidePanel>
    {sourceId ? <ConfirmDialog open={confirmDelete} onClose={() => setConfirmDelete(false)} destructive confirmLabel="Delete source" title={`Delete “${title}”?`}
      body="It’s removed from every Space and note that uses it. The original file stays available in any note that shows it."
      onConfirm={() => actions.remove.mutate(sourceId, { onSuccess: onClose })} /> : null}
  </>
}
