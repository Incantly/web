'use client'

import dynamic from 'next/dynamic'
import { createDocument, type IncantlyDocument } from '@incantly/core/document'
import type { Editor } from '@tiptap/core'
import { DocumentBubbleToolbar, DocumentFileUploads, DocumentFindBar, DocumentSlashMenu } from '../../lib/document-editor'
import { TableHandle } from '@/components/tiptap-node/table-node/ui/table-handle'
import { TableSelectionOverlay } from '@/components/tiptap-node/table-node/ui/table-selection-overlay'
import { TableExtendRowColumnButtons } from '@/components/tiptap-node/table-node/ui/table-extend-row-column-button'
import { TableCellHandleMenu } from '@/components/tiptap-node/table-node/ui/table-cell-handle-menu'
import { incantlySlashMenuItems } from './slashMenuItems'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AppIcon } from './AppIcon'
import { WorkspaceLibrary } from './WorkspaceLibrary'

type NoteKind = 'note' | 'paper' | 'journal'
type WorkspaceView = 'home' | 'search' | 'inbox' | 'library' | 'notes' | 'papers' | 'journals' | 'settings' | `note:${string}`
type NoteRecord = { id: string; title: string; excerpt: string; kind: NoteKind; updatedAt: number; document: IncantlyDocument }
type InboxItem = { id: string; title: string; detail: string; when: string }

const STORAGE_KEY = 'incantly-workspace-notes-v1'

const WorkspaceTableCellMenu = ({ editor, onOpenChange, onResizeStart }: {
  editor?: Editor | null
  onOpenChange?: (isOpen: boolean) => void
  onResizeStart?: (handle: 'tl' | 'tr' | 'bl' | 'br' | null) => (event: React.MouseEvent) => void
}) => (
  <TableCellHandleMenu
    editor={editor}
    onOpenChange={onOpenChange}
    onMouseDown={(event) => onResizeStart?.('br')(event)}
  />
)
const initialNotes: NoteRecord[] = [
  { id: 'cities-at-night', title: 'Why cities stay warm at night', excerpt: 'Concrete, trees, moving air, and the shape of a neighborhood.', kind: 'note', updatedAt: 3, document: createDocument({ id: 'cities-at-night', title: 'Why cities stay warm at night' }) },
  { id: 'attention-garden', title: 'Attention as a garden', excerpt: 'What changes when focus is treated as something we tend?', kind: 'note', updatedAt: 2, document: createDocument({ id: 'attention-garden', title: 'Attention as a garden' }) },
  { id: 'questions-worth-keeping', title: 'Questions worth keeping', excerpt: 'A growing list of ideas that should stay open a little longer.', kind: 'note', updatedAt: 1, document: createDocument({ id: 'questions-worth-keeping', title: 'Questions worth keeping' }) },
  { id: 'my-first-journal', title: 'My First Journal', excerpt: 'A place to notice what changes over time.', kind: 'journal', updatedAt: 0, document: createDocument({ id: 'my-first-journal', title: 'My First Journal' }) },
]
const initialInbox: InboxItem[] = [
  { id: 'inbox-1', title: 'A question for later', detail: 'Why do some ideas stay with us long after a conversation?', when: 'Today' },
  { id: 'inbox-2', title: 'Something to read', detail: 'Return to the article you saved for your research.', when: 'Yesterday' },
  { id: 'inbox-3', title: 'A new connection', detail: 'Your city notes might connect to the observation in your journal.', when: 'Sep 21' },
]

const DocumentEditor = dynamic(
  () => import('../../lib/document-editor').then((module) => module.DocumentEditor),
  { ssr: false, loading: () => <div className="mx-auto mt-20 h-28 w-full max-w-[46rem] animate-pulse rounded-2xl bg-surface" /> },
)

const railButton = 'flex min-h-11 w-full min-w-0 items-center gap-3 rounded-lg px-3 text-left text-sm transition hover:bg-raised hover:text-foreground focus-visible:bg-raised'

function RailItem({ children, active, onClick }: { children: ReactNode; active: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`${railButton} ${active ? 'bg-raised font-medium text-foreground' : 'text-muted'}`}>{children}</button>
}

