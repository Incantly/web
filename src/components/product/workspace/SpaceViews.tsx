'use client'

import { useState } from 'react'
import { AppIcon } from '../AppIcon'
import { apiErrorMessage } from '../../../lib/api/errors'
import type { SpaceSourceLinkDto } from '../../../lib/api/spaces'
import type { SourceRecord, SourceStatus, SpaceRecord } from './model'
import { priorityLabel, priorityPresets, sourceKindMeta } from './model'
import { PickerDialog, SpaceFormDialog, type SpaceDraft } from './dialogs'
import { updateSpaceBody, useSpaceActions, useSpaceNotes, useSpaceSources } from './useSpaces'
import { useCurrentUser } from '../SessionGate'
import { useLibrary } from '@/hooks/use-library'
import { useNavigation } from '@/hooks/use-navigation'
import { useNotes } from '@/hooks/use-notes'
import { useSpaces } from '@/hooks/use-spaces'
import { useWorkspaceUI } from '@/hooks/use-workspace-ui'
import { ActionMenu, ConfirmDialog, EmptyState, ErrorState, ListSkeleton, PageFrame, PageHeading, SpaceGlyph, StatusChip, Tabs, buttonPrimary, buttonQuiet, buttonSecondary } from './ui'

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
export function updatedLabel(time: number) {
  const minutes = Math.round((time - Date.now()) / 60000)
  if (Math.abs(minutes) < 60) return relative.format(minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 24) return relative.format(hours, 'hour')
  return relative.format(Math.round(hours / 24), 'day')
}

export function SpacesView() {
  const { spaces, status: listStatus } = useSpaces()
  const { navigate } = useNavigation()
  const { openDialog } = useWorkspaceUI()
  const onNewSpace = () => openDialog('space')
  const [status, setStatus] = useState<'ACTIVE' | 'ARCHIVED'>('ACTIVE')
  const listed = spaces.filter((space) => space.status === status)
  return <PageFrame wide>
    <PageHeading title="Spaces" subtitle="Each Space gathers the notes and Library sources for one course, topic or project." actions={<button type="button" onClick={onNewSpace} className={buttonPrimary}><AppIcon name="plus" className="size-4" />New Space</button>} />
    <div className="mt-8">
      <Tabs label="Space status" value={status} onChange={setStatus} tabs={[{ id: 'ACTIVE', label: 'Active', count: spaces.filter((s) => s.status === 'ACTIVE').length }, { id: 'ARCHIVED', label: 'Archived', count: spaces.filter((s) => s.status === 'ARCHIVED').length }]} />
    </div>
    <div className="mt-6">
      {listStatus.loading ? <ListSkeleton rows={3} label="Loading Spaces" />
        : listStatus.error ? <ErrorState message={apiErrorMessage(listStatus.error)} onRetry={listStatus.retry} />
        : listed.length ? <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {listed.map((space) => <li key={space.id} className="min-w-0"><button type="button" onClick={() => navigate(`space:${space.id}`)} className="flex h-full min-h-[8.5rem] w-full min-w-0 flex-col gap-3 rounded-[1.15rem] border border-default bg-raised p-5 text-left transition-colors hover:border-strong">
          <span className="flex min-w-0 items-center gap-3"><SpaceGlyph icon={space.icon} /><span className="min-w-0 truncate font-display text-xl text-foreground">{space.name}</span></span>
          {space.description ? <span className="line-clamp-2 text-sm leading-6 text-muted">{space.description}</span> : null}
          <span className="mt-auto text-xs text-subtle">Updated {updatedLabel(space.updatedAt)}</span>
        </button></li>)}
      </ul> : status === 'ACTIVE'
        ? <EmptyState icon="space" title="No Spaces yet" body="Create a Space for a course, topic or project, then add notes and Library sources to it." action={<button type="button" onClick={onNewSpace} className={buttonPrimary}><AppIcon name="plus" className="size-4" />New Space</button>} />
        : <EmptyState icon="archive" title="No archived Spaces" body="Archived Spaces stay readable and can be restored any time." />}
    </div>
  </PageFrame>
}


