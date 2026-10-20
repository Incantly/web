'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { authClient } from '../../lib/auth-client'
import { syncKey } from '../../lib/notes/syncStore'
import { AppIcon } from './AppIcon'
import { InboxPopover, type InboxItem } from './InboxPopover'
import { AppProviders } from './AppProviders'
import { SessionGate, useCurrentUser } from './SessionGate'
import type { NoteRecord, WorkspaceView } from './workspace/model'
import { Sidebar, type NewAction } from './workspace/Sidebar'
import { HomeView, NotesView, SearchView, SettingsView } from './workspace/views'
import { SpaceView, SpacesView } from './workspace/SpaceViews'
import { LibraryView } from './workspace/LibraryView'
import { NoteScreen } from './workspace/NoteView'
import { createNoteVariables, useCreateNote, useDeleteNote, useNotesCache, useNotesList } from './workspace/useNotes'
import { noteSyncStore, resumePendingNotes, useNoteSession } from './workspace/useNoteSession'
import { useAbandonedUploadCleanup, useServerAssetHost } from './workspace/useAssets'
import { DocumentAssetsProvider } from '../../lib/document-editor/assetHost'
import { AddSourceDialog, SpaceFormDialog } from './workspace/dialogs'
import { createSpaceVariables, useSpaceActions, useSpaces } from './workspace/useSpaces'
import { addSourceToLibrary, libraryKey, useLibrarySources } from './workspace/useLibrary'
import { EmptyState, OfflineBanner, PageFrame, buttonSecondary } from './workspace/ui'

const initialInbox: InboxItem[] = [
  { id: 'inbox-1', title: 'A question for later', detail: 'Why do some ideas stay with us long after a conversation?', when: 'Today' },
  { id: 'inbox-2', title: 'Something to read', detail: 'Return to the article you saved for your research.', when: 'Yesterday' },
  { id: 'inbox-3', title: 'A new connection', detail: 'Your city notes might connect to the observation in your journal.', when: 'Sep 21' },
]

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

function NoteRoute({ userId, noteId, ...props }: { userId: string; noteId: string } & Omit<Parameters<typeof NoteScreen>[0], 'noteId' | 'session'>) {
  const cache = useNotesCache(userId)
  const session = useNoteSession(userId, noteId, {
    onAck: (_revision, title) => cache.upsert({ id: noteId, updatedAt: new Date().toISOString(), ...(title ? { title } : {}) }),
  })
  const assets = useServerAssetHost(userId)
  return <DocumentAssetsProvider host={assets}><NoteScreen noteId={noteId} session={session} {...props} /></DocumentAssetsProvider>
}

export function Workspace() {
  return <AppProviders><SessionGate><WorkspaceShell /></SessionGate></AppProviders>
}

