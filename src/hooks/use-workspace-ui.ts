'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { InboxItem } from '@/components/product/InboxPopover'
import { createFeatureContext, useFeatureContext } from '@/components/product/features/createFeatureContext'
import type { ImportMode } from '@/components/product/workspace/imports'
import { useMediaQuery, type useSidePanelHost } from '@/components/product/workspace/sidePanel'

type FormDialog = 'space' | 'source' | null
type ImportRequest = { mode: ImportMode; intoNote?: { id: string; title: string } } | null

const initialInbox: InboxItem[] = [
  { id: 'inbox-1', title: 'A question for later', detail: 'Why do some ideas stay with us long after a conversation?', when: 'Today' },
  { id: 'inbox-2', title: 'Something to read', detail: 'Return to the article you saved for your research.', when: 'Yesterday' },
  { id: 'inbox-3', title: 'A new connection', detail: 'Your city notes might connect to the observation in your journal.', when: 'Sep 21' },
]

export type WorkspaceUIValue = {
  /** Phone sidebar sheet. */
  mobileOpen: boolean
  openMobileSidebar: () => void
  closeMobileSidebar: () => void
  /** Desktop rail: collapsed by the user, or peeking open while hovered or focused. */
  rail: { collapsed: boolean; peek: boolean; expanded: boolean; toggle: () => void; schedulePeek: (open: boolean) => void }
  /** Whether a right-hand docked panel (chat, note context, history) is open. */
  panelsOpen: boolean
  /** Ref callback for the right-hand column the docked panels portal into. */
  setPanelSlot: (element: HTMLElement | null) => void
  assistantOpen: boolean
  toggleAssistant: () => void
  closeAssistant: () => void
  settingsOpen: boolean
  openSettings: () => void
  closeSettings: () => void
  dialog: FormDialog
  openDialog: (dialog: Exclude<FormDialog, null>) => void
  closeDialog: () => void
  importRequest: ImportRequest
  openImport: (request: Exclude<ImportRequest, null>) => void
  closeImport: () => void
  /** The Search page's query, kept while moving between pages. */
  searchQuery: string
  setSearchQuery: (query: string) => void
  inbox: { items: InboxItem[]; dismiss: (id: string) => void }
}

export const WorkspaceUIContext = createFeatureContext<WorkspaceUIValue>('WorkspaceUI')

/**
 * The workspace chrome's state: sidebar, rail, docked panels, dialogs, search query, inbox. No server
 * state. Runs once, in `WorkspaceUIProvider`, which also hosts the docked panels (`panels`).
 */
export function useWorkspaceUIState(panels: ReturnType<typeof useSidePanelHost>): WorkspaceUIValue {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [railCollapsed, setRailCollapsed] = useState(false)
  const [railPeek, setRailPeek] = useState(false)
  const peekTimer = useRef<number | undefined>(undefined)
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [dialog, setDialog] = useState<FormDialog>(null)
  const [importRequest, setImportRequest] = useState<ImportRequest>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [inboxItems, setInboxItems] = useState<InboxItem[]>(initialInbox)
  // A right panel pushes the content box from the right. Below 1280px both sides open at once would
  // squeeze it too thin, so the sidebar folds to its icon rail while a panel is open (hover still peeks).
  const roomy = useMediaQuery('(min-width: 1280px)')

  // The phone sheet closes on Escape, and when the window grows to the desktop layout.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setMobileOpen(false) }
    const desktop = window.matchMedia('(min-width: 1024px)')
    const onResize = () => { if (desktop.matches) setMobileOpen(false) }
    window.addEventListener('keydown', onKey)
    desktop.addEventListener('change', onResize)
    return () => { window.removeEventListener('keydown', onKey); desktop.removeEventListener('change', onResize) }
  }, [])
  useEffect(() => () => window.clearTimeout(peekTimer.current), [])

  // A collapsed rail opens (pushing the content aside) while hovered or keyboard-focused, and closes on leave.
  const schedulePeek = useCallback((open: boolean) => {
    window.clearTimeout(peekTimer.current)
    peekTimer.current = window.setTimeout(() => setRailPeek(open), open ? 120 : 220)
  }, [])
  const toggleRail = useCallback(() => {
    window.clearTimeout(peekTimer.current)
    setRailPeek(false)
    setRailCollapsed((current) => !current)
  }, [])

  return useMemo<WorkspaceUIValue>(() => ({
    mobileOpen,
    openMobileSidebar: () => setMobileOpen(true),
    closeMobileSidebar: () => setMobileOpen(false),
    rail: { collapsed: railCollapsed, peek: railPeek, expanded: (!railCollapsed && !(panels.open && !roomy)) || railPeek, toggle: toggleRail, schedulePeek },
    panelsOpen: panels.open,
    setPanelSlot: panels.setSlot,
    assistantOpen,
    toggleAssistant: () => setAssistantOpen((current) => !current),
    closeAssistant: () => setAssistantOpen(false),
    settingsOpen,
    openSettings: () => { setMobileOpen(false); setSettingsOpen(true) },
    closeSettings: () => setSettingsOpen(false),
    dialog,
    openDialog: (next) => { setMobileOpen(false); setDialog(next) },
    closeDialog: () => setDialog(null),
    importRequest,
    openImport: (request) => { setMobileOpen(false); setImportRequest(request) },
    closeImport: () => setImportRequest(null),
    searchQuery,
    setSearchQuery,
    inbox: { items: inboxItems, dismiss: (id) => setInboxItems((current) => current.filter((item) => item.id !== id)) },
  }), [mobileOpen, railCollapsed, railPeek, panels.open, panels.setSlot, roomy, toggleRail, schedulePeek, assistantOpen, settingsOpen, dialog, importRequest, searchQuery, inboxItems])
}

/** Workspace chrome: sidebar, rail, docked panels, dialogs, search query, inbox. Must be used inside `WorkspaceProviders`. */
export function useWorkspaceUI(): WorkspaceUIValue {
  return useFeatureContext(WorkspaceUIContext)
}
