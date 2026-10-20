'use client'

import { useMemo, type ReactNode } from 'react'
import { AppIcon, type IconName } from '../AppIcon'
import { SignOutButton } from '../SignOutButton'
import { useCurrentUser } from '../SessionGate'
import { displayName, firstName, greeting } from '../../../lib/identity'
import type { Navigate, NoteRecord, SourceRecord, SpaceRecord } from './model'
import { sourceKindMeta } from './model'
import { updatedLabel } from './SpaceViews'
import { EmptyState, PageFrame, PageHeading, SpaceGlyph, StatusChip, buttonPrimary } from './ui'

function Row({ icon, leading, title, meta, trailing, onClick }: { icon?: IconName; leading?: ReactNode; title: string; meta?: ReactNode; trailing?: ReactNode; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="flex min-h-[4.25rem] w-full min-w-0 items-center gap-3 py-3 text-left">
    {leading ?? <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface text-muted"><AppIcon name={icon ?? 'document'} className="size-4" /></span>}
    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-foreground">{title}</span>{meta ? <span className="mt-0.5 block truncate text-xs text-muted">{meta}</span> : null}</span>
    {trailing}
    <AppIcon name="chevron" className="size-4 shrink-0 text-subtle" />
  </button>
}

function spaceName(spaces: SpaceRecord[], id: string | null) {
  return id ? spaces.find((space) => space.id === id)?.name : undefined
}

export function HomeView({ notes, spaces, sources, navigate, onNewNote }: { notes: NoteRecord[]; spaces: SpaceRecord[]; sources: SourceRecord[]; navigate: Navigate; onNewNote: () => void }) {
  const user = useCurrentUser()
  const recent = notes.slice().sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5)
  const cards: { label: string; count: number; icon: IconName; to: 'notes' | 'spaces' | 'library' }[] = [
    { label: 'Notes', count: notes.length, icon: 'document', to: 'notes' },
    { label: 'Spaces', count: spaces.filter((space) => space.status === 'ACTIVE').length, icon: 'space', to: 'spaces' },
    { label: 'Library sources', count: sources.filter((source) => source.status !== 'ARCHIVED').length, icon: 'library', to: 'library' },
  ]
  return <PageFrame>
    <PageHeading title={`${greeting()}, ${firstName(user)}.`} subtitle="Pick up where you left off, or start something new." />
    <section className="mt-8 grid gap-3 sm:grid-cols-3" aria-label="Your work at a glance">
      {cards.map((card) => <button type="button" key={card.label} onClick={() => navigate(card.to)} className="flex min-h-[7.5rem] flex-col justify-between rounded-[1.15rem] border border-default bg-raised p-5 text-left transition-colors hover:border-strong">
        <span className="flex items-center justify-between text-muted"><AppIcon name={card.icon} className="size-5" /><AppIcon name="chevron" className="size-4 text-subtle" /></span>
        <span><span className="block font-display text-[2.25rem] leading-none text-foreground">{card.count}</span><span className="mt-1 block text-sm text-muted">{card.label}</span></span>
      </button>)}
    </section>
    <section className="mt-10" aria-labelledby="recent-heading">
      <div className="flex items-center justify-between gap-4"><h2 id="recent-heading" className="font-display text-[1.6rem] font-normal tracking-[-0.03em] text-foreground">Recent notes</h2>{notes.length ? <button type="button" onClick={() => navigate('notes')} className="min-h-11 text-sm font-medium text-button hover:underline">See all</button> : null}</div>
      {recent.length ? <div className="mt-2 divide-y divide-default border-y border-default">
        {recent.map((note) => <Row key={note.id} title={note.title || 'Untitled note'} meta={[spaceName(spaces, note.spaceId), `Updated ${updatedLabel(note.updatedAt)}`].filter(Boolean).join(' · ')} onClick={() => navigate(`note:${note.id}`)} />)}
      </div> : <div className="mt-4"><EmptyState icon="document" title="No notes yet" body="Your first note can be a question, a lecture outline or a thought worth keeping." action={<button type="button" onClick={onNewNote} className={buttonPrimary}>Write a note</button>} /></div>}
    </section>
  </PageFrame>
}

export function NotesView({ notes, spaces, navigate, onNewNote }: { notes: NoteRecord[]; spaces: SpaceRecord[]; navigate: Navigate; onNewNote: () => void }) {
  const sorted = notes.slice().sort((a, b) => b.updatedAt - a.updatedAt)
  return <PageFrame>
    <PageHeading title="Notes" subtitle="All your notes, newest first. A note can live in one Space or stand on its own."
      actions={<button type="button" onClick={onNewNote} className={buttonPrimary}><AppIcon name="plus" className="size-4" />New note</button>} />
    <div className="mt-8">
      {sorted.length ? <div className="divide-y divide-default border-y border-default">
        {sorted.map((note) => {
          const space = spaces.find((item) => item.id === note.spaceId)
          return <Row key={note.id} title={note.title || 'Untitled note'} meta={`Updated ${updatedLabel(note.updatedAt)}`} onClick={() => navigate(`note:${note.id}`)}
            trailing={space ? <span className="hidden max-w-[10rem] shrink-0 items-center gap-1.5 truncate rounded-full bg-surface px-2 py-0.5 text-xs text-muted sm:inline-flex"><SpaceGlyph icon={space.icon} size="sm" /><span className="truncate">{space.name}</span></span> : null} />
        })}
      </div> : <EmptyState icon="document" title="No notes yet" body="Write your first note, then organize it into a Space whenever you like." action={<button type="button" onClick={onNewNote} className={buttonPrimary}>New note</button>} />}
    </div>
  </PageFrame>
}

export function SearchView({ notes, spaces, sources, query, setQuery, navigate }: { notes: NoteRecord[]; spaces: SpaceRecord[]; sources: SourceRecord[]; query: string; setQuery: (value: string) => void; navigate: Navigate }) {
  const term = query.trim().toLowerCase()
  const results = useMemo(() => (term ? {
    notes: notes.filter((note) => note.title.toLowerCase().includes(term)),
    spaces: spaces.filter((space) => space.name.toLowerCase().includes(term)),
    sources: sources.filter((source) => source.title.toLowerCase().includes(term)),
  } : null), [notes, spaces, sources, term])
  const total = results ? results.notes.length + results.spaces.length + results.sources.length : 0

  return <PageFrame>
    <PageHeading title="Search" subtitle="Find notes, Spaces and Library sources by title." />
    <label className="mt-8 flex min-h-14 items-center gap-3 rounded-xl border border-default bg-raised px-4 focus-within:border-strong">
      <AppIcon name="search" className="size-5 text-muted" />
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by title" aria-label="Search by title" className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-subtle" />
    </label>
    <div className="mt-6 space-y-8" aria-live="polite">
      {results && total === 0 ? <p className="py-10 text-center text-sm text-muted">No titles match “{query.trim()}”.</p> : null}
      {results?.spaces.length ? <section aria-label="Spaces"><h2 className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">Spaces</h2><div className="mt-1 divide-y divide-default">{results.spaces.map((space) => <Row key={space.id} leading={<SpaceGlyph icon={space.icon} />} title={space.name} meta={space.status === 'ARCHIVED' ? 'Archived' : undefined} onClick={() => navigate(`space:${space.id}`)} />)}</div></section> : null}
      {results?.notes.length ? <section aria-label="Notes"><h2 className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">Notes</h2><div className="mt-1 divide-y divide-default">{results.notes.map((note) => <Row key={note.id} title={note.title || 'Untitled note'} meta={spaceName(spaces, note.spaceId)} onClick={() => navigate(`note:${note.id}`)} />)}</div></section> : null}
      {results?.sources.length ? <section aria-label="Library sources"><h2 className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">Library</h2><div className="mt-1 divide-y divide-default">{results.sources.map((source) => <Row key={source.id} icon={sourceKindMeta(source.kind).icon} title={source.title} meta={sourceKindMeta(source.kind).label} trailing={<StatusChip status={source.status} />} onClick={() => navigate('library')} />)}</div></section> : null}
    </div>
  </PageFrame>
}

export function SettingsView() {
  const user = useCurrentUser()
  return <PageFrame>
    <PageHeading title="Settings" subtitle="Your account and workspace preferences." />
    <div className="mt-8 divide-y divide-default border-y border-default">
      <div className="flex flex-wrap items-center justify-between gap-3 py-5"><div className="min-w-0"><h2 className="font-medium text-foreground">Profile</h2><p className="mt-1 break-words text-sm text-muted">{displayName(user)}</p></div><span className="min-w-0 break-all text-sm text-subtle">{user.email}</span></div>
      <div className="flex flex-wrap items-center justify-between gap-3 py-5"><div><h2 className="font-medium text-foreground">Writing</h2><p className="mt-1 text-sm text-muted">Your notes open in the Incantly document editor.</p></div></div>
      <div className="flex flex-wrap items-center justify-between gap-3 py-5"><div><h2 className="font-medium text-foreground">Account</h2><p className="mt-1 text-sm text-muted">Manage Google access or sign out of your account.</p></div><SignOutButton /></div>
    </div>
  </PageFrame>
}
