'use client'

import dynamic from 'next/dynamic'
import Image from 'next/image'
import Link from 'next/link'
import { createDocument, DocumentSlashMenu, useDocumentEditor, type IncantlyDocument } from '@incantly/canvas-react/document'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { AppIcon } from './AppIcon'

/**
 * Slash menu anchored next to the `/` being typed. The package renders its
 * menu in flow (bottom of the document) by default; this wrapper pins it to
 * the cursor with viewport coordinates so it opens beside the caret.
 */
function AnchoredSlashMenu() {
  const editor = useDocumentEditor()
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    if (!editor) return
    const update = () => {
      const { selection } = editor.state
      if (selection.empty && editor.isEditable) {
        try {
          const coords = editor.view.coordsAtPos(selection.$from.pos)
          const left = Math.max(8, Math.min(coords.left, window.innerWidth - 344))
          const below = coords.bottom + 8
          const top = below > window.innerHeight - 360 ? Math.max(8, coords.top - 368) : below
          setAnchor({ top, left })
        } catch {
          setAnchor(null)
        }
      } else {
        setAnchor(null)
      }
    }
    update()
    editor.on('selectionUpdate', update)
    editor.on('update', update)
    return () => {
      editor.off('selectionUpdate', update)
      editor.off('update', update)
    }
  }, [editor])

  if (!editor || !anchor) return null
  return (
    <div className="fixed z-50" style={{ top: anchor.top, left: anchor.left }}>
      <DocumentSlashMenu />
    </div>
  )
}

const DocumentEditor = dynamic(
  () => import('@incantly/canvas-react/document').then((module) => module.DocumentEditor),
  { ssr: false, loading: () => <div className="mx-auto mt-24 h-36 w-full max-w-[45rem] animate-pulse rounded-2xl bg-surface" /> },
)

type WorkspaceView = 'home' | 'search' | 'inbox' | 'papers' | 'journals' | 'settings' | `note:${string}`
type NoteRecord = { id: string; title: string; excerpt: string; updated: string; document: IncantlyDocument }

const initialNotes: NoteRecord[] = [
  { id: 'cities-at-night', title: 'Why cities stay warm at night', excerpt: 'Concrete, trees, moving air, and the shape of a neighborhood.', updated: '12 min ago', document: createDocument({ id: 'cities-at-night', title: 'Why cities stay warm at night' }) },
  { id: 'attention-garden', title: 'Attention as a garden', excerpt: 'What changes when focus is treated as something we tend?', updated: 'Yesterday', document: createDocument({ id: 'attention-garden', title: 'Attention as a garden' }) },
  { id: 'questions-worth-keeping', title: 'Questions worth keeping', excerpt: 'A growing list of ideas that should stay open a little longer.', updated: 'Sep 21', document: createDocument({ id: 'questions-worth-keeping', title: 'Questions worth keeping' }) },
]

const navigation: ReadonlyArray<{ id: 'search' | 'home' | 'inbox'; label: string; icon: 'search' | 'home' | 'inbox'; badge?: string }> = [
  { id: 'search', label: 'Search', icon: 'search' },
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'inbox', label: 'Inbox', icon: 'inbox', badge: '3' },
]

const navButton = 'flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium transition hover:bg-raised hover:text-foreground focus-visible:bg-raised'