function WorkspaceShell() {
  const user = useCurrentUser()
  const client = useQueryClient()
  const online = useOnline()
  const spacesQuery = useSpaces(user.id)
  const libraryQuery = useLibrarySources(user.id)
  const spaceActions = useSpaceActions(user.id)
  const spaces = spacesQuery.spaces
  const sources = libraryQuery.sources
  // The notes list has no Space field (gap G1): a note opened from a Space remembers it here.
  const [noteContext, setNoteContext] = useState<{ noteId: string; spaceId: string } | null>(null)
  const [openSourceId, setOpenSourceId] = useState<string | null>(null)
  const [view, setView] = useState<WorkspaceView>('home')
  const notesQuery = useNotesList(user.id)
  const createNoteMutation = useCreateNote(user.id)
  const deleteNoteMutation = useDeleteNote(user.id)
  const notes = useMemo<NoteRecord[]>(() => notesQuery.notes.map((note) => ({ id: note.id, title: note.title, updatedAt: Date.parse(note.updatedAt) || 0, spaceId: noteContext?.noteId === note.id ? noteContext.spaceId : null, currentRevisionId: note.currentRevisionId ?? null })), [notesQuery.notes, noteContext])
  const notesStatus = { loading: notesQuery.isPending, error: notesQuery.isError ? notesQuery.error : null, retry: () => void notesQuery.refetch(), hasMore: notesQuery.hasNextPage, loadMore: () => void notesQuery.fetchNextPage(), loadingMore: notesQuery.isFetchingNextPage }
  const spacesStatus = { loading: spacesQuery.isPending, error: spacesQuery.isError ? spacesQuery.error : null, retry: () => void spacesQuery.refetch() }
  const libraryStatus = { loading: libraryQuery.isPending, error: libraryQuery.isError ? libraryQuery.error : null, retry: () => void libraryQuery.refetch() }
  const [inbox, setInbox] = useState<InboxItem[]>(initialInbox)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [railCollapsed, setRailCollapsed] = useState(false)
  const [railPeek, setRailPeek] = useState(false)
  const [dialog, setDialog] = useState<'space' | 'source' | null>(null)
  const peekTimer = useRef<number | undefined>(undefined)
  const [query, setQuery] = useState('')
  const searchInput = useRef<HTMLInputElement>(null)
  const activeNoteId = view.startsWith('note:') ? view.slice(5) : null
  const activeNoteIdRef = useRef(activeNoteId)
  useEffect(() => { activeNoteIdRef.current = activeNoteId }, [activeNoteId])
  const activeNote = notes.find((note) => note.id === activeNoteId)
  const activeSpaceId = view.startsWith('space:') ? view.slice(6) : null
  const activeSpace = spaces.find((space) => space.id === activeSpaceId)
  const noteSpace = activeNote?.spaceId ? spaces.find((space) => space.id === activeNote.spaceId) : undefined

  useAbandonedUploadCleanup(user.id)
  // Send edits still waiting on this device: once on load, and again whenever the connection returns.
  useEffect(() => {
    const resume = () => { void authClient.getSession().then((result) => { if (result.data?.user) void resumePendingNotes(user.id, activeNoteIdRef.current ?? undefined) }) }
    resume()
    window.addEventListener('online', resume)
    return () => window.removeEventListener('online', resume)
  }, [user.id])
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
  function openNote(noteId: string, spaceId?: string) {
    setNoteContext(spaceId ? { noteId, spaceId } : null)
    navigate(`note:${noteId}`)
  }
  function openSource(sourceId: string | null) {
    setOpenSourceId(sourceId)
    if (sourceId && view !== 'library') navigate('library')
  }
  function createNote(options: { title?: string; spaceId?: string | null } = {}) {
    if (createNoteMutation.isPending) return
    createNoteMutation.mutate(createNoteVariables(options.title), {
      onSuccess: async (note) => {
        // Create directly in the Space: the note exists either way, so a failed move still opens it.
        if (options.spaceId) await spaceActions.addNote.mutateAsync({ spaceId: options.spaceId, noteId: note.id }).catch(() => {})
        openNote(note.id, options.spaceId ?? undefined)
      },
    })
  }
  async function deleteNote(noteId: string) {
    await deleteNoteMutation.mutateAsync(noteId)
    await noteSyncStore().remove(syncKey(user.id, noteId)).catch(() => {})
    void client.invalidateQueries({ queryKey: ['space-notes'] })
    void client.invalidateQueries({ queryKey: ['spaces', user.id] })
    navigate(noteContext?.noteId === noteId ? `space:${noteContext.spaceId}` : 'notes')
  }
  function shareNote(title: string) {
    const text = title || 'Untitled note'
    if (navigator.share) void navigator.share({ title: text, text }).catch(() => {})
    else void navigator.clipboard.writeText(text).catch(() => {})
  }
  function onNew(action: NewAction) {
    setMobileOpen(false)
    if (action === 'note') createNote({ spaceId: activeSpace?.status === 'ACTIVE' ? activeSpace.id : null })
    if (action === 'space') setDialog('space')
    if (action === 'source') setDialog('source')
  }

  const barLeading = <>
    <button type="button" onClick={() => setMobileOpen(true)} className="grid size-11 shrink-0 place-items-center rounded-lg text-foreground hover:bg-surface lg:hidden" aria-label="Open sidebar" aria-controls="workspace-mobile-sidebar" aria-expanded={mobileOpen}><AppIcon name="panel" className="size-5" /></button>
    <button type="button" onClick={toggleRail}
      // The pin control counts as part of the hover zone, so reaching for it keeps the rail open.
      onPointerEnter={(event) => { if (railCollapsed && railPeek && event.pointerType === 'mouse') schedulePeek(true) }}
      onPointerLeave={(event) => { if (railCollapsed && event.pointerType === 'mouse') schedulePeek(false) }}
      className="hidden size-11 place-items-center rounded-lg text-foreground hover:bg-surface lg:grid" aria-label={railCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={`${railCollapsed ? 'Expand' : 'Collapse'} sidebar (⌘\\)`} aria-controls="workspace-sidebar" aria-expanded={!railCollapsed}><AppIcon name="panel" className="size-5" /></button>
  </>
  const barTrailing = <InboxPopover items={inbox}
    createFrom={(item) => { createNote({ title: item.title }); setInbox((current) => current.filter((candidate) => candidate.id !== item.id)) }}
    dismiss={(id) => setInbox((current) => current.filter((item) => item.id !== id))} />

  const sidebarProps = { view, notes, spaces, sources, navigate, onNew, onOpenSource: openSource }
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
        {activeNoteId ? null : <div className="flex min-h-12 items-center gap-1.5 px-2 pt-1 sm:px-4">
          {barLeading}
          {viewLabel ? <span className="min-w-0 truncate px-1 text-sm text-muted">{viewLabel}</span> : null}
          <div className="ml-auto flex shrink-0 items-center gap-1">{barTrailing}</div>
        </div>}

        {view === 'home' ? <HomeView notes={notes} notesStatus={notesStatus} spaces={spaces} sources={sources} navigate={navigate} onNewNote={() => createNote()} /> : null}
        {view === 'search' ? <div ref={(element) => { searchInput.current = element?.querySelector('input') ?? null }}><SearchView notes={notes} spaces={spaces} sources={sources} query={query} setQuery={setQuery} navigate={navigate} onOpenSource={openSource} /></div> : null}
        {view === 'notes' ? <NotesView notes={notes} notesStatus={notesStatus} spaces={spaces} navigate={navigate} onNewNote={() => createNote()} /> : null}
        {view === 'spaces' ? <SpacesView spaces={spaces} status={spacesStatus} navigate={navigate} onNewSpace={() => setDialog('space')} /> : null}
        {view === 'library' ? <LibraryView userId={user.id} sources={sources} status={libraryStatus} spaces={spaces} navigate={navigate} openSourceId={openSourceId} onOpenSource={setOpenSourceId} onAdd={() => setDialog('source')} /> : null}
        {view === 'settings' ? <SettingsView /> : null}
        {activeSpace ? <SpaceView key={activeSpace.id} userId={user.id} space={activeSpace} notes={notes} sources={sources} navigate={navigate}
          onOpenNote={openNote} onCreateNote={(spaceId) => createNote({ spaceId })} onAddSource={() => setDialog('source')} /> : null}
        {activeSpaceId && !activeSpace && spacesQuery.isPending ? <PageFrame><span className="sr-only" role="status">Loading Space</span></PageFrame> : null}
        {activeSpaceId && !activeSpace && !spacesQuery.isPending ? <PageFrame><EmptyState icon="space" title="Space not found" body="It may have been deleted." action={<button type="button" onClick={() => navigate('spaces')} className={buttonSecondary}>All Spaces</button>} /></PageFrame> : null}
        {activeNoteId ? <NoteRoute key={activeNoteId} userId={user.id} noteId={activeNoteId} title={activeNote?.title ?? ''} space={noteSpace}
          leading={barLeading} trailing={barTrailing} onOpenSpace={(spaceId) => navigate(`space:${spaceId}`)} onShare={() => shareNote(activeNote?.title ?? '')}
          onDelete={() => deleteNote(activeNoteId)} onBack={() => navigate('notes')} /> : null}
      </section>
    </div>

    <SpaceFormDialog open={dialog === 'space'} onClose={() => setDialog(null)} onSubmit={async (draft) => { const space = await spaceActions.create.mutateAsync(createSpaceVariables(draft)); navigate(`space:${space.id}`) }} />
    <AddSourceDialog open={dialog === 'source'} onClose={() => setDialog(null)} spaces={spaces} notes={notes} defaultSpaceId={activeSpace?.status === 'ACTIVE' ? activeSpace.id : undefined}
      onSubmit={async (input, options) => {
        await addSourceToLibrary(input, notes, options)
        await Promise.all([client.invalidateQueries({ queryKey: libraryKey(user.id) }), ...input.spaceIds.map((spaceId) => client.invalidateQueries({ queryKey: ['space-sources', spaceId] }))])
      }} />
  </main>
}
