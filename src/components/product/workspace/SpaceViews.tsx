'use client'

import { useState } from 'react'
import { AppIcon } from '../AppIcon'
import type { Navigate, NoteRecord, SourceRecord, SpaceRecord, SpaceSourceLink } from './model'
import { priorityLabel, priorityPresets, sourceKindMeta } from './model'
import type { PreviewStore } from './usePreviewStore'
import { PickerDialog, SpaceFormDialog } from './dialogs'
import { ActionMenu, ConfirmDialog, EmptyState, PageFrame, PageHeading, SpaceGlyph, StatusChip, Tabs, buttonPrimary, buttonQuiet, buttonSecondary } from './ui'

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
export function updatedLabel(time: number) {
  const minutes = Math.round((time - Date.now()) / 60000)
  if (Math.abs(minutes) < 60) return relative.format(minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 24) return relative.format(hours, 'hour')
  return relative.format(Math.round(hours / 24), 'day')
}

export function SpacesView({ spaces, notes, navigate, onNewSpace }: { spaces: SpaceRecord[]; notes: NoteRecord[]; navigate: Navigate; onNewSpace: () => void }) {
  const [status, setStatus] = useState<'ACTIVE' | 'ARCHIVED'>('ACTIVE')
  const listed = spaces.filter((space) => space.status === status)
  return <PageFrame wide>
    <PageHeading title="Spaces" subtitle="Each Space gathers the notes and Library sources for one course, topic or project." actions={<button type="button" onClick={onNewSpace} className={buttonPrimary}><AppIcon name="plus" className="size-4" />New Space</button>} />
    <div className="mt-8">
      <Tabs label="Space status" value={status} onChange={setStatus} tabs={[{ id: 'ACTIVE', label: 'Active', count: spaces.filter((s) => s.status === 'ACTIVE').length }, { id: 'ARCHIVED', label: 'Archived', count: spaces.filter((s) => s.status === 'ARCHIVED').length }]} />
    </div>
    <div className="mt-6">
      {listed.length ? <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {listed.map((space) => {
          const count = notes.filter((note) => note.spaceId === space.id).length
          return <li key={space.id}><button type="button" onClick={() => navigate(`space:${space.id}`)} className="flex h-full min-h-[8.5rem] w-full flex-col gap-3 rounded-[1.15rem] border border-default bg-raised p-5 text-left transition-colors hover:border-strong">
            <span className="flex items-center gap-3"><SpaceGlyph icon={space.icon} /><span className="min-w-0 truncate font-display text-xl text-foreground">{space.name}</span></span>
            {space.description ? <span className="line-clamp-2 text-sm leading-6 text-muted">{space.description}</span> : null}
            <span className="mt-auto text-xs text-subtle">{count} {count === 1 ? 'note' : 'notes'} · Updated {updatedLabel(space.updatedAt)}</span>
          </button></li>
        })}
      </ul> : status === 'ACTIVE'
        ? <EmptyState icon="space" title="No Spaces yet" body="Create a Space for a course, topic or project, then add notes and Library sources to it." action={<button type="button" onClick={onNewSpace} className={buttonPrimary}><AppIcon name="plus" className="size-4" />New Space</button>} />
        : <EmptyState icon="archive" title="No archived Spaces" body="Archived Spaces stay readable and can be restored any time." />}
    </div>
  </PageFrame>
}

type SpaceViewProps = {
  space: SpaceRecord
  notes: NoteRecord[]
  sources: SourceRecord[]
  links: SpaceSourceLink[]
  store: PreviewStore
  navigate: Navigate
  onCreateNote: (spaceId: string) => void
  onMoveNote: (noteId: string, spaceId: string | null) => void
  onAddSource: (spaceId: string) => void
}

