'use client'

import { useEffect, useState } from 'react'
import { AppIcon } from '../AppIcon'
import { InboxPopover } from '../InboxPopover'
import { useImports } from '@/hooks/use-imports'
import { useLibrary } from '@/hooks/use-library'
import { useNavigation } from '@/hooks/use-navigation'
import { useNotes } from '@/hooks/use-notes'
import { useSpaces } from '@/hooks/use-spaces'
import { useWorkspaceUI } from '@/hooks/use-workspace-ui'
import { AddSourceDialog, SpaceFormDialog } from './dialogs'
import { ImportDialog, ImportTray } from './imports'
import { SettingsDialog } from './SettingsDialog'
import { Sidebar, type NewAction } from './Sidebar'
import { OfflineBanner } from './ui'

/**
 * Connection state for the banner. Background refreshes pause on their own while offline or hidden
 * (TanStack Query's online and focus managers) and resume on reconnect; note sync flushes then too.
 */
function useOnline() {
  const [online, setOnline] = useState(true)
  const [backOnline, setBackOnline] = useState(false)
  useEffect(() => {
    let timer: number | undefined
    let previous = true
    const update = () => {
      const next = navigator.onLine
      if (next && !previous) { setBackOnline(true); window.clearTimeout(timer); timer = window.setTimeout(() => setBackOnline(false), 4000) }
      previous = next
      setOnline(next)
    }
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); window.clearTimeout(timer) }
  }, [])
  return { online, backOnline }
}

/** Offline notice (or a brief "back online"), shown above the top bar. */
export function ConnectionBanner() {
  const { online, backOnline } = useOnline()
  return online ? (backOnline ? <OfflineBanner reconnected /> : null) : <OfflineBanner />
}

/** Sidebar toggles at the start of the top bar: a sheet on phones, the rail on desktop. */
export function TopBarLeading() {
  const { mobileOpen, openMobileSidebar, rail } = useWorkspaceUI()
  return <>
    <button type="button" onClick={openMobileSidebar} className="grid size-11 shrink-0 place-items-center rounded-lg text-foreground hover:bg-surface lg:hidden" aria-label="Open sidebar" aria-controls="workspace-mobile-sidebar" aria-expanded={mobileOpen}><AppIcon name="panel" className="size-5" /></button>
    <button type="button" onClick={rail.toggle}
      // The pin control counts as part of the hover zone, so reaching for it keeps the rail open.
      onPointerEnter={(event) => { if (rail.collapsed && rail.peek && event.pointerType === 'mouse') rail.schedulePeek(true) }}
      onPointerLeave={(event) => { if (rail.collapsed && event.pointerType === 'mouse') rail.schedulePeek(false) }}
      className="hidden size-11 place-items-center rounded-lg text-foreground hover:bg-surface lg:grid" aria-label={rail.collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={`${rail.collapsed ? 'Expand' : 'Collapse'} sidebar (⌘\\)`} aria-controls="workspace-sidebar" aria-expanded={!rail.collapsed}><AppIcon name="panel" className="size-5" /></button>
  </>
}

/** Chat and inbox at the end of the top bar. */
export function TopBarTrailing() {
  const { assistantOpen, toggleAssistant, inbox } = useWorkspaceUI()
  const { createNote } = useNotes()
  return <>
    <button type="button" onClick={toggleAssistant} aria-pressed={assistantOpen} aria-label="Chat with AI" title="Chat with AI (⌘J)"
      className={`grid size-11 shrink-0 place-items-center rounded-lg transition-colors hover:bg-surface hover:text-foreground ${assistantOpen ? 'bg-surface text-foreground' : 'text-muted'}`}><AppIcon name="sparkles" className="size-5" /></button>
    <InboxPopover items={inbox.items} createFrom={(item) => { createNote({ title: item.title }); inbox.dismiss(item.id) }} dismiss={inbox.dismiss} />
  </>
}

/**
 * The sidebar fed from the feature contexts. `Sidebar` itself stays props-only because the
 * landing page's showcase renders it with demo data.
 */
export function WorkspaceSidebar({ collapsed, onClose }: { collapsed?: boolean; onClose?: () => void }) {
  const { view, navigate, openSource } = useNavigation()
  const { notes, createNote } = useNotes()
  const { spaces, activeSpace } = useSpaces()
  const { sources } = useLibrary()
  const { openDialog, openImport, openSettings, closeMobileSidebar } = useWorkspaceUI()
  function onNew(action: NewAction) {
    closeMobileSidebar()
    if (action === 'note') createNote({ spaceId: activeSpace?.status === 'ACTIVE' ? activeSpace.id : null })
    if (action === 'space') openDialog('space')
    if (action === 'source') openDialog('source')
    if (action === 'import-file') openImport({ mode: 'file' })
    if (action === 'import-url') openImport({ mode: 'url' })
  }
  return <Sidebar view={view} notes={notes} spaces={spaces} sources={sources} navigate={navigate} onNew={onNew} onOpenSource={openSource} onOpenSettings={openSettings} collapsed={collapsed} onClose={onClose} />
}

/** Every workspace-level dialog and tray, driven by the UI context. */
export function WorkspaceDialogs() {
  const ui = useWorkspaceUI()
  const { openNote } = useNavigation()
  const { notes } = useNotes()
  const { spaces, activeSpace, createSpace } = useSpaces()
  const { addSource } = useLibrary()
  const { tracker } = useImports()
  return <>
    <SettingsDialog open={ui.settingsOpen} onClose={ui.closeSettings} />
    <ImportDialog open={Boolean(ui.importRequest)} mode={ui.importRequest?.mode ?? 'file'} intoNote={ui.importRequest?.intoNote} onClose={ui.closeImport} onStarted={tracker.track} />
    <ImportTray tracker={tracker} onOpenNote={(noteId) => openNote(noteId)} />
    <SpaceFormDialog open={ui.dialog === 'space'} onClose={ui.closeDialog} onSubmit={createSpace} />
    <AddSourceDialog open={ui.dialog === 'source'} onClose={ui.closeDialog} spaces={spaces} notes={notes} defaultSpaceId={activeSpace?.status === 'ACTIVE' ? activeSpace.id : undefined} onSubmit={addSource} />
  </>
}
