'use client'

import { createDocument, type IncantlyDocument } from '@incantly/core/document'
import { useEffect, useRef, useState } from 'react'
import { AppIcon } from './AppIcon'
import { InboxPopover, type InboxItem } from './InboxPopover'
import { AppProviders } from './AppProviders'
import { SessionGate, useCurrentUser } from './SessionGate'
import type { NoteRecord, WorkspaceView } from './workspace/model'
import { usePreviewStore } from './workspace/usePreviewStore'
import { Sidebar, type NewAction } from './workspace/Sidebar'
import { HomeView, NotesView, SearchView, SettingsView } from './workspace/views'
import { SpaceView, SpacesView } from './workspace/SpaceViews'
import { LibraryView } from './workspace/LibraryView'
import { NoteView } from './workspace/NoteView'
import { AddSourceDialog, SpaceFormDialog } from './workspace/dialogs'
import { EmptyState, OfflineBanner, PageFrame, SpaceGlyph, buttonSecondary, iconButton } from './workspace/ui'

// Interim local notes, scoped per user, until Phase 3 moves notes to `/v1/notes`.
const storageKey = (userId: string) => `incantly-workspace-notes-v1:${userId}`

const initialNotes: NoteRecord[] = [
  { id: 'cities-at-night', title: 'Why cities stay warm at night', excerpt: 'Concrete, trees, moving air, and the shape of a neighborhood.', spaceId: null, updatedAt: 3, document: createDocument({ id: 'cities-at-night', title: 'Why cities stay warm at night' }) },
  { id: 'attention-garden', title: 'Attention as a garden', excerpt: 'What changes when focus is treated as something we tend?', spaceId: null, updatedAt: 2, document: createDocument({ id: 'attention-garden', title: 'Attention as a garden' }) },
  { id: 'questions-worth-keeping', title: 'Questions worth keeping', excerpt: 'A growing list of ideas that should stay open a little longer.', spaceId: null, updatedAt: 1, document: createDocument({ id: 'questions-worth-keeping', title: 'Questions worth keeping' }) },
]
const initialInbox: InboxItem[] = [
  { id: 'inbox-1', title: 'A question for later', detail: 'Why do some ideas stay with us long after a conversation?', when: 'Today' },
  { id: 'inbox-2', title: 'Something to read', detail: 'Return to the article you saved for your research.', when: 'Yesterday' },
  { id: 'inbox-3', title: 'A new connection', detail: 'Your city notes might connect to the observation in your journal.', when: 'Sep 21' },
]

function readSavedNotes(key: string): NoteRecord[] | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const value: unknown = JSON.parse(raw)
    if (!Array.isArray(value) || !value.every((item) => item && typeof item.id === 'string' && typeof item.title === 'string' && item.document?.schemaVersion)) return null
    // Older local notes carried a paper/journal kind; Spaces replace that.
    return value.map((item) => ({ id: item.id, title: item.title, excerpt: item.excerpt ?? '', spaceId: typeof item.spaceId === 'string' ? item.spaceId : null, updatedAt: Number(item.updatedAt) || 0, document: item.document }))
  } catch { return null }
}

function useOnline() {
  const [online, setOnline] = useState(true)
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update) }
  }, [])
  return online
}

export function Workspace() {
  return <AppProviders><SessionGate><WorkspaceShell /></SessionGate></AppProviders>
}

