'use client'

import { AppProviders } from './AppProviders'
import { SessionGate, useCurrentUser } from './SessionGate'
import { AssistantPanel } from './assistant/AssistantPanel'
import { WorkspaceProviders } from './features/WorkspaceProviders'
import { useNavigation } from '@/hooks/use-navigation'
import { useSpaces } from '@/hooks/use-spaces'
import { useWorkspaceShortcuts } from '@/hooks/use-workspace-shortcuts'
import { useWorkspaceUI } from '@/hooks/use-workspace-ui'
import { LibraryView } from './workspace/LibraryView'
import { NoteRoute } from './workspace/NoteView'
import { SpaceView, SpacesView } from './workspace/SpaceViews'
import { useAbandonedUploadCleanup } from './workspace/useAssets'
import { EmptyState, PageFrame, TopBar, buttonSecondary } from './workspace/ui'
import { HomeView, NotesView } from './workspace/views'
import { ConnectionBanner, TopBarLeading, TopBarTrailing, WorkspaceDialogs, WorkspaceSidebar } from './workspace/WorkspaceChrome'
import { SIDE_PANEL_WIDTH } from './workspace/sidePanel'

export function Workspace() {
  return <AppProviders><SessionGate><WorkspaceProviders><WorkspaceShell /></WorkspaceProviders></SessionGate></AppProviders>
}

/** Layout only: sidebar, content box, right-hand panel column, and the workspace dialogs. */
function WorkspaceShell() {
  const user = useCurrentUser()
  const { mobileOpen, closeMobileSidebar, rail, panelsOpen, setPanelSlot } = useWorkspaceUI()
  const { activeNoteId } = useNavigation()
  useWorkspaceShortcuts()
  useAbandonedUploadCleanup(user.id)

  return <main data-workspace className="min-h-svh bg-surface lg:flex lg:h-svh lg:overflow-hidden">
    <div className={`relative hidden h-svh shrink-0 transition-[width] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none lg:block ${rail.expanded ? 'w-[17.5rem]' : 'w-16'}`}>
      <div
        id="workspace-sidebar"
        onPointerEnter={(event) => { if (rail.collapsed && event.pointerType === 'mouse') rail.schedulePeek(true) }}
        onPointerLeave={(event) => { if (rail.collapsed && event.pointerType === 'mouse') rail.schedulePeek(false) }}
        onFocus={(event) => { if (rail.collapsed && event.target.matches(':focus-visible')) rail.schedulePeek(true) }}
        onBlur={(event) => { if (rail.collapsed && !event.currentTarget.contains(event.relatedTarget)) rail.schedulePeek(false) }}
        onKeyDown={(event) => { if (event.key === 'Escape' && rail.peek) rail.schedulePeek(false) }}
        className={`absolute inset-y-0 left-0 overflow-hidden bg-surface transition-[width] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none ${rail.expanded ? 'w-[17.5rem]' : 'w-16'}`}
      >
        <div className="h-full w-[17.5rem]"><WorkspaceSidebar collapsed={!rail.expanded} /></div>
      </div>
    </div>
    <div className={`fixed inset-0 z-50 lg:hidden ${mobileOpen ? 'pointer-events-auto' : 'pointer-events-none'}`} aria-hidden={!mobileOpen} inert={!mobileOpen}>
      <button type="button" onClick={closeMobileSidebar} aria-label="Close sidebar" className={`absolute inset-0 size-full bg-foreground/30 transition-opacity duration-200 motion-reduce:transition-none ${mobileOpen ? 'opacity-100' : 'opacity-0'}`} />
      <div id="workspace-mobile-sidebar" className={`absolute inset-y-0 left-0 w-[min(17.5rem,82vw)] shadow-lg transition-transform duration-200 motion-reduce:transition-none ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}><WorkspaceSidebar onClose={closeMobileSidebar} /></div>
    </div>
    <div className="min-w-0 flex-1 p-2 lg:pl-0">
      {/* overflow-clip (not hidden) on small screens keeps the rounded corners without making this a
          scroll container, so the top bar can stick while the page scrolls. */}
      <section className="relative min-h-[calc(100svh-1rem)] overflow-clip overscroll-none rounded-[1.15rem] border border-default bg-raised lg:h-[calc(100svh-1rem)] lg:min-h-0 lg:overflow-y-auto" aria-label="Workspace content">
        {/* A note draws its own top bar (title, sync state, note actions). */}
        {activeNoteId ? <NoteRoute key={activeNoteId} noteId={activeNoteId} /> : <><PageTopBar /><Page /></>}
      </section>
    </div>
    {/* Right column: docked panels render here and push the content box, mirroring the sidebar. */}
    <div className={`relative hidden h-svh shrink-0 overflow-hidden transition-[width] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none lg:block ${panelsOpen ? SIDE_PANEL_WIDTH : 'w-0'}`}>
      <div ref={setPanelSlot} className={`absolute inset-y-0 left-0 ${SIDE_PANEL_WIDTH} py-2 pr-2`} />
    </div>

    <AssistantPanel />
    <WorkspaceDialogs />
  </main>
}

/** Top bar for every page except a note. */
function PageTopBar() {
  const { view } = useNavigation()
  const { activeSpace } = useSpaces()
  const label = view === 'spaces' ? 'Spaces' : view === 'library' ? 'Library' : view === 'notes' ? 'Notes' : activeSpace ? activeSpace.name : null
  return <TopBar banner={<ConnectionBanner />}>
    <TopBarLeading />
    {label ? <span className="min-w-0 truncate px-1 text-sm text-muted">{label}</span> : null}
    <div className="ml-auto flex shrink-0 items-center gap-1"><TopBarTrailing /></div>
  </TopBar>
}

/** The page for the current view (notes are routed separately). */
function Page() {
  const { view, activeSpaceId, navigate } = useNavigation()
  const { activeSpace, status } = useSpaces()
  if (view === 'home') return <HomeView />
  if (view === 'notes') return <NotesView />
  if (view === 'spaces') return <SpacesView />
  if (view === 'library') return <LibraryView />
  if (activeSpace) return <SpaceView key={activeSpace.id} space={activeSpace} />
  if (activeSpaceId && status.loading) return <PageFrame><span className="sr-only" role="status">Loading Space</span></PageFrame>
  if (activeSpaceId) return <PageFrame><EmptyState icon="space" title="Space not found" body="It may have been deleted." action={<button type="button" onClick={() => navigate('spaces')} className={buttonSecondary}>All Spaces</button>} /></PageFrame>
  return null
}