/** One Space's page. `space` is the Space being shown; everything else comes from the feature contexts. */
export function SpaceView({ space }: { space: SpaceRecord }) {
  const userId = useCurrentUser().id
  const { notes, createNote } = useNotes()
  const { sources } = useLibrary()
  const { navigate, openNote: onOpenNote } = useNavigation()
  const { openDialog } = useWorkspaceUI()
  const onCreateNote = (spaceId: string) => createNote({ spaceId })
  // The Add to Library dialog preselects the Space being shown.
  const onAddSource = () => openDialog('source')
  const [tab, setTab] = useState<'notes' | 'sources'>('notes')
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [picking, setPicking] = useState<'note' | 'source' | null>(null)
  const actions = useSpaceActions(userId)
  const spaceNotes = useSpaceNotes(space.id)
  const spaceSources = useSpaceSources(space.id)
  const archived = space.status === 'ARCHIVED'
  const busy = actions.archive.isPending || actions.restore.isPending || actions.remove.isPending

  const listedNotes = spaceNotes.notes.slice().sort((a, b) => (a.id === space.homeNoteId ? -1 : b.id === space.homeNoteId ? 1 : Date.parse(b.updatedAt) - Date.parse(a.updatedAt)))
  const links = spaceSources.data?.items ?? []
  const linkLimit = spaceSources.data?.limit ?? 200
  const atLinkLimit = links.length >= linkLimit
  const inSpace = new Set(spaceNotes.notes.map((note) => note.id))
  const otherNotes = notes.filter((note) => !inSpace.has(note.id))
  const unlinkedSources = sources.filter((source) => source.status !== 'ARCHIVED' && !links.some((link) => link.sourceId === source.id))

  async function save(draft: SpaceDraft) {
    const body = updateSpaceBody(space, draft)
    if (Object.keys(body).length) await actions.update.mutateAsync({ spaceId: space.id, body })
  }
  const restoreButton = <button type="button" disabled={busy} onClick={() => actions.restore.mutate(space.id)} className={buttonSecondary}><AppIcon name="restore" className="size-4" />Restore</button>

  return <PageFrame wide>
    {archived ? <div role="status" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-default bg-surface px-4 py-3 text-sm text-muted">
      <span className="flex items-center gap-2"><AppIcon name="archive" className="size-4" />This Space is archived and read-only. Restore it to make changes.</span>
      {restoreButton}
    </div> : null}
    <PageHeading eyebrow="Space" icon={<SpaceGlyph icon={space.icon} size="lg" />} title={space.name} subtitle={space.description ?? undefined}
      actions={<>
        {archived ? null : <button type="button" onClick={() => onCreateNote(space.id)} className={buttonPrimary}><AppIcon name="plus" className="size-4" />New note</button>}
        <ActionMenu label="Space actions" items={[
          ...(archived ? [] : [{ label: 'Edit details', icon: 'edit' as const, onSelect: () => setEditing(true) }]),
          archived ? { label: 'Restore Space', icon: 'restore', onSelect: () => actions.restore.mutate(space.id), disabled: busy } : { label: 'Archive Space', icon: 'archive', onSelect: () => actions.archive.mutate(space.id), disabled: busy },
          { label: 'Delete Space', icon: 'trash', destructive: true, onSelect: () => setConfirmDelete(true), disabled: busy || space.retentionHold, hint: space.retentionHold ? 'Retention hold' : undefined },
        ]} />
      </>} />

    <div className="mt-8"><Tabs label="Space contents" value={tab} onChange={setTab} tabs={[{ id: 'notes', label: 'Notes', count: spaceNotes.isPending ? undefined : spaceNotes.notes.length }, { id: 'sources', label: 'Sources', count: spaceSources.isPending ? undefined : links.length }]} /></div>

    {tab === 'notes' ? <section className="mt-5" aria-label="Notes in this Space">
      {archived || spaceNotes.isPending || spaceNotes.isError || !listedNotes.length ? null : <div className="mb-3 flex flex-wrap justify-end gap-2"><button type="button" onClick={() => setPicking('note')} className={buttonSecondary}><AppIcon name="plus" className="size-4" />Add existing note</button></div>}
      {spaceNotes.isPending ? <ListSkeleton rows={3} label="Loading notes" />
        : spaceNotes.isError ? <ErrorState message={apiErrorMessage(spaceNotes.error)} onRetry={() => void spaceNotes.refetch()} />
        : listedNotes.length ? <><ul className="divide-y divide-default border-y border-default">
        {listedNotes.map((note) => {
          const home = note.id === space.homeNoteId
          const noteArchived = note.status === 'ARCHIVED'
          return <li key={note.id} className="flex items-center gap-2">
            <button type="button" onClick={() => onOpenNote(note.id, space.id)} className="flex min-h-[4.5rem] min-w-0 flex-1 items-center gap-3 py-3 text-left">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface text-muted"><AppIcon name={home ? 'pin' : 'document'} className="size-4" /></span>
              <span className="min-w-0 flex-1"><span className="flex min-w-0 items-center gap-2"><span className="truncate text-sm font-medium text-foreground">{note.title || 'Untitled note'}</span>{home ? <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-xs text-muted">Home</span> : null}{noteArchived ? <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-xs text-subtle">Archived</span> : null}</span><span className="mt-0.5 block truncate text-xs text-muted">Updated {updatedLabel(Date.parse(note.updatedAt) || 0)}</span></span>
            </button>
            {archived ? null : <ActionMenu label={`Actions for ${note.title || 'note'}`} items={[
              home ? { label: 'Clear home note', icon: 'pin', onSelect: () => actions.clearHome.mutate(space.id) }
                : { label: 'Set as home note', icon: 'pin', onSelect: () => actions.setHome.mutate({ spaceId: space.id, noteId: note.id }), disabled: noteArchived, hint: noteArchived ? 'Archived' : undefined },
              { label: 'Remove from Space', icon: 'unlink', onSelect: () => actions.removeNote.mutate({ spaceId: space.id, noteId: note.id }) },
            ]} />}
          </li>
        })}
      </ul>
        {spaceNotes.hasNextPage ? <div className="mt-4 flex justify-center"><button type="button" onClick={() => void spaceNotes.fetchNextPage()} disabled={spaceNotes.isFetchingNextPage} className={buttonSecondary}>{spaceNotes.isFetchingNextPage ? 'Loading…' : 'Load more notes'}</button></div> : null}
      </> : <EmptyState icon="document" title="No notes in this Space" body={archived ? 'This archived Space has no notes.' : 'Write a new note here, or move an existing note in.'} action={archived ? undefined : <><button type="button" onClick={() => onCreateNote(space.id)} className={buttonPrimary}>New note</button><button type="button" onClick={() => setPicking('note')} className={buttonSecondary}>Add existing note</button></>} />}
    </section> : <section className="mt-5" aria-label="Sources linked to this Space">
      {archived || spaceSources.isPending || spaceSources.isError || !links.length ? null : <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
        {atLinkLimit ? <span role="status" className="mr-auto text-sm text-muted">This Space has the maximum of {linkLimit} linked sources.</span> : null}
        <button type="button" onClick={() => onAddSource()} disabled={atLinkLimit} className={buttonSecondary}><AppIcon name="upload" className="size-4" />Add new source</button>
        <button type="button" onClick={() => setPicking('source')} disabled={atLinkLimit} className={buttonSecondary}><AppIcon name="link" className="size-4" />Link from Library</button>
      </div>}
      {spaceSources.isPending ? <ListSkeleton rows={3} label="Loading sources" />
        : spaceSources.isError ? <ErrorState message={apiErrorMessage(spaceSources.error)} onRetry={() => void spaceSources.refetch()} />
        : links.length ? <ul className="divide-y divide-default border-y border-default">
        {links.map((link) => <LinkedSourceRow key={link.sourceId} link={link} archived={archived}
          onToggle={(enabledByDefault) => actions.updateLink.mutate({ spaceId: space.id, sourceId: link.sourceId, body: { enabledByDefault } })}
          onPriority={(priority) => actions.updateLink.mutate({ spaceId: space.id, sourceId: link.sourceId, body: { priority } })}
          onUnlink={() => actions.unlink.mutate({ spaceId: space.id, sourceId: link.sourceId })} />)}
      </ul> : <EmptyState icon="library" title="No sources linked" body="Link Library sources so this Space’s notes and questions can draw on them. Linking never copies the file." action={archived ? undefined : <><button type="button" onClick={() => onAddSource()} className={buttonPrimary}>Add new source</button><button type="button" onClick={() => setPicking('source')} className={buttonSecondary}>Link from Library</button></>} />}
    </section>}

    <SpaceFormDialog open={editing} onClose={() => setEditing(false)} initial={space} onSubmit={save} />
    <ConfirmDialog open={confirmDelete} onClose={() => setConfirmDelete(false)} destructive confirmLabel="Delete Space" title={`Delete “${space.name}”?`}
      body="Notes become standalone; nothing else is deleted. Its Library sources stay in your Library."
      onConfirm={() => actions.remove.mutate(space.id, { onSuccess: () => navigate('spaces') })} />
    <PickerDialog open={picking === 'note'} onClose={() => setPicking(null)} title="Add a note to this Space" description="A note belongs to one Space. A note from another Space moves here." items={otherNotes} empty="All your notes are already in this Space."
      render={(note) => <><AppIcon name="document" className="size-4 shrink-0 text-muted" /><span className="min-w-0 flex-1 truncate text-sm text-foreground">{note.title || 'Untitled note'}</span></>}
      onPick={(note) => actions.addNote.mutate({ spaceId: space.id, noteId: note.id })} />
    <PickerDialog open={picking === 'source'} onClose={() => setPicking(null)} title="Link a Library source" description="The source stays in your Library and can be linked to other Spaces too." items={unlinkedSources} empty="Every Library source is already linked here."
      render={(source) => <><AppIcon name={sourceKindMeta(source.kind).icon} className="size-4 shrink-0 text-muted" /><span className="min-w-0 flex-1 truncate text-sm text-foreground">{source.title}</span><StatusChip status={source.status} stage={source.stage} /></>}
      onPick={(source) => actions.link.mutate({ spaceId: space.id, sourceId: source.id })} />
  </PageFrame>
}