function WorkspaceSidebar({ activeView, notes, onNavigate, onNewNote, onClose }: { activeView: WorkspaceView; notes: NoteRecord[]; onNavigate: (view: WorkspaceView) => void; onNewNote: () => void; onClose?: () => void }) {
  const navigate = (view: WorkspaceView) => { onNavigate(view); onClose?.() }
  return (
    <aside className="flex h-full w-full flex-col bg-surface px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4" aria-label="Workspace navigation">
      <div className="flex items-center justify-between gap-3 px-2">
        <Link href="/" className="flex items-center gap-2 font-display text-[1.35rem] tracking-[-0.05em] text-foreground no-underline"><Image src="/incantly-logo.svg" alt="" width={19} height={26} className="h-6 w-auto" /> incantly</Link>
        {onClose ? <button type="button" onClick={onClose} className="grid size-11 place-items-center rounded-xl text-muted hover:bg-raised" aria-label="Close navigation"><AppIcon name="close" className="size-5" /></button> : null}
      </div>
      <button type="button" onClick={onNewNote} className="mt-5 flex min-h-11 items-center justify-between rounded-xl bg-button px-4 text-sm font-semibold text-inverse hover:bg-button-hover"><span>New note</span><AppIcon name="plus" className="size-5" /></button>
      <nav className="mt-5 grid gap-1">
        {navigation.map((item) => <button key={item.id} type="button" onClick={() => navigate(item.id)} className={`${navButton} ${activeView === item.id ? 'bg-raised text-foreground' : 'text-muted'}`}><AppIcon name={item.icon} className="size-[1.125rem] shrink-0" /><span className="flex-1">{item.label}</span>{item.badge ? <span className="grid min-w-6 place-items-center rounded-full bg-button px-1.5 py-0.5 text-xs text-inverse">{item.badge}</span> : null}</button>)}
      </nav>

      <div className="mt-7 px-3 text-[0.68rem] font-bold uppercase tracking-[0.13em] text-subtle">Library</div>
      <nav className="mt-2 grid gap-1">
        <button type="button" onClick={() => navigate('papers')} className={`${navButton} ${activeView === 'papers' ? 'bg-raised text-foreground' : 'text-muted'}`}><AppIcon name="paper" className="size-[1.125rem]" />Your Papers</button>
        <button type="button" onClick={() => navigate('journals')} className={`${navButton} ${activeView === 'journals' ? 'bg-raised text-foreground' : 'text-muted'}`}><AppIcon name="journal" className="size-[1.125rem]" />Your Journals</button>
      </nav>

      <div className="mt-7 flex items-center justify-between px-3"><span className="text-[0.68rem] font-bold uppercase tracking-[0.13em] text-subtle">My Notes</span><button type="button" onClick={onNewNote} className="grid size-9 place-items-center rounded-lg text-muted hover:bg-raised hover:text-button" aria-label="Create note"><AppIcon name="plus" className="size-4" /></button></div>
      <nav className="mt-1 grid gap-1 overflow-y-auto">
        {notes.map((note) => <button key={note.id} type="button" onClick={() => navigate(`note:${note.id}`)} className={`${navButton} min-w-0 ${activeView === `note:${note.id}` ? 'bg-raised text-foreground' : 'text-muted'}`}><AppIcon name="document" className="size-4 shrink-0" /><span className="truncate">{note.title}</span></button>)}
      </nav>

      <div className="mt-auto grid gap-1 border-t border-default pt-3">
        <button type="button" onClick={() => navigate('settings')} className={`${navButton} ${activeView === 'settings' ? 'bg-raised text-foreground' : 'text-muted'}`}><AppIcon name="settings" className="size-[1.125rem]" />Settings</button>
        <div className="flex min-h-12 items-center gap-3 rounded-xl px-3"><span className="grid size-8 place-items-center rounded-full bg-button font-display text-sm text-inverse">I</span><span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">Iteoluwakisi</span><AppIcon name="chevron" className="size-4 text-subtle" /></div>
      </div>
    </aside>
  )
}

function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <header className="flex flex-wrap items-end justify-between gap-5"><div><p className="text-[0.68rem] font-bold uppercase tracking-[0.13em] text-button">{eyebrow}</p><h1 className="mt-2 font-display text-[clamp(2.5rem,6vw,4.6rem)] font-normal leading-[0.95] tracking-[-0.06em] text-foreground">{title}</h1><p className="mt-4 max-w-[42rem] leading-7 text-muted">{description}</p></div>{action}</header>
}