function Sidebar({ view, notes, inboxCount, navigate, create, onClose }: { view: WorkspaceView; notes: NoteRecord[]; inboxCount: number; navigate: (view: WorkspaceView) => void; create: (kind: NoteKind) => void; onClose?: () => void }) {
  const items = notes.slice().sort((a, b) => b.updatedAt - a.updatedAt)
  return <aside className="flex h-full min-h-0 flex-col bg-surface px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3" aria-label="Workspace navigation">
    <div className="flex min-h-11 items-center justify-between gap-2 px-1">
      <p className="min-w-0 truncate text-[0.98rem] font-semibold text-foreground">Hi, Iteoluwakisi</p>
      {onClose ? <button type="button" onClick={onClose} className="grid size-11 shrink-0 place-items-center rounded-lg text-foreground hover:bg-raised" aria-label="Close sidebar"><AppIcon name="panel" className="size-5" /></button> : null}
    </div>
    <nav className="mt-4 grid gap-0.5" aria-label="Main navigation">
      <RailItem active={view === 'search'} onClick={() => navigate('search')}><AppIcon name="search" className="size-[1.125rem] shrink-0" />Search <span className="ml-auto hidden rounded bg-canvas px-1.5 py-0.5 text-[0.65rem] text-subtle sm:block">⌘ K</span></RailItem>
      <RailItem active={view === 'home'} onClick={() => navigate('home')}><AppIcon name="home" className="size-[1.125rem] shrink-0" />Home</RailItem>
      <RailItem active={view === 'inbox'} onClick={() => navigate('inbox')}><AppIcon name="inbox" className="size-[1.125rem] shrink-0" />Inbox {inboxCount ? <span className="ml-auto grid min-w-5 place-items-center rounded-full bg-button px-1 text-[0.65rem] text-inverse">{inboxCount}</span> : null}</RailItem>
    </nav>

    <div className="mt-7 flex items-center justify-between px-3"><button type="button" onClick={() => navigate('library')} className="min-h-11 text-left text-xs font-bold uppercase tracking-[0.1em] text-foreground hover:text-button">Library</button><button type="button" onClick={() => navigate('library')} className="grid size-11 place-items-center rounded-lg text-muted hover:bg-raised" aria-label="Open library"><AppIcon name="chevron" className="size-4" /></button></div>
    <RailItem active={view === 'library'} onClick={() => navigate('library')}><AppIcon name="archive" className="size-[1.125rem] shrink-0" />All files and folders</RailItem>

    {([
      ['papers', 'Your Papers', 'paper', 'paper'],
      ['journals', 'Your Journals', 'journal', 'journal'],
      ['notes', 'My Notes', 'document', 'note'],
    ] as const).map(([destination, title, icon, kind]) => <div key={destination} className="mt-4">
      <div className="flex items-center justify-between px-3"><button type="button" onClick={() => navigate(destination)} className="min-h-11 truncate text-left text-xs font-bold uppercase tracking-[0.1em] text-foreground hover:text-button">{title}</button><button type="button" onClick={() => create(kind)} className="grid size-11 place-items-center rounded-lg text-muted hover:bg-raised hover:text-button" aria-label={`Create ${kind}`}><AppIcon name="plus" className="size-4" /></button></div>
      <nav className="max-h-[9rem] overflow-y-auto" aria-label={title}>
        {items.filter((item) => item.kind === kind).slice(0, 5).map((item) => <RailItem key={item.id} active={view === `note:${item.id}`} onClick={() => navigate(`note:${item.id}`)}><AppIcon name={icon} className="size-4 shrink-0" /><span className="min-w-0 truncate">{item.title}</span></RailItem>)}
        {items.every((item) => item.kind !== kind) ? <button type="button" onClick={() => create(kind)} className="min-h-11 px-3 text-left text-xs text-muted hover:text-button">+ Create {kind}</button> : null}
      </nav>
    </div>)}

    <div className="mt-auto border-t border-default pt-2">
      <RailItem active={view === 'settings'} onClick={() => navigate('settings')}><AppIcon name="settings" className="size-[1.125rem] shrink-0" />Settings</RailItem>
      <div className="mt-1 flex min-h-11 items-center gap-2 px-3"><span className="grid size-7 place-items-center rounded-full bg-button text-xs font-semibold text-inverse">I</span><span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">Iteoluwakisi</span></div>
    </div>
  </aside>
}

