'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { InboxItem } from '@/components/product/InboxPopover'
import { createFeatureContext, useFeatureContext } from '@/components/product/features/createFeatureContext'
import type { ImportMode } from '@/components/product/workspace/imports'
import { PANEL_WIDTH_KEY, parsePanelWidth } from '@/components/product/workspace/panelWidthModel'
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
  /** The docked panel width the user chose (px), remembered on this device. The layout may show it narrower on a small window. */
  panelWidth: number
  setPanelWidth: (width: number) => void
  assistantOpen: boolean
  toggleAssistant: () => void
  closeAssistant: () => void
  /** Text handed to the chat box (e.g. "Ask AI about …" in ⌘K); `id` changes with each hand-off. */
  assistantPrompt: { id: number; text: string }
  /** Open the chat with this text in its box, ready to edit and send. */
  askAssistant: (text: string) => void
  /** The chat took the text; don't put it back if the chat reopens. */
  clearAssistantPrompt: () => void
  /** The ⌘K search bar. */
  searchOpen: boolean
  openSearch: () => void
  closeSearch: () => void
  toggleSearch: () => void
  settingsOpen: boolean
  openSettings: () => void
  closeSettings: () => void
  dialog: FormDialog
  openDialog: (dialog: Exclude<FormDialog, null>) => void
  closeDialog: () => void
  importRequest: ImportRequest
  openImport: (request: Exclude<ImportRequest, null>) => void
  closeImport: () => void
  inbox: { items: InboxItem[]; dismiss: (id: string) => void }
}

export const WorkspaceUIContext = createFeatureContext<WorkspaceUIValue>('WorkspaceUI')

/**
 * The workspace chrome's state: sidebar, rail, docked panels, dialogs, ⌘K search, inbox. No server
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
  const [searchOpen, setSearchOpen] = useState(false)
  const [assistantPrompt, setAssistantPrompt] = useState({ id: 0, text: '' })
  const [inboxItems, setInboxItems] = useState<InboxItem[]>(initialInbox)
  // Storage can be blocked (private windows); the default width is fine then.
  const [panelWidth, setPanelWidthState] = useState(() => { try { return parsePanelWidth(window.localStorage.getItem(PANEL_WIDTH_KEY)) } catch { return parsePanelWidth(null) } })
  const setPanelWidth = useCallback((width: number) => {
    setPanelWidthState(width)
    try { window.localStorage.setItem(PANEL_WIDTH_KEY, String(width)) } catch { /* not remembered, still applied */ }
  }, [])
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
    panelWidth,
    setPanelWidth,
    assistantOpen,
    toggleAssistant: () => setAssistantOpen((current) => !current),
    closeAssistant: () => { setAssistantOpen(false); setAssistantPrompt((current) => ({ ...current, text: '' })) },
    assistantPrompt,
    askAssistant: (text) => { setMobileOpen(false); setSearchOpen(false); setAssistantPrompt((current) => ({ id: current.id + 1, text })); setAssistantOpen(true) },
    clearAssistantPrompt: () => setAssistantPrompt((current) => (current.text ? { ...current, text: '' } : current)),
    searchOpen,
    openSearch: () => { setMobileOpen(false); setSearchOpen(true) },
    closeSearch: () => setSearchOpen(false),
    toggleSearch: () => { setMobileOpen(false); setSearchOpen((current) => !current) },
    settingsOpen,
    openSettings: () => { setMobileOpen(false); setSettingsOpen(true) },
    closeSettings: () => setSettingsOpen(false),
    dialog,
    openDialog: (next) => { setMobileOpen(false); setDialog(next) },
    closeDialog: () => setDialog(null),
    importRequest,
    openImport: (request) => { setMobileOpen(false); setImportRequest(request) },
    closeImport: () => setImportRequest(null),
    inbox: { items: inboxItems, dismiss: (id) => setInboxItems((current) => current.filter((item) => item.id !== id)) },
  }), [mobileOpen, railCollapsed, railPeek, panels.open, panels.setSlot, panelWidth, setPanelWidth, roomy, toggleRail, schedulePeek, assistantOpen, assistantPrompt, searchOpen, settingsOpen, dialog, importRequest, inboxItems])
}

/** Workspace chrome: sidebar, rail, docked panels, dialogs, ⌘K search, inbox. Must be used inside `WorkspaceProviders`. */
export function useWorkspaceUI(): WorkspaceUIValue {
  return useFeatureContext(WorkspaceUIContext)
}
