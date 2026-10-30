'use client'

import type { ReactNode } from 'react'
import { AppIcon, type IconName } from '../AppIcon'
import { useCurrentUser } from '../SessionGate'
import { firstName, greeting } from '../../../lib/identity'
import type { SpaceRecord } from './model'
import { updatedLabel } from './SpaceViews'
import { apiErrorMessage } from '../../../lib/api/errors'
import { useLibrary } from '@/hooks/use-library'
import { useNavigation } from '@/hooks/use-navigation'
import { useNotes } from '@/hooks/use-notes'
import { useSpaces } from '@/hooks/use-spaces'
import { EmptyState, ErrorState, ListSkeleton, PageFrame, PageHeading, SpaceGlyph, buttonPrimary, buttonSecondary } from './ui'

/** Loading state of the server notes list. */
export type ListStatus = { loading: boolean; error: unknown; retry: () => void; hasMore?: boolean; loadMore?: () => void; loadingMore?: boolean }

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

export function HomeView() {
  const { notes, status: notesStatus, createNote } = useNotes()
  const { spaces } = useSpaces()
  const { sources } = useLibrary()
  const { navigate } = useNavigation()
  const onNewNote = () => createNote()
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
      <div className="flex items-center justify-between gap-4"><h2 id="recent-heading" className="font-display text-[1.6rem] font-normal tracking-[-0.03em] text-foreground">Recent notes</h2>{notes.length ? <button type="button" onClick={() => navigate('notes')} className="min-h-11 rounded-lg px-3 text-sm font-medium text-button hover:bg-surface">See all</button> : null}</div>
      {notesStatus.loading ? <div className="mt-2"><ListSkeleton rows={3} label="Loading notes" /></div>
        : notesStatus.error ? <div className="mt-4"><ErrorState message={apiErrorMessage(notesStatus.error)} onRetry={notesStatus.retry} /></div>
        : recent.length ? <div className="mt-2 divide-y divide-default border-y border-default">
        {recent.map((note) => <Row key={note.id} title={note.title || 'Untitled note'} meta={[spaceName(spaces, note.spaceId), `Updated ${updatedLabel(note.updatedAt)}`].filter(Boolean).join(' · ')} onClick={() => navigate(`note:${note.id}`)} />)}
      </div> : <div className="mt-4"><EmptyState icon="document" title="No notes yet" body="Your first note can be a question, a lecture outline or a thought worth keeping." action={<button type="button" onClick={onNewNote} className={buttonPrimary}>Write a note</button>} /></div>}
    </section>
  </PageFrame>
}

export function NotesView() {
  const { notes, status: notesStatus, createNote } = useNotes()
  const { spaces } = useSpaces()
  const { navigate } = useNavigation()
  const onNewNote = () => createNote()
  const sorted = notes.slice().sort((a, b) => b.updatedAt - a.updatedAt)
  return <PageFrame>
    <PageHeading title="Notes" subtitle="All your notes, newest first. A note can live in one Space or stand on its own."
      actions={<button type="button" onClick={onNewNote} className={buttonPrimary}><AppIcon name="plus" className="size-4" />New note</button>} />
    <div className="mt-8">
      {notesStatus.loading ? <ListSkeleton rows={6} label="Loading notes" />
        : notesStatus.error ? <ErrorState message={apiErrorMessage(notesStatus.error)} onRetry={notesStatus.retry} />
        : sorted.length ? <><div className="divide-y divide-default border-y border-default">
        {sorted.map((note) => {
          const space = spaces.find((item) => item.id === note.spaceId)
          return <Row key={note.id} title={note.title || 'Untitled note'} meta={`Updated ${updatedLabel(note.updatedAt)}`} onClick={() => navigate(`note:${note.id}`)}
            trailing={space ? <span className="hidden max-w-[10rem] shrink-0 items-center gap-1.5 truncate rounded-full bg-surface px-2 py-0.5 text-xs text-muted sm:inline-flex"><SpaceGlyph icon={space.icon} size="sm" /><span className="truncate">{space.name}</span></span> : null} />
        })}
      </div>
        {notesStatus.hasMore ? <div className="mt-4 flex justify-center"><button type="button" onClick={notesStatus.loadMore} disabled={notesStatus.loadingMore} className={buttonSecondary}>{notesStatus.loadingMore ? 'Loading…' : 'Load more notes'}</button></div> : null}
      </> : <EmptyState icon="document" title="No notes yet" body="Write your first note, then organize it into a Space whenever you like." action={<button type="button" onClick={onNewNote} className={buttonPrimary}>New note</button>} />}
    </div>
  </PageFrame>
}