function PageFrame({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-[70rem] px-5 py-7 sm:px-8 lg:px-12 lg:py-10">{children}</div>
}

function PageHeading({ eyebrow, title, subtitle, action }: { eyebrow?: string; title: string; subtitle?: string; action?: ReactNode }) {
  return <header className="flex flex-wrap items-end justify-between gap-5">{<div className="min-w-0">{eyebrow ? <p className="text-[0.7rem] font-bold uppercase tracking-[0.13em] text-button">{eyebrow}</p> : null}<h1 className="mt-2 font-display text-[clamp(2.4rem,5vw,3.9rem)] font-normal leading-[1.05] tracking-[-0.055em] text-foreground">{title}</h1>{subtitle ? <p className="mt-3 max-w-[40rem] text-sm leading-6 text-muted">{subtitle}</p> : null}</div>}{action}</header>
}

function HomeView({ notes, open, navigate }: { notes: NoteRecord[]; open: (id: string) => void; navigate: (view: WorkspaceView) => void }) {
  const counts = {
    note: notes.filter((item) => item.kind === 'note').length,
    paper: notes.filter((item) => item.kind === 'paper').length,
    journal: notes.filter((item) => item.kind === 'journal').length,
  }
  const recent = notes.slice().sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5)
  return <PageFrame><PageHeading title="Good morning, Iteoluwakisi." /><section className="mt-10 grid gap-3 sm:grid-cols-3" aria-label="Your work at a glance">{([
    ['My Notes', counts.note, 'notes'],
    ['Your Papers', counts.paper, 'papers'],
    ['Your Journals', counts.journal, 'journals'],
  ] as const).map(([label, count, destination]) => <button type="button" key={label} onClick={() => navigate(destination)} className="flex min-h-[8rem] flex-col justify-between rounded-[1.1rem] border border-default bg-raised p-5 text-left transition hover:border-button"><span className="font-display text-[2.5rem] leading-none text-foreground">{count}</span><span className="text-sm font-medium text-muted">{label}</span></button>)}</section>
    <section className="mt-11" aria-labelledby="recent-heading"><div className="flex items-center justify-between gap-4"><h2 id="recent-heading" className="font-display text-[1.75rem] font-normal tracking-[-0.04em] text-foreground">Recent</h2><button type="button" onClick={() => navigate('notes')} className="min-h-11 text-sm font-medium text-button hover:underline">See all notes</button></div><div className="mt-2 divide-y divide-default border-y border-default">{recent.map((item) => <button key={item.id} type="button" onClick={() => open(item.id)} className="flex min-h-[5.4rem] w-full min-w-0 items-center gap-4 py-3 text-left hover:text-button"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface text-button"><AppIcon name={item.kind === 'note' ? 'document' : item.kind === 'paper' ? 'paper' : 'journal'} className="size-5" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-foreground">{item.title}</span><span className="mt-1 block truncate text-xs text-muted">{item.excerpt}</span></span><AppIcon name="chevron" className="size-4 shrink-0 text-subtle" /></button>)}</div></section>
  </PageFrame>
}