function LinkedSourceRow({ link, archived, onToggle, onPriority, onUnlink }: { link: SpaceSourceLinkDto; archived: boolean; onToggle: (value: boolean) => void; onPriority: (value: number) => void; onUnlink: () => void }) {
  const meta = sourceKindMeta(link.source.kind as SourceRecord['kind'])
  const preset = priorityPresets.find((item) => item.value === link.priority)
  return <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface text-muted"><AppIcon name={meta.icon} className="size-4" /></span>
    <span className="min-w-0 flex-1 basis-48"><span className="block truncate text-sm font-medium text-foreground">{link.source.title}</span><span className="mt-0.5 flex items-center gap-2 text-xs text-muted">{meta.label}<StatusChip status={link.source.status as SourceStatus} /></span></span>
    <label className="flex min-h-11 items-center gap-2 text-xs text-muted">
      <input type="checkbox" disabled={archived} checked={link.enabledByDefault} onChange={(event) => onToggle(event.target.checked)} className="size-5 accent-[var(--ui-button)]" />Use by default
    </label>
    <label className="flex min-h-11 items-center gap-2 text-xs text-muted">Priority
      <select disabled={archived} value={preset ? String(preset.value) : 'custom'} onChange={(event) => onPriority(Number(event.target.value))} className="min-h-11 rounded-lg border border-default bg-surface px-2 text-sm text-foreground" title={`Exact value ${link.priority} (−100 to 100)`}>
        {preset ? null : <option value="custom" disabled>{priorityLabel(link.priority)} ({link.priority})</option>}
        {priorityPresets.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
      </select>
    </label>
    {archived ? null : <button type="button" onClick={onUnlink} className={buttonQuiet} aria-label={`Unlink ${link.source.title}`}><AppIcon name="unlink" className="size-4" />Unlink</button>}
  </li>
}