function HomeView({ notes, onOpen, onNewNote }: { notes: NoteRecord[]; onOpen: (id: string) => void; onNewNote: () => void }) {
  return <div className="mx-auto w-full max-w-[76rem] px-5 py-8 sm:px-8 lg:px-12 lg:py-12"><PageHeader eyebrow="Your workspace" title="Good morning, Iteoluwakisi." description="Pick up a thought, open a journal, or begin with a question that has been following you." action={<button type="button" onClick={onNewNote} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-button px-5 font-semibold text-inverse hover:bg-button-hover"><AppIcon name="plus" className="size-5" />New note</button>} />
    <section className="mt-12 grid gap-4 md:grid-cols-3" aria-label="Workspace overview">
      {[['My Notes', String(notes.length), 'Ideas you are still shaping.'], ['Your Papers', '4', 'Long-form work and research.'], ['Your Journals', '2', 'Questions, reflections, and change.']].map(([label, count, copy], index) => <article key={label} className={`min-h-[13rem] rounded-2xl border p-6 ${index === 0 ? 'border-button bg-button text-inverse' : 'border-default bg-raised text-foreground'}`}><span className="font-display text-5xl">{count}</span><h2 className="mt-7 font-display text-2xl font-normal">{label}</h2><p className={`mt-2 text-sm leading-6 ${index === 0 ? 'text-inverse/80' : 'text-muted'}`}>{copy}</p></article>)}
    </section>
    <section className="mt-12"><div className="flex items-center justify-between gap-4"><h2 className="font-display text-3xl font-normal tracking-[-0.04em] text-foreground">Continue exploring</h2><button type="button" className="min-h-11 text-sm font-semibold text-button">View all notes</button></div><div className="mt-5 grid gap-3">{notes.map((note) => <button key={note.id} type="button" onClick={() => onOpen(note.id)} className="group grid min-h-[6.5rem] gap-2 rounded-2xl border border-default bg-raised p-5 text-left transition hover:border-button sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><span><span className="block font-display text-xl text-foreground group-hover:text-button">{note.title}</span><span className="mt-2 block text-sm leading-6 text-muted">{note.excerpt}</span></span><span className="text-xs text-subtle">{note.updated}</span></button>)}</div></section>
  </div>
}

function SearchView({ notes, onOpen }: { notes: NoteRecord[]; onOpen: (id: string) => void }) {
  const [query, setQuery] = useState('')
  const results = useMemo(() => notes.filter((note) => `${note.title} ${note.excerpt}`.toLowerCase().includes(query.toLowerCase())), [notes, query])
  return <div className="mx-auto w-full max-w-[64rem] px-5 py-8 sm:px-8 lg:py-12"><PageHeader eyebrow="Find anything" title="Search your thinking." description="Look across notes, papers, journals, sources, and the questions you saved for later." /><label className="mt-10 flex min-h-14 items-center gap-3 rounded-2xl border border-default bg-raised px-5 focus-within:border-button"><AppIcon name="search" className="size-5 text-button" /><input value={query} onChange={(event) => setQuery(event.target.value)} autoFocus className="min-w-0 flex-1 bg-transparent text-lg text-foreground outline-none placeholder:text-subtle" placeholder="Search notes, ideas, or sources" /></label><div className="mt-6 grid gap-3">{results.map((note) => <button type="button" key={note.id} onClick={() => onOpen(note.id)} className="rounded-2xl border border-default bg-raised p-5 text-left hover:border-button"><span className="font-display text-xl text-foreground">{note.title}</span><span className="mt-2 block text-sm leading-6 text-muted">{note.excerpt}</span></button>)}{results.length === 0 ? <div className="rounded-2xl border border-dashed border-default p-10 text-center text-muted">No connected thoughts found yet.</div> : null}</div></div>
}

function CollectionView({ type }: { type: 'inbox' | 'papers' | 'journals' | 'settings' }) {
  const content = { inbox: ['Inbox', 'Ideas waiting for you.', 'Three captured thoughts are ready to be sorted into notes, papers, or journals.'], papers: ['Your Papers', 'Long-form work, still connected.', 'Build arguments and research without separating them from the notes that shaped them.'], journals: ['Your Journals', 'Notice what is changing.', 'Keep daily observations, questions, and lessons in a place that can grow with you.'], settings: ['Settings', 'Make the workspace yours.', 'Manage your profile, writing preferences, connected accounts, and notification choices.'] }[type]
  return <div className="mx-auto w-full max-w-[70rem] px-5 py-8 sm:px-8 lg:py-12"><PageHeader eyebrow={content[0]} title={content[1]} description={content[2]} /><div className="mt-12 grid gap-4 sm:grid-cols-2">{['A place to begin', 'Recently changed', 'Pinned for later', 'Shared with you'].map((title, index) => <article key={title} className="min-h-[12rem] rounded-2xl border border-default bg-raised p-6"><span className="grid size-10 place-items-center rounded-xl bg-surface text-button"><AppIcon name={index % 2 === 0 ? 'sparkles' : 'document'} className="size-5" /></span><h2 className="mt-6 font-display text-2xl font-normal text-foreground">{title}</h2><p className="mt-2 text-sm leading-6 text-muted">This area is ready for the first piece of your work.</p></article>)}</div></div>
}

function NoteView({ note, onChange, onRename }: { note: NoteRecord; onChange: (document: IncantlyDocument) => void; onRename: (title: string) => void }) {
  return <div className="flex min-h-full flex-col bg-raised"><header className="flex min-h-[4.5rem] items-center gap-3 border-b border-default px-4 sm:px-6"><AppIcon name="document" className="size-5 shrink-0 text-button" /><input value={note.title} onChange={(event) => onRename(event.target.value)} aria-label="Note title" className="min-w-0 flex-1 bg-transparent font-display text-lg text-foreground outline-none" /><div className="hidden min-w-0 max-w-[32rem] flex-1 items-center gap-2 rounded-xl bg-surface px-4 text-sm text-muted lg:flex"><AppIcon name="plus" className="size-4 text-button" />Ask a question about your notes</div><button type="button" className="grid size-11 place-items-center rounded-xl text-muted hover:bg-surface" aria-label="Share note"><AppIcon name="share" className="size-5" /></button><button type="button" className="min-h-11 rounded-xl bg-button px-4 text-sm font-semibold text-inverse hover:bg-button-hover">Share</button></header><div className="min-h-0 flex-1 overflow-y-auto"><DocumentEditor key={note.id} document={note.document} onChange={onChange} ui="none" aria-label={`Edit ${note.title}`} placeholder={'Start writing, or type “/” to explore commands…'} className="min-h-full"><AnchoredSlashMenu /></DocumentEditor></div><footer className="flex min-h-11 items-center justify-end border-t border-default px-5 text-xs text-subtle">Saved just now</footer></div>
}

export function Workspace() {
  const [activeView, setActiveView] = useState<WorkspaceView>('home')
  const [notes, setNotes] = useState<NoteRecord[]>(initialNotes)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const activeNoteId = activeView.startsWith('note:') ? activeView.slice(5) : null
  const activeNote = activeNoteId ? notes.find((note) => note.id === activeNoteId) : null

  const createNote = () => {
    const id = `note-${Date.now()}`
    const newNote: NoteRecord = { id, title: 'Untitled note', excerpt: 'A new thought begins here.', updated: 'Just now', document: createDocument({ id, title: 'Untitled note' }) }
    setNotes((current) => [newNote, ...current])
    setActiveView(`note:${id}`)
    setSidebarOpen(false)
  }

  const updateActiveNote = (changes: Partial<Pick<NoteRecord, 'title' | 'document'>>) => {
    if (!activeNoteId) return
    setNotes((current) => current.map((note) => note.id === activeNoteId ? { ...note, ...changes, updated: 'Just now' } : note))
  }

  return <main className={`min-h-svh bg-canvas lg:grid ${sidebarCollapsed ? 'lg:grid-cols-[minmax(0,1fr)]' : 'lg:grid-cols-[17rem_minmax(0,1fr)]'}`}>
    {sidebarCollapsed ? null : <div className="hidden h-svh border-r border-default lg:block"><WorkspaceSidebar activeView={activeView} notes={notes} onNavigate={setActiveView} onNewNote={createNote} onClose={() => setSidebarCollapsed(true)} /></div>}
    <header className="sticky top-0 z-30 flex min-h-[4.25rem] items-center justify-between border-b border-default bg-canvas/95 px-4 backdrop-blur lg:hidden"><button type="button" onClick={() => setSidebarOpen(true)} className="grid size-11 place-items-center rounded-xl text-foreground" aria-label="Open navigation"><AppIcon name="menu" className="size-5" /></button><Link href="/" className="font-display text-xl text-foreground no-underline">incantly</Link><button type="button" onClick={createNote} className="grid size-11 place-items-center rounded-xl bg-button text-inverse" aria-label="New note"><AppIcon name="plus" className="size-5" /></button></header>
    {sidebarOpen ? <div className="fixed inset-0 z-50 bg-foreground/20 lg:hidden" onClick={() => setSidebarOpen(false)}><div className="h-full w-[min(19rem,88vw)] border-r border-default" onClick={(event) => event.stopPropagation()}><WorkspaceSidebar activeView={activeView} notes={notes} onNavigate={setActiveView} onNewNote={createNote} onClose={() => setSidebarOpen(false)} /></div></div> : null}
    <section className="relative min-h-[calc(100svh-4.25rem)] min-w-0 lg:h-svh lg:min-h-0 lg:overflow-y-auto">
      {sidebarCollapsed ? <button type="button" onClick={() => setSidebarCollapsed(false)} className="absolute left-4 top-4 z-20 hidden size-11 place-items-center rounded-xl border border-default bg-raised text-foreground lg:grid" aria-label="Open navigation"><AppIcon name="menu" className="size-5" /></button> : null}
      {activeView === 'home' ? <HomeView notes={notes} onOpen={(id) => setActiveView(`note:${id}`)} onNewNote={createNote} /> : null}
      {activeView === 'search' ? <SearchView notes={notes} onOpen={(id) => setActiveView(`note:${id}`)} /> : null}
      {activeView === 'inbox' || activeView === 'papers' || activeView === 'journals' || activeView === 'settings' ? <CollectionView type={activeView} /> : null}
      {activeNote ? <NoteView note={activeNote} onChange={(document) => updateActiveNote({ document })} onRename={(title) => updateActiveNote({ title })} /> : null}
    </section>
  </main>
}