export function SpaceView({ space, notes, sources, links, store, navigate, onCreateNote, onMoveNote, onAddSource }: SpaceViewProps) {
  const [tab, setTab] = useState<'notes' | 'sources'>('notes')
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [picking, setPicking] = useState<'note' | 'source' | null>(null)
  const archived = space.status === 'ARCHIVED'
  const spaceNotes = notes.filter((note) => note.spaceId === space.id).sort((a, b) => (a.id === space.homeNoteId ? -1 : b.id === space.homeNoteId ? 1 : b.updatedAt - a.updatedAt))
  const spaceLinks = links.filter((link) => link.spaceId === space.id)
  const linkedSources = spaceLinks.map((link) => ({ link, source: sources.find((source) => source.id === link.sourceId) })).filter((entry): entry is { link: SpaceSourceLink; source: SourceRecord } => Boolean(entry.source))
  const otherNotes = notes.filter((note) => note.spaceId !== space.id)
  const unlinkedSources = sources.filter((source) => source.status !== 'ARCHIVED' && !spaceLinks.some((link) => link.sourceId === source.id))

  return <PageFrame wide>
    {archived ? <div role="status" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-default bg-surface px-4 py-3 text-sm text-muted">
      <span className="flex items-center gap-2"><AppIcon name="archive" className="size-4" />This Space is archived. Restore it to make changes.</span>
      <button type="button" onClick={() => store.updateSpace(space.id, { status: 'ACTIVE' })} className={buttonSecondary}><AppIcon name="restore" className="size-4" />Restore</button>
    </div> : null}
    <PageHeading eyebrow="Space" icon={<SpaceGlyph icon={space.icon} size="lg" />} title={space.name} subtitle={space.description ?? undefined}
      actions={<>
        {archived ? null : <button type="button" onClick={() => onCreateNote(space.id)} className={buttonPrimary}><AppIcon name="plus" className="size-4" />New note</button>}
        <ActionMenu label="Space actions" items={[
          { label: 'Edit details', icon: 'edit', onSelect: () => setEditing(true), disabled: archived },
          archived ? { label: 'Restore Space', icon: 'restore', onSelect: () => store.updateSpace(space.id, { status: 'ACTIVE' }) } : { label: 'Archive Space', icon: 'archive', onSelect: () => store.updateSpace(space.id, { status: 'ARCHIVED' }) },
          { label: 'Delete Space', icon: 'trash', destructive: true, onSelect: () => setConfirmDelete(true) },
        ]} />
      </>} />

    <div className="mt-8"><Tabs label="Space contents" value={tab} onChange={setTab} tabs={[{ id: 'notes', label: 'Notes', count: spaceNotes.length }, { id: 'sources', label: 'Sources', count: linkedSources.length }]} /></div>

    {tab === 'notes' ? <section className="mt-5" aria-label="Notes in this Space">
      {archived ? null : <div className="mb-3 flex flex-wrap justify-end gap-2"><button type="button" onClick={() => setPicking('note')} className={buttonSecondary}><AppIcon name="plus" className="size-4" />Add existing note</button></div>}
      {spaceNotes.length ? <ul className="divide-y divide-default border-y border-default">
        {spaceNotes.map((note) => {
          const home = note.id === space.homeNoteId
          return <li key={note.id} className="flex items-center gap-2">
            <button type="button" onClick={() => navigate(`note:${note.id}`)} className="flex min-h-[4.5rem] min-w-0 flex-1 items-center gap-3 py-3 text-left">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface text-muted"><AppIcon name={home ? 'pin' : 'document'} className="size-4" /></span>
              <span className="min-w-0 flex-1"><span className="flex items-center gap-2"><span className="truncate text-sm font-medium text-foreground">{note.title || 'Untitled note'}</span>{home ? <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-xs text-muted">Home</span> : null}</span><span className="mt-0.5 block truncate text-xs text-muted">Updated {updatedLabel(note.updatedAt)}</span></span>
            </button>
            {archived ? null : <ActionMenu label={`Actions for ${note.title || 'note'}`} items={[
              home ? { label: 'Clear home note', icon: 'pin', onSelect: () => store.updateSpace(space.id, { homeNoteId: null }) } : { label: 'Set as home note', icon: 'pin', onSelect: () => store.updateSpace(space.id, { homeNoteId: note.id }) },
              { label: 'Remove from Space', icon: 'unlink', onSelect: () => { onMoveNote(note.id, null); if (home) store.updateSpace(space.id, { homeNoteId: null }) } },
            ]} />}
          </li>
        })}
      </ul> : <EmptyState icon="document" title="No notes in this Space" body="Write a new note here, or move an existing note in." action={archived ? undefined : <><button type="button" onClick={() => onCreateNote(space.id)} className={buttonPrimary}>New note</button><button type="button" onClick={() => setPicking('note')} className={buttonSecondary}>Add existing note</button></>} />}
    </section> : <section className="mt-5" aria-label="Sources linked to this Space">
      {archived ? null : <div className="mb-3 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={() => onAddSource(space.id)} className={buttonSecondary}><AppIcon name="upload" className="size-4" />Add new source</button>
        <button type="button" onClick={() => setPicking('source')} className={buttonSecondary}><AppIcon name="link" className="size-4" />Link from Library</button>
      </div>}
      {linkedSources.length ? <ul className="divide-y divide-default border-y border-default">
        {linkedSources.map(({ link, source }) => {
          const meta = sourceKindMeta(source.kind)
          return <li key={source.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface text-muted"><AppIcon name={meta.icon} className="size-4" /></span>
            <span className="min-w-0 flex-1 basis-48"><span className="block truncate text-sm font-medium text-foreground">{source.title}</span><span className="mt-0.5 flex items-center gap-2 text-xs text-muted">{meta.label}<StatusChip status={source.status} /></span></span>
            <label className="flex min-h-11 items-center gap-2 text-xs text-muted">
              <input type="checkbox" disabled={archived} checked={link.enabledByDefault} onChange={(event) => store.updateLink(space.id, source.id, { enabledByDefault: event.target.checked })} className="size-5 accent-[var(--ui-button)]" />Use by default
            </label>
            <label className="flex min-h-11 items-center gap-2 text-xs text-muted">Priority
              <select disabled={archived} value={priorityPresets.find((preset) => preset.label === priorityLabel(link.priority))?.value ?? 0} onChange={(event) => store.updateLink(space.id, source.id, { priority: Number(event.target.value) })} className="min-h-9 rounded-lg border border-default bg-surface px-2 text-sm text-foreground">
                {priorityPresets.map((preset) => <option key={preset.value} value={preset.value}>{preset.label}</option>)}
              </select>
            </label>
            {archived ? null : <button type="button" onClick={() => store.unlinkSource(space.id, source.id)} className={buttonQuiet} aria-label={`Unlink ${source.title}`}><AppIcon name="unlink" className="size-4" />Unlink</button>}
          </li>
        })}
      </ul> : <EmptyState icon="library" title="No sources linked" body="Link Library sources so this Space’s notes and questions can draw on them. Linking never copies the file." action={archived ? undefined : <><button type="button" onClick={() => onAddSource(space.id)} className={buttonPrimary}>Add new source</button><button type="button" onClick={() => setPicking('source')} className={buttonSecondary}>Link from Library</button></>} />}
    </section>}

    <SpaceFormDialog open={editing} onClose={() => setEditing(false)} initial={space} onSubmit={(draft) => store.updateSpace(space.id, { name: draft.name.trim(), description: draft.description.trim() || null, icon: draft.icon.trim() || null })} />
    <ConfirmDialog open={confirmDelete} onClose={() => setConfirmDelete(false)} destructive confirmLabel="Delete Space" title={`Delete “${space.name}”?`}
      body="Its notes become standalone and its Library sources stay in your Library. Nothing else is deleted."
      onConfirm={() => { spaceNotes.forEach((note) => onMoveNote(note.id, null)); store.deleteSpace(space.id); navigate('spaces') }} />
    <PickerDialog open={picking === 'note'} onClose={() => setPicking(null)} title="Add a note to this Space" description="A note belongs to one Space. Notes from another Space move here." items={otherNotes} empty="All your notes are already in this Space."
      render={(note) => <><AppIcon name="document" className="size-4 shrink-0 text-muted" /><span className="min-w-0 flex-1 truncate text-sm text-foreground">{note.title || 'Untitled note'}</span>{note.spaceId ? <span className="shrink-0 text-xs text-subtle">Moves here</span> : null}</>}
      onPick={(note) => onMoveNote(note.id, space.id)} />
    <PickerDialog open={picking === 'source'} onClose={() => setPicking(null)} title="Link a Library source" description="The source stays in your Library and can be linked to other Spaces too." items={unlinkedSources} empty="Every Library source is already linked here."
      render={(source) => <><AppIcon name={sourceKindMeta(source.kind).icon} className="size-4 shrink-0 text-muted" /><span className="min-w-0 flex-1 truncate text-sm text-foreground">{source.title}</span><StatusChip status={source.status} /></>}
      onPick={(source) => store.linkSource(space.id, source.id)} />
  </PageFrame>
}