function SearchView({ notes, query, setQuery, open }: { notes: NoteRecord[]; query: string; setQuery: (value: string) => void; open: (id: string) => void }) {
  const matches = useMemo(() => notes.filter((note) => `${note.title} ${note.excerpt}`.toLowerCase().includes(query.toLowerCase())), [notes, query])
  return <PageFrame><PageHeading title="Search your workspace." subtitle="Find a note, paper, journal, or idea you want to revisit." /><label className="mt-8 flex min-h-14 items-center gap-3 rounded-xl border border-default bg-raised px-4 focus-within:border-button"><AppIcon name="search" className="size-5 text-button" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by title or thought" className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-subtle" /></label><div className="mt-6 divide-y divide-default">{matches.map((note) => <button type="button" key={note.id} onClick={() => open(note.id)} className="flex min-h-[5rem] w-full items-center gap-4 text-left hover:text-button"><AppIcon name="document" className="size-5 shrink-0 text-button" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-foreground">{note.title}</span><span className="mt-1 block truncate text-xs text-muted">{note.excerpt}</span></span><AppIcon name="chevron" className="size-4 shrink-0" /></button>)}{matches.length === 0 ? <p className="py-10 text-center text-sm text-muted">No matching work yet.</p> : null}</div></PageFrame>
}

function InboxView({ items, createFrom, dismiss }: { items: InboxItem[]; createFrom: (item: InboxItem) => void; dismiss: (id: string) => void }) {
  return <PageFrame><PageHeading title="Inbox" subtitle="Quick thoughts and things to return to live here until you give them a home." /><div className="mt-8 divide-y divide-default border-y border-default">{items.map((item) => <article key={item.id} className="grid gap-3 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div><p className="text-xs font-medium text-button">{item.when}</p><h2 className="mt-1 font-display text-xl text-foreground">{item.title}</h2><p className="mt-1 text-sm leading-6 text-muted">{item.detail}</p></div><div className="flex gap-2"><button type="button" onClick={() => createFrom(item)} className="min-h-11 rounded-lg bg-button px-3 text-xs font-semibold text-inverse">Make a note</button><button type="button" onClick={() => dismiss(item.id)} className="min-h-11 rounded-lg border border-default px-3 text-xs text-muted hover:border-button">Done</button></div></article>)}{items.length === 0 ? <p className="py-16 text-center font-display text-xl text-muted">All caught up. Your inbox is clear.</p> : null}</div></PageFrame>
}

function CollectionView({ kind, notes, create, open }: { kind: NoteKind; notes: NoteRecord[]; create: () => void; open: (id: string) => void }) {
  const label = kind === 'note' ? 'My Notes' : kind === 'paper' ? 'Your Papers' : 'Your Journals'
  const singular = kind === 'note' ? 'note' : kind === 'paper' ? 'paper' : 'journal'
  const items = notes.filter((item) => item.kind === kind).slice().sort((a, b) => b.updatedAt - a.updatedAt)
  return <PageFrame><PageHeading title={label} subtitle={kind === 'note' ? 'Every thought has somewhere to grow.' : kind === 'paper' ? 'Longer work that stays connected to your research.' : 'A place to return to what you noticed and learned.'} action={<button type="button" onClick={create} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-button px-4 text-sm font-semibold text-inverse"><AppIcon name="plus" className="size-4" /> New {singular}</button>} /><div className="mt-9 divide-y divide-default border-y border-default">{items.map((item) => <button type="button" key={item.id} onClick={() => open(item.id)} className="flex min-h-[5.5rem] w-full items-center gap-3 py-3 text-left"><AppIcon name={kind === 'note' ? 'document' : kind === 'paper' ? 'paper' : 'journal'} className="size-5 shrink-0 text-button" /><span className="min-w-0 flex-1"><span className="block truncate font-display text-lg text-foreground">{item.title}</span><span className="mt-1 block truncate text-xs text-muted">{item.excerpt}</span></span><AppIcon name="chevron" className="size-4 shrink-0 text-subtle" /></button>)}{items.length === 0 ? <div className="py-16 text-center"><p className="font-display text-xl text-foreground">Your first {singular} can begin here.</p><button type="button" onClick={create} className="mt-5 min-h-11 rounded-lg bg-button px-4 text-sm font-semibold text-inverse">Create {singular}</button></div> : null}</div></PageFrame>
}

function SettingsView() {
  return <PageFrame><PageHeading title="Settings" subtitle="Your workspace preferences." /><div className="mt-8 divide-y divide-default border-y border-default"><div className="flex flex-wrap items-center justify-between gap-3 py-5"><div><h2 className="font-medium text-foreground">Profile</h2><p className="mt-1 text-sm text-muted">Iteoluwakisi</p></div><span className="text-sm text-subtle">Incantly workspace</span></div><div className="flex flex-wrap items-center justify-between gap-3 py-5"><div><h2 className="font-medium text-foreground">Writing</h2><p className="mt-1 text-sm text-muted">Your notes open in the Incantly document editor.</p></div><span className="text-sm text-subtle">Ready to write</span></div></div></PageFrame>
}

function NoteView({ note, save, status }: { note: NoteRecord; save: (document: IncantlyDocument) => void; status: string }) {
  return <div className="flex min-h-full flex-col"><div className="min-h-0 flex-1"><DocumentEditor key={note.id} document={note.document} onChange={save} ui="none" aria-label={`Edit ${note.title}`} placeholder="Start writing, or type “/” to see commands…" className="min-h-full"><DocumentBubbleToolbar /><DocumentSlashMenu items={incantlySlashMenuItems} /><TableHandle /><TableSelectionOverlay showResizeHandles cellMenu={WorkspaceTableCellMenu} /><TableExtendRowColumnButtons /><DocumentFileUploads /><DocumentFindBar /></DocumentEditor></div><span role="status" className="sr-only">{status}</span></div>
}

function readSavedNotes(): NoteRecord[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const value: unknown = JSON.parse(raw)
    if (!Array.isArray(value) || !value.every((item) => item && typeof item.id === 'string' && typeof item.title === 'string' && ['note', 'paper', 'journal'].includes(item.kind) && item.document?.schemaVersion)) return null
    return value as NoteRecord[]
  } catch { return null }
}

export function Workspace() {
  const [view, setView] = useState<WorkspaceView>('home')
  const [notes, setNotes] = useState<NoteRecord[]>(initialNotes)
  const [inbox, setInbox] = useState<InboxItem[]>(initialInbox)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [railCollapsed, setRailCollapsed] = useState(false)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('Saved on this device')
  const [hydrated, setHydrated] = useState(false)
  const searchInput = useRef<HTMLInputElement>(null)
  const activeId = view.startsWith('note:') ? view.slice(5) : null
  const activeNote = notes.find((note) => note.id === activeId)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = readSavedNotes()
      if (saved) setNotes(saved)
      setHydrated(true)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [])
  useEffect(() => {
    if (!hydrated) return
    const timer = window.setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(notes)); setStatus('Saved on this device') }
      catch { setStatus('Device storage is full. Recent edits may not be saved.') }
    }, 0)
    return () => window.clearTimeout(timer)
  }, [notes, hydrated])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false)
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setView('search')
        window.setTimeout(() => searchInput.current?.focus(), 0)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)')
    const closeMobileSidebar = () => { if (desktop.matches) setMobileOpen(false) }
    desktop.addEventListener('change', closeMobileSidebar)
    return () => desktop.removeEventListener('change', closeMobileSidebar)
  }, [])

  function navigate(destination: WorkspaceView) { setView(destination); setMobileOpen(false) }
  function create(kind: NoteKind, title?: string) {
    const id = crypto.randomUUID()
    const name = title ?? (kind === 'note' ? 'Untitled note' : kind === 'paper' ? 'Untitled paper' : 'Untitled journal')
    const item: NoteRecord = { id, title: name, excerpt: 'A new thought begins here.', kind, updatedAt: Date.now(), document: createDocument({ id, title: name }) }
    setNotes((current) => [item, ...current])
    navigate(`note:${id}`)
  }
  function changeActive(changes: Partial<Pick<NoteRecord, 'title' | 'document'>>) {
    if (!activeId) return
    setNotes((current) => current.map((item) => item.id === activeId ? { ...item, ...changes, updatedAt: Date.now() } : item))
  }
  function shareNote() {
    if (!activeNote) return
    const text = `${activeNote.title}\n\n${activeNote.excerpt}`
    if (navigator.share) void navigator.share({ title: activeNote.title, text }).catch(() => {})
    else void navigator.clipboard.writeText(text).then(() => setStatus('Note summary copied')).catch(() => setStatus('Sharing is unavailable in this browser'))
  }

  return <main className="min-h-svh bg-surface lg:flex lg:h-svh lg:overflow-hidden">
    {!railCollapsed ? <div className="hidden h-svh w-[17.5rem] shrink-0 lg:block"><Sidebar view={view} notes={notes} inboxCount={inbox.length} navigate={navigate} create={create} /></div> : null}
    <div className={`fixed inset-0 z-50 lg:hidden ${mobileOpen ? 'pointer-events-auto' : 'pointer-events-none'}`} aria-hidden={!mobileOpen} inert={!mobileOpen}>
      <button type="button" onClick={() => setMobileOpen(false)} aria-label="Close sidebar" className={`absolute inset-0 size-full bg-foreground/30 transition-opacity duration-200 motion-reduce:transition-none ${mobileOpen ? 'opacity-100' : 'opacity-0'}`} />
      <div id="workspace-mobile-sidebar" className={`absolute inset-y-0 left-0 w-[min(17.5rem,82vw)] shadow-lg transition-transform duration-200 motion-reduce:transition-none ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}><Sidebar view={view} notes={notes} inboxCount={inbox.length} navigate={navigate} create={create} onClose={() => setMobileOpen(false)} /></div>
    </div>
    <div className="min-w-0 flex-1 p-2 lg:pl-0">
      <section className="relative min-h-[calc(100svh-1rem)] overflow-hidden rounded-[1.15rem] border border-default bg-raised lg:h-[calc(100svh-1rem)] lg:min-h-0 lg:overflow-y-auto" aria-label="Workspace content">
        <div className="flex min-h-12 items-center gap-2 px-3 pt-1 sm:px-5">
          <button type="button" onClick={() => setMobileOpen(true)} className="grid size-11 shrink-0 place-items-center rounded-lg text-foreground hover:bg-surface lg:hidden" aria-label="Open sidebar" aria-controls="workspace-mobile-sidebar" aria-expanded={mobileOpen}><AppIcon name="panel" className="size-5" /></button>
          <button type="button" onClick={() => setRailCollapsed(!railCollapsed)} className="hidden size-11 place-items-center rounded-lg text-foreground hover:bg-surface lg:grid" aria-label={railCollapsed ? 'Open sidebar' : 'Collapse sidebar'} aria-expanded={!railCollapsed}><AppIcon name="panel" className="size-5" /></button>
          {activeNote ? <input value={activeNote.title} onChange={(event) => changeActive({ title: event.target.value })} aria-label="Document title" className="min-w-0 flex-1 bg-transparent font-display text-base text-foreground outline-none" /> : view !== 'home' && view !== 'search' ? <span className="truncate text-xs text-muted">{view === 'library' ? 'Library' : view === 'inbox' ? 'Inbox' : view === 'notes' ? 'My Notes' : view === 'papers' ? 'Your Papers' : view === 'journals' ? 'Your Journals' : 'Settings'}</span> : null}
          <div className="ml-auto flex items-center gap-2">{activeNote ? <button type="button" onClick={shareNote} className="min-h-11 rounded-lg bg-button px-4 text-sm font-medium text-inverse hover:bg-button-hover">Share</button> : <><button type="button" onClick={() => navigate('search')} className="grid size-11 place-items-center rounded-lg text-muted hover:bg-surface hover:text-button" aria-label="Search workspace"><AppIcon name="search" className="size-4" /></button><span className="hidden text-xs text-subtle sm:block">Your space for thinking</span></>}</div>
        </div>
        {view === 'home' ? <HomeView notes={notes} open={(id) => navigate(`note:${id}`)} navigate={navigate} /> : null}
        {view === 'search' ? <div ref={(element) => { searchInput.current = element?.querySelector('input') ?? null }}><SearchView notes={notes} query={query} setQuery={setQuery} open={(id) => navigate(`note:${id}`)} /></div> : null}
        {view === 'inbox' ? <InboxView items={inbox} createFrom={(item) => { create('note', item.title); setInbox((current) => current.filter((candidate) => candidate.id !== item.id)) }} dismiss={(id) => setInbox((current) => current.filter((item) => item.id !== id))} /> : null}
        {view === 'library' ? <WorkspaceLibrary /> : null}
        {view === 'notes' || view === 'papers' || view === 'journals' ? <CollectionView kind={view === 'notes' ? 'note' : view === 'papers' ? 'paper' : 'journal'} notes={notes} create={() => create(view === 'notes' ? 'note' : view === 'papers' ? 'paper' : 'journal')} open={(id) => navigate(`note:${id}`)} /> : null}
        {view === 'settings' ? <SettingsView /> : null}
        {activeNote ? <NoteView note={activeNote} save={(document) => changeActive({ document })} status={status} /> : null}
      </section>
    </div>
  </main>
}