function WorkspaceShell() {
  const user = useCurrentUser()
  const store = usePreviewStore()
  const online = useOnline()
  const [view, setView] = useState<WorkspaceView>('home')
  const [notes, setNotes] = useState<NoteRecord[]>(initialNotes)
  const [inbox, setInbox] = useState<InboxItem[]>(initialInbox)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [railCollapsed, setRailCollapsed] = useState(false)
  const [railPeek, setRailPeek] = useState(false)
  const [contextOpen, setContextOpen] = useState(false)
  const [dialog, setDialog] = useState<'space' | 'source' | null>(null)
  const peekTimer = useRef<number | undefined>(undefined)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('Saved on this device')
  const [hydrated, setHydrated] = useState(false)
  const searchInput = useRef<HTMLInputElement>(null)
  const activeNoteId = view.startsWith('note:') ? view.slice(5) : null
  const activeNote = notes.find((note) => note.id === activeNoteId)
  const activeSpaceId = view.startsWith('space:') ? view.slice(6) : null
  const activeSpace = store.spaces.find((space) => space.id === activeSpaceId)
  const noteSpace = activeNote?.spaceId ? store.spaces.find((space) => space.id === activeNote.spaceId) : undefined

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = readSavedNotes(storageKey(user.id))
      if (saved) setNotes(saved)
      setHydrated(true)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [user.id])
  useEffect(() => {
    if (!hydrated) return
    const timer = window.setTimeout(() => {
      try { localStorage.setItem(storageKey(user.id), JSON.stringify(notes)); setStatus('Saved on this device') }
      catch { setStatus('Device storage is full. Recent edits may not be saved.') }
    }, 0)
    return () => window.clearTimeout(timer)
  }, [notes, hydrated, user.id])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false)
      if ((event.metaKey || event.ctrlKey) && event.key === '\\') {
        event.preventDefault()
        toggleRail()
      }
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

  // A collapsed rail opens (pushing the content aside) while hovered or keyboard-focused, and closes on leave.
  function schedulePeek(open: boolean) {
    window.clearTimeout(peekTimer.current)
    peekTimer.current = window.setTimeout(() => setRailPeek(open), open ? 120 : 220)
  }
  function toggleRail() {
    window.clearTimeout(peekTimer.current)
    setRailPeek(false)
    setRailCollapsed((current) => !current)
  }
  useEffect(() => () => window.clearTimeout(peekTimer.current), [])
  const railExpanded = !railCollapsed || railPeek

  function navigate(destination: WorkspaceView) { setView(destination); setMobileOpen(false) }
  function createNote(options: { title?: string; spaceId?: string | null } = {}) {
    const id = crypto.randomUUID()
    const title = options.title ?? 'Untitled note'
    const note: NoteRecord = { id, title, excerpt: '', spaceId: options.spaceId ?? null, updatedAt: Date.now(), document: createDocument({ id, title }) }
    setNotes((current) => [note, ...current])
    navigate(`note:${id}`)
  }
  function moveNote(noteId: string, spaceId: string | null) {
    setNotes((current) => current.map((note) => (note.id === noteId ? { ...note, spaceId } : note)))
    // A note leaving its Space can no longer be that Space's home note.
    store.spaces.forEach((space) => { if (space.homeNoteId === noteId && space.id !== spaceId) store.updateSpace(space.id, { homeNoteId: null }) })
  }
  function changeActive(changes: Partial<Pick<NoteRecord, 'title' | 'document'>>) {
    if (!activeNoteId) return
    setNotes((current) => current.map((item) => item.id === activeNoteId ? { ...item, ...changes, updatedAt: Date.now() } : item))
  }
  function shareNote() {
    if (!activeNote) return
    const text = `${activeNote.title}\n\n${activeNote.excerpt}`
    if (navigator.share) void navigator.share({ title: activeNote.title, text }).catch(() => {})
    else void navigator.clipboard.writeText(text).then(() => setStatus('Note summary copied')).catch(() => setStatus('Sharing is unavailable in this browser'))
  }
  function onNew(action: NewAction) {
    setMobileOpen(false)
    if (action === 'note') createNote({ spaceId: activeSpace?.status === 'ACTIVE' ? activeSpace.id : null })
    if (action === 'space') setDialog('space')
    if (action === 'source') setDialog('source')
  }

  const sidebarProps = { view, notes, spaces: store.spaces, navigate, onNew }
  const viewLabel = view === 'spaces' ? 'Spaces' : view === 'library' ? 'Library' : view === 'notes' ? 'Notes' : view === 'settings' ? 'Settings' : activeSpace ? activeSpace.name : null

  return <main className="min-h-svh bg-surface lg:flex lg:h-svh lg:overflow-hidden">
    <div className={`relative hidden h-svh shrink-0 transition-[width] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none lg:block ${railExpanded ? 'w-[17.5rem]' : 'w-16'}`}>
      <div
        id="workspace-sidebar"
        onPointerEnter={(event) => { if (railCollapsed && event.pointerType === 'mouse') schedulePeek(true) }}
        onPointerLeave={(event) => { if (railCollapsed && event.pointerType === 'mouse') schedulePeek(false) }}
        onFocus={(event) => { if (railCollapsed && event.target.matches(':focus-visible')) schedulePeek(true) }}
        onBlur={(event) => { if (railCollapsed && !event.currentTarget.contains(event.relatedTarget)) schedulePeek(false) }}
        onKeyDown={(event) => { if (event.key === 'Escape' && railPeek) schedulePeek(false) }}
        className={`absolute inset-y-0 left-0 overflow-hidden bg-surface transition-[width] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none ${railExpanded ? 'w-[17.5rem]' : 'w-16'}`}
      >
        <div className="h-full w-[17.5rem]"><Sidebar {...sidebarProps} collapsed={!railExpanded} /></div>
      </div>
    </div>
    <div className={`fixed inset-0 z-50 lg:hidden ${mobileOpen ? 'pointer-events-auto' : 'pointer-events-none'}`} aria-hidden={!mobileOpen} inert={!mobileOpen}>
      <button type="button" onClick={() => setMobileOpen(false)} aria-label="Close sidebar" className={`absolute inset-0 size-full bg-foreground/30 transition-opacity duration-200 motion-reduce:transition-none ${mobileOpen ? 'opacity-100' : 'opacity-0'}`} />
      <div id="workspace-mobile-sidebar" className={`absolute inset-y-0 left-0 w-[min(17.5rem,82vw)] shadow-lg transition-transform duration-200 motion-reduce:transition-none ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}><Sidebar {...sidebarProps} onClose={() => setMobileOpen(false)} /></div>
    </div>
    <div className="min-w-0 flex-1 p-2 lg:pl-0">
      <section className="relative min-h-[calc(100svh-1rem)] overflow-hidden rounded-[1.15rem] border border-default bg-raised lg:h-[calc(100svh-1rem)] lg:min-h-0 lg:overflow-y-auto" aria-label="Workspace content">
        {online ? null : <OfflineBanner />}
        <div className="flex min-h-12 items-center gap-1.5 px-2 pt-1 sm:px-4">
          <button type="button" onClick={() => setMobileOpen(true)} className="grid size-11 shrink-0 place-items-center rounded-lg text-foreground hover:bg-surface lg:hidden" aria-label="Open sidebar" aria-controls="workspace-mobile-sidebar" aria-expanded={mobileOpen}><AppIcon name="panel" className="size-5" /></button>
          <button type="button" onClick={toggleRail}
            // The pin control counts as part of the hover zone, so reaching for it keeps the rail open.
            onPointerEnter={(event) => { if (railCollapsed && railPeek && event.pointerType === 'mouse') schedulePeek(true) }}
            onPointerLeave={(event) => { if (railCollapsed && event.pointerType === 'mouse') schedulePeek(false) }}
            className="hidden size-11 place-items-center rounded-lg text-foreground hover:bg-surface lg:grid" aria-label={railCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={`${railCollapsed ? 'Expand' : 'Collapse'} sidebar (⌘\\)`} aria-controls="workspace-sidebar" aria-expanded={!railCollapsed}><AppIcon name="panel" className="size-5" /></button>
          {activeNote ? <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-1.5">
            {noteSpace ? <><button type="button" onClick={() => navigate(`space:${noteSpace.id}`)} className="flex min-h-11 max-w-[40%] shrink items-center gap-1.5 rounded-lg px-1.5 text-sm text-muted hover:bg-surface hover:text-foreground"><SpaceGlyph icon={noteSpace.icon} size="sm" /><span className="truncate">{noteSpace.name}</span></button><span aria-hidden="true" className="text-subtle">/</span></> : null}
            <input value={activeNote.title} onChange={(event) => changeActive({ title: event.target.value })} aria-label="Note title" className="min-w-0 flex-1 bg-transparent font-display text-base text-foreground outline-none" />
          </nav> : viewLabel ? <span className="min-w-0 truncate px-1 text-sm text-muted">{viewLabel}</span> : null}
          <div className="ml-auto flex shrink-0 items-center gap-1">
            {activeNote ? <>
              <button type="button" onClick={() => setContextOpen((current) => !current)} aria-pressed={contextOpen} className={`${iconButton} ${contextOpen ? 'bg-surface text-foreground' : ''}`} aria-label="Note context" title="Sources and context for this note"><AppIcon name="link" className="size-5" /></button>
              <button type="button" onClick={shareNote} className="mr-1 min-h-11 rounded-lg bg-button px-4 text-sm font-medium text-inverse hover:bg-button-hover">Share</button>
            </> : null}
            <InboxPopover items={inbox}
              createFrom={(item) => { createNote({ title: item.title }); setInbox((current) => current.filter((candidate) => candidate.id !== item.id)) }}
              dismiss={(id) => setInbox((current) => current.filter((item) => item.id !== id))} />
          </div>
        </div>

        {view === 'home' ? <HomeView notes={notes} spaces={store.spaces} sources={store.sources} navigate={navigate} onNewNote={() => createNote()} /> : null}
        {view === 'search' ? <div ref={(element) => { searchInput.current = element?.querySelector('input') ?? null }}><SearchView notes={notes} spaces={store.spaces} sources={store.sources} query={query} setQuery={setQuery} navigate={navigate} /></div> : null}
        {view === 'notes' ? <NotesView notes={notes} spaces={store.spaces} navigate={navigate} onNewNote={() => createNote()} /> : null}
        {view === 'spaces' ? <SpacesView spaces={store.spaces} notes={notes} navigate={navigate} onNewSpace={() => setDialog('space')} /> : null}
        {view === 'library' ? <LibraryView sources={store.sources} spaces={store.spaces} links={store.links} store={store} onAdd={() => setDialog('source')} /> : null}
        {view === 'settings' ? <SettingsView /> : null}
        {activeSpace ? <SpaceView key={activeSpace.id} space={activeSpace} notes={notes} sources={store.sources} links={store.links} store={store} navigate={navigate}
          onCreateNote={(spaceId) => createNote({ spaceId })} onMoveNote={moveNote} onAddSource={() => setDialog('source')} /> : null}
        {activeSpaceId && !activeSpace ? <PageFrame><EmptyState icon="space" title="Space not found" body="It may have been deleted." action={<button type="button" onClick={() => navigate('spaces')} className={buttonSecondary}>All Spaces</button>} /></PageFrame> : null}
        {activeNote ? <NoteView note={activeNote} save={(document: IncantlyDocument) => changeActive({ document })} status={status} contextOpen={contextOpen} onCloseContext={() => setContextOpen(false)} /> : null}
        {activeNoteId && !activeNote ? <PageFrame><EmptyState icon="document" title="Note not found" body="It may have been deleted." action={<button type="button" onClick={() => navigate('notes')} className={buttonSecondary}>All notes</button>} /></PageFrame> : null}
      </section>
    </div>

    <SpaceFormDialog open={dialog === 'space'} onClose={() => setDialog(null)} onSubmit={(draft) => { const space = store.createSpace(draft); navigate(`space:${space.id}`) }} />
    <AddSourceDialog open={dialog === 'source'} onClose={() => setDialog(null)} spaces={store.spaces} notes={notes} defaultSpaceId={activeSpace?.status === 'ACTIVE' ? activeSpace.id : undefined}
      onSubmit={(input) => { store.createSource({ kind: input.kind, title: input.title || 'Untitled source', sensitivity: input.sensitivity, spaceIds: input.spaceIds }) }} />
  </main>
}
