'use client'

import dynamic from 'next/dynamic'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { DocumentBubbleToolbar, DocumentToolbarAction, DocumentFileUploads, DocumentFindBar, DocumentSlashMenu, revealBlockRange } from '../../../lib/document-editor'
import { TableHandle } from '@/components/tiptap-node/table-node/ui/table-handle'
import { TableSelectionOverlay } from '@/components/tiptap-node/table-node/ui/table-selection-overlay'
import { TableExtendRowColumnButtons } from '@/components/tiptap-node/table-node/ui/table-extend-row-column-button'
import { TableCellHandleMenu } from '@/components/tiptap-node/table-node/ui/table-cell-handle-menu'
import { incantlySlashMenuItems } from '../slashMenuItems'
import { AppIcon, type IconName } from '../AppIcon'
import { apiErrorMessage, isApiError } from '../../../lib/api/errors'
import { notesApi } from '../../../lib/api/notes'
import { loadDocument } from '../../../lib/notes/documentGate'
import type { SyncState } from '../../../lib/notes/noteSync'
import type { NoteSession } from './useNoteSession'
import { SidePanel } from './sidePanel'
import { DELETE_NOTE_COPY, deleteNoteTitle } from './trashModel'
import { revisionsKey, useNotesCache, useRevisions } from './useNotes'
import { useCurrentUser } from '../SessionGate'
import { useAddSelectionToChat } from '@/hooks/use-assistant'
import { useImports } from '@/hooks/use-imports'
import { useLiveCollab, useSavedSyncPoll } from '@/hooks/use-live-collab'
import { useYjsNoteBinding } from '@/lib/document-editor/yjsBinding'
import { selectCollabWriter, subscribeOnlineStatus } from '@/lib/document-editor/yjsDegraded'
import { writerKindForCollabMode, type NoteWriterKind } from '@/lib/document-editor/yjsFold'
import { useYjsFoldWriter } from '@/hooks/use-yjs-fold-writer'
import { useNavigation } from '@/hooks/use-navigation'
import { useNotes } from '@/hooks/use-notes'
import { useNotifications } from '@/hooks/use-notifications'
import { useSelectionPresence } from '@/hooks/use-selection-presence'
import { useNoteSuggestions } from '@/hooks/use-note-suggestions'
import { useSimulationFigure } from '@/hooks/use-simulations'
import { CHAT_SIMULATION_EVENT, hideSimulationPlaceholder, showSimulationPlaceholder, updateSimulationPlaceholder, type ChatSimulationDetail } from '@/lib/document-editor/simulationPlaceholder'
import { FigureChangePopup } from './FigureChangePopup'
import { useHeaderFooter } from '@/hooks/use-header-footer'
import { usePageSetup } from '@/hooks/use-page-setup'
import { useNoteExport } from '@/hooks/use-note-export'
import { ExportDialog } from './ExportDialog'
import { useSharing } from '@/hooks/use-sharing'
import { useSpaces } from '@/hooks/use-spaces'
import { useWorkspaceUI } from '@/hooks/use-workspace-ui'
import { DocumentAssetsProvider } from '../../../lib/document-editor/assetHost'
import { useNoteSession } from './useNoteSession'
import { libraryFollowUp, useServerAssetHost } from './useAssets'
import { ConnectionBanner, TopBarLeading, TopBarTrailing } from './WorkspaceChrome'
import { LiveCollabNotice, LivePresence } from './LivePresence'
import { CommentsPanel } from './CommentsPanel'
import { NoteContextPanel } from './NoteContextPanel'
import { NoteSourcesSection } from './NoteSourcesSection'
import { NoteSuggestionsBar } from './NoteSuggestionsBar'
import { PageSetupPanel } from './PageSetupPanel'
import { ActionMenu, ConfirmDialog, Dialog, EmptyState, ErrorState, ListSkeleton, PageFrame, SpaceGlyph, TopBar, buttonPrimary, buttonSecondary } from './ui'

const DocumentEditor = dynamic(
  () => import('../../../lib/document-editor').then((module) => module.DocumentEditor),
  { ssr: false, loading: () => <div className="mx-auto mt-20 h-28 w-full max-w-[46rem] animate-pulse rounded-2xl bg-surface" /> },
)

const WorkspaceTableCellMenu = ({ editor, onOpenChange, onResizeStart }: {
  editor?: Editor | null
  onOpenChange?: (isOpen: boolean) => void
  onResizeStart?: (handle: 'tl' | 'tr' | 'bl' | 'br' | null) => (event: React.MouseEvent) => void
}) => <TableCellHandleMenu editor={editor} onOpenChange={onOpenChange} onMouseDown={(event) => onResizeStart?.('br')(event)} />

const syncCopy: Record<SyncState['status'], { label: (state: SyncState) => string; icon: IconName; tone: string }> = {
  saved: { label: () => 'Saved', icon: 'checkCircle', tone: 'text-muted' },
  saving: { label: () => 'Saving…', icon: 'clock', tone: 'text-muted' },
  offline: { label: (state) => (state.pending ? `Offline · ${state.pending} pending` : 'Offline'), icon: 'alert', tone: 'text-muted' },
  conflict: { label: () => 'Conflict', icon: 'alert', tone: 'text-danger' },
  error: { label: () => 'Not saving', icon: 'alert', tone: 'text-danger' },
  gone: { label: () => 'Deleted', icon: 'trash', tone: 'text-danger' },
  denied: { label: () => 'Read only', icon: 'unlink', tone: 'text-muted' },
}

/** Saved · Saving · Offline (n pending) · Conflict, announced politely to assistive tech. */
function SyncIndicator({ state, cached, onResolve }: { state: SyncState | null; cached: boolean; onResolve: () => void }) {
  const copy = cached ? { label: () => 'Syncing…', icon: 'clock' as IconName, tone: 'text-muted' } : state ? syncCopy[state.status] : null
  const needsAction = state && (state.status === 'conflict' || state.status === 'error')
  const content = copy ? <><AppIcon name={copy.icon} className="size-4 shrink-0" /><span className="hidden sm:inline">{copy.label(state ?? { status: 'saved', pending: 0, revisionNumber: 0 })}</span></> : null
  return <span role="status" aria-live="polite" className="flex shrink-0 items-center">
    {needsAction
      ? <button type="button" onClick={onResolve} className={`flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold hover:bg-surface ${copy?.tone}`} aria-label={`${copy?.label(state)}. Resolve`}>{content}</button>
      : <span className={`flex min-h-11 items-center gap-1.5 px-2 text-xs ${copy?.tone ?? ''}`} aria-label={copy ? copy.label(state ?? { status: 'saved', pending: 0, revisionNumber: 0 }) : undefined}>{content}</span>}
  </span>
}

/** The note title in the top bar; renames go through sync as a full save after a short pause. */
function TitleInput({ title, disabled, onRename }: { title: string; disabled: boolean; onRename: (title: string) => void }) {
  const [value, setValue] = useState(title)
  const timer = useRef<number | undefined>(undefined)
  const editing = useRef(false)
  useEffect(() => { if (!editing.current) setValue(title) }, [title])
  useEffect(() => () => window.clearTimeout(timer.current), [])
  return <input value={value} disabled={disabled} maxLength={300}
    onFocus={() => { editing.current = true }}
    onBlur={() => { editing.current = false; window.clearTimeout(timer.current); if (value.trim()) onRename(value); else setValue(title) }}
    onChange={(event) => { const next = event.target.value; setValue(next); window.clearTimeout(timer.current); timer.current = window.setTimeout(() => { if (next.trim()) onRename(next) }, 800) }}
    onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }}
    // Edits in place like plain text: no ring or outline on focus; the caret shows where you type.
    aria-label="Note title" className="-mx-1.5 min-h-11 min-w-0 flex-1 bg-transparent px-1.5 font-display text-base text-foreground outline-none focus-visible:outline-none disabled:opacity-70" />
}

function HistoryDialog({ open, onClose, noteId, hasPending, onRestore, onAccessDenied }: { open: boolean; onClose: () => void; noteId: string; hasPending: boolean; onRestore: (revisionId: string) => Promise<void>; onAccessDenied: (error: unknown) => void }) {
  const revisions = useRevisions(noteId, open)
  const queryClient = useQueryClient()
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ id: string; document: ReturnType<typeof loadDocument> } | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // Latest callbacks for the effects below, whose deps must stay fetch-scoped to avoid refetch loops.
  const callbacks = useRef({ onClose, onAccessDenied })
  useEffect(() => { callbacks.current = { onClose, onAccessDenied } })

  function close() { setPreviewId(null); setPreview(null); onClose() }
  // Losing access mid-history is a mid-session denial, not a dialog error: drop the (now
  // unreadable) history cache, toast and go read-only via the session, and close the dialog.
  function denyAccess(error: unknown) {
    queryClient.removeQueries({ queryKey: revisionsKey(noteId) })
    callbacks.current.onAccessDenied(error)
    setPreviewId(null); setPreview(null)
    callbacks.current.onClose()
  }

  useEffect(() => {
    if (!open || !isApiError(revisions.error, 'NOTE_ACCESS_DENIED')) return
    // A denied revisions list means access was lost: same treatment as denyAccess, deferred past
    // the commit so the effect itself stays side-effect free.
    const error = revisions.error
    queueMicrotask(() => {
      queryClient.removeQueries({ queryKey: revisionsKey(noteId) })
      callbacks.current.onAccessDenied(error)
      setPreviewId(null); setPreview(null)
      callbacks.current.onClose()
    })
  }, [open, revisions.error, queryClient, noteId])

  useEffect(() => {
    if (!previewId) return
    const controller = new AbortController()
    notesApi.revision(noteId, previewId, controller.signal)
      .then((result) => setPreview({ id: previewId, document: loadDocument(result.document) }))
      .catch((cause) => {
        if (controller.signal.aborted) return
        if (isApiError(cause, 'NOTE_ACCESS_DENIED')) { queryClient.removeQueries({ queryKey: revisionsKey(noteId) }); callbacks.current.onAccessDenied(cause); setPreviewId(null); setPreview(null); callbacks.current.onClose(); return }
        setError(apiErrorMessage(cause))
      })
    return () => controller.abort()
  }, [noteId, previewId, queryClient])

  const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  async function restore() {
    if (!previewId) return
    setBusy(true); setError('')
    try { await onRestore(previewId); onClose() } catch (cause) {
      if (isApiError(cause, 'NOTE_ACCESS_DENIED')) { denyAccess(cause); return }
      setError(apiErrorMessage(cause))
    } finally { setBusy(false) }
  }

  return <>
    <SidePanel open={open} onClose={close} title="Version history" description="Restoring adds a new version; history is never rewritten."
      footer={previewId ? <><button type="button" onClick={() => { setPreviewId(null); setPreview(null) }} className={buttonSecondary}>Back</button><button type="button" disabled={busy} onClick={() => (hasPending ? setConfirm(true) : void restore())} className={buttonPrimary}><AppIcon name="restore" className="size-4" />{busy ? 'Restoring…' : 'Restore this version'}</button></> : undefined}>
      {error ? <div className="mb-4"><ErrorState message={error} /></div> : null}
      {previewId ? (preview?.id === previewId
        ? (preview.document.ok
          ? <div className="rounded-xl border border-default"><DocumentEditor key={previewId} initialDocument={preview.document.document} readonly ui="none" aria-label="Version preview" className="min-h-[20rem]" /></div>
          : <ErrorState message="This version can’t be previewed safely." />)
        : <ListSkeleton rows={3} label="Loading version" />)
        : revisions.isPending ? <ListSkeleton rows={5} label="Loading history" />
        : revisions.isError ? <ErrorState message={apiErrorMessage(revisions.error)} onRetry={() => void revisions.refetch()} />
        : <ul className="divide-y divide-default">
          {revisions.data?.map((revision, index) => <li key={revision.id}>
            <button type="button" onClick={() => setPreviewId(revision.id)} className="flex min-h-14 w-full items-center gap-3 rounded-lg px-2 text-left hover:bg-surface">
              <AppIcon name={revision.kind === 'restore' ? 'restore' : revision.kind === 'import' ? 'import' : 'history'} className="size-4 shrink-0 text-muted" />
              <span className="min-w-0 flex-1"><span className="block text-sm text-foreground">{dateFormat.format(new Date(revision.createdAt))}</span><span className="block text-xs text-muted">Version {revision.revisionNumber}{index === 0 ? ' · Current' : ''}{revision.kind === 'restore' ? ' · Restored' : revision.kind === 'import' ? ' · Imported' : revision.origin === 'ai' ? ' · Edited by AI, accepted by you' : ''}</span></span>
              <AppIcon name="chevron" className="size-4 shrink-0 text-subtle" />
            </button>
          </li>)}
        </ul>}
    </SidePanel>
    <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} title="Replace unsaved edits?" confirmLabel="Restore anyway" destructive
      body="This note has edits that haven’t reached the server yet. Restoring this version replaces them." onConfirm={() => void restore()} />
  </>
}

function ConflictDialog({ open, onClose, state, onKeepMine, onTakeServer, onAccessDenied }: { open: boolean; onClose: () => void; state: SyncState | null; onKeepMine: () => Promise<void>; onTakeServer: () => Promise<void>; onAccessDenied: (error: unknown) => void }) {
  const [busy, setBusy] = useState<'mine' | 'server' | null>(null)
  const [error, setError] = useState('')
  async function run(kind: 'mine' | 'server', action: () => Promise<void>) {
    setBusy(kind); setError('')
    try { await action(); onClose() } catch (cause) {
      // A denied checkpoint read means access was lost: toast + read-only via the session, not inline text.
      if (isApiError(cause, 'NOTE_ACCESS_DENIED')) { onAccessDenied(cause); onClose(); return }
      setError(apiErrorMessage(cause))
    } finally { setBusy(null) }
  }
  const isConflict = state?.status === 'conflict'
  // An error wedge (e.g. a transaction the server keeps rejecting) offers the same
  // escape hatch as a conflict: without it the only action re-sends the payload
  // that already failed, and the note can never resume syncing.
  const canTakeServer = isConflict || state?.status === 'error'
  return <Dialog open={open} onClose={onClose} title={isConflict ? 'This note changed elsewhere' : 'Saving paused'}
    description={state?.message}
    footer={<>
      {canTakeServer ? <button type="button" disabled={Boolean(busy)} onClick={() => void run('server', onTakeServer)} className={buttonSecondary}>{busy === 'server' ? 'Loading…' : 'Use the latest version'}</button> : null}
      <button type="button" disabled={Boolean(busy)} onClick={() => void run('mine', onKeepMine)} className={buttonPrimary}>{busy === 'mine' ? 'Saving…' : isConflict ? 'Keep my version' : 'Save my version'}</button>
    </>}>
    <p className="text-sm leading-6 text-muted">{isConflict
      ? 'Your edits overlap with a newer version saved on another device or tab. Keep your version to save it as the newest, or load the latest version and discard the edits made here.'
      : 'Your edits are safe on this device. Save your version to continue syncing it as the newest version, or load the latest version and discard the edits made here.'}</p>
    {error ? <p role="alert" className="mt-3 text-sm text-danger">{error}</p> : null}
  </Dialog>
}

/** One open note: its session (load, sync, history) plus the screen. Mounted per note id. */
export function NoteRoute({ noteId }: { noteId: string }) {
  // Single-writer selection (Yjs migration): the server flag plus live room
  // state picks exactly one persistence writer per open note. The scope below
  // remounts on a flip (teardown flushes pending work first), so the note is
  // never without a writer and never has two.
  const { collabMode, connection, mode } = useLiveCollab()
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine)
  useEffect(() => subscribeOnlineStatus(setOnline), [])
  const writerKind: NoteWriterKind = useMemo(() => {
    const writer = selectCollabWriter({ collabMode: collabMode ?? 'legacy', connection, online, liveMode: mode })
    return writerKindForCollabMode(writer === 'yjs' ? 'yjs' : 'legacy')
  }, [collabMode, connection, mode, online])
  return <NoteSessionScope key={`${noteId}:${writerKind}`} noteId={noteId} writerKind={writerKind} />
}

function NoteSessionScope({ noteId, writerKind }: { noteId: string; writerKind: NoteWriterKind }) {
  const user = useCurrentUser()
  const cache = useNotesCache(user.id)
  const { registerNoteReloader } = useImports()
  const session = useNoteSession(user.id, noteId, {
    writerKind,
    onAck: (_revision, title) => cache.upsert({ id: noteId, updatedAt: new Date().toISOString(), ...(title ? { title } : {}) }),
  })
  // An import into this note finished: show it now, unless local edits are still on their way.
  const sessionRef = useRef(session)
  useEffect(() => { sessionRef.current = session })
  useEffect(() => registerNoteReloader(noteId, () => {
    const current = sessionRef.current
    if (current.phase === 'ready' && !current.sync?.pending) void current.applyServerHead('import').catch(() => {})
  }), [registerNoteReloader, noteId])
  const assets = useServerAssetHost(user.id)
  return <DocumentAssetsProvider host={assets}><NoteScreen noteId={noteId} session={session} /></DocumentAssetsProvider>
}

/** The note's top bar, editor, and side panels. Everything beyond the session comes from the feature contexts. */
export function NoteScreen({ noteId, session }: { noteId: string; session: NoteSession }) {
  const { navigate, focusBlock: requestedBlock, focusThread: requestedThread } = useNavigation()
  const { activeNote, deleteNote } = useNotes()
  const { noteSpace: space } = useSpaces()
  const { openShareDialog } = useSharing()
  const { noteId: liveNoteId, room, connection, collabMode } = useLiveCollab()
  const { noteMuted, toggleNoteMute, muting, prefsLoading } = useNotifications()
  // Shared when the list says so, or live-status confirmed it (the list can lag a fresh share).
  const shared = (activeNote?.shared ?? false) || liveNoteId === noteId
  useSavedSyncPoll(noteId, session)
  // Yjs realtime (migration Phase 1, flagged notes only): the binding owns the
  // note's Yjs doc and room provider. Null keeps the legacy editor untouched.
  const yjsBinding = useYjsNoteBinding({ noteId, seed: session.document, room, roomSettled: room != null || connection === 'unavailable', collabMode })
  // Canonical fold (migration Phase 2): when live, Yjs updates persist through
  // the fold and legacy editor transactions must not record (double submit).
  const foldLive = useYjsFoldWriter({ noteId, binding: yjsBinding, session, editable: session.phase === 'ready' && session.canEdit })
  const { openImport } = useWorkspaceUI()
  const title = activeNote?.title ?? ''
  /** A passage to jump to (from search); `nonce` repeats the jump for the same blocks. */
  const focusBlock = requestedBlock?.noteId === noteId ? requestedBlock : null
  const onImport = (mode: 'file' | 'url') => openImport({ mode, intoNote: { id: noteId, title } })
  const onOpenSpace = (spaceId: string) => navigate(`space:${spaceId}`)
  // Delete failures surface as a toast from the mutation cache, so there is nothing to render here.
  const onDelete = () => deleteNote(noteId).catch(() => {})
  const onBack = () => navigate('notes')
  const [contextOpen, setContextOpen] = useState(false)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [pageSetupOpen, setPageSetupOpen] = useState(false)
  const [findOpen, setFindOpen] = useState(false)
  const editorRef = useRef<Editor | null>(null)
  const [editorReady, setEditorReady] = useState(0)
  const [editor, setEditor] = useState<Editor | null>(null)
  const review = useNoteSuggestions(noteId, session, editor)
  const selectionToChat = useAddSelectionToChat(noteId, session)
  const simulation = useSimulationFigure(noteId, session, editor)
  // Remote carets and selections render once both the editor and the room exist.
  useSelectionPresence(editor, room)
  // An assistant run generating into this note draws its progress here, at the end where the
  // figure will attach. Other notes' jobs are ignored; a reload drops the widget anyway.
  useEffect(() => {
    const shown = new Set<string>()
    const onChatSimulation = (event: Event) => {
      const detail = (event as CustomEvent<ChatSimulationDetail>).detail
      if (!detail || detail.noteId !== noteId) return
      const live = editorRef.current
      if (!live || live.isDestroyed) return
      const key = `chat:${detail.jobId}`
      if (detail.phase === 'hide') {
        if (!shown.delete(key)) return
        hideSimulationPlaceholder(live, key, false)
        return
      }
      if (!shown.has(key)) {
        shown.add(key)
        showSimulationPlaceholder(live, {
          key,
          anchorNodeId: null,
          label: detail.label,
          energy: detail.energy,
          onRetry: () => {},
          onDismiss: () => {},
        })
        return
      }
      updateSimulationPlaceholder(live, key, detail.label, detail.energy)
    }
    window.addEventListener(CHAT_SIMULATION_EVENT, onChatSimulation)
    return () => window.removeEventListener(CHAT_SIMULATION_EVENT, onChatSimulation)
  }, [noteId])
  const [missingBlock, setMissingBlock] = useState(false)
  // Jump to a cited passage once the editor (re)loads; the nonce repeats a jump to the same block.
  useEffect(() => {
    const editor = editorRef.current
    if (!focusBlock || !editor || editor.isDestroyed) return
    setMissingBlock(!revealBlockRange(editor, focusBlock.blockId, focusBlock.endBlockId))
  }, [focusBlock, editorReady])
  // A `?thread=` deep link opens the comments panel; the panel scrolls to and highlights the thread.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- open the panel when a thread link arrives
    if (requestedThread?.noteId === noteId) setCommentsOpen(true)
  }, [requestedThread, noteId])
  const [dialog, setDialog] = useState<'history' | 'delete' | 'conflict' | null>(null)
  const [renamed, setRenamed] = useState<string | null>(null)
  const editable = session.phase === 'ready' && session.canEdit && session.sync?.status !== 'gone' && session.sync?.status !== 'denied'
  const pageSetup = usePageSetup(editor, editable)
  const headerFooter = useHeaderFooter(editor, editable)
  // The loaded document keeps its original title; a rename made here wins until the list catches up.
  const shownTitle = renamed ?? (title || session.document?.metadata.title || '')
  const noteExport = useNoteExport(editor, session.document ?? null, shownTitle)
  const rename = (next: string) => { setRenamed(next.trim()); session.rename(next) }

  return <>
    <TopBar banner={<ConnectionBanner />}>
      <TopBarLeading />
      <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-1.5">
        {space ? <><button type="button" onClick={() => onOpenSpace(space.id)} className="flex min-h-11 max-w-[40%] shrink items-center gap-1.5 rounded-lg px-1.5 text-sm text-muted hover:bg-surface hover:text-foreground"><SpaceGlyph icon={space.icon} size="sm" /><span className="truncate">{space.name}</span></button><span aria-hidden="true" className="text-subtle">/</span></> : null}
        <TitleInput key={noteId} title={shownTitle} disabled={!editable} onRename={rename} />
      </nav>
      <div className="ml-auto flex shrink-0 items-center gap-0.5">
        <LivePresence />
        {session.phase === 'ready' || session.phase === 'cached' ? <SyncIndicator state={session.sync} cached={session.phase === 'cached'} onResolve={() => setDialog('conflict')} /> : null}
        <ActionMenu label="Note actions" items={[
          { label: 'Find in note', icon: 'search', hint: '⌘F', onSelect: () => setFindOpen(true), disabled: !session.document },
          { label: 'Note context', icon: 'link', onSelect: () => setContextOpen(true) },
          ...(shared ? [{ label: 'Comments', icon: 'comment' as const, onSelect: () => setCommentsOpen(true) }] : []),
          { label: 'Page setup', icon: 'paper', onSelect: () => setPageSetupOpen(true), disabled: !session.document },
          { label: 'Export…', icon: 'upload', onSelect: noteExport.show, disabled: !editor },
          { label: 'Version history', icon: 'history', onSelect: () => setDialog('history'), disabled: session.phase !== 'ready' },
          { label: 'Import file into note', icon: 'import', onSelect: () => onImport('file'), disabled: !editable },
          { label: 'Import web page into note', icon: 'globe', onSelect: () => onImport('url'), disabled: !editable },
          { label: 'Share…', icon: 'share', onSelect: () => openShareDialog(noteId) },
          { label: noteMuted(noteId) ? 'Unmute email for this note' : 'Mute email for this note', icon: 'bell', onSelect: () => toggleNoteMute(noteId), disabled: muting || prefsLoading },
          { label: 'Delete note', icon: 'trash', destructive: true, onSelect: () => setDialog('delete') },
        ]} />
        <TopBarTrailing />
      </div>
    </TopBar>

    {session.phase === 'loading' ? <div className="mx-auto mt-16 h-28 w-full max-w-[46rem] animate-pulse rounded-2xl bg-surface motion-reduce:animate-none" role="status" aria-label="Loading note" /> : null}
    {session.phase === 'not-found' || session.sync?.status === 'gone' ? <PageFrame><EmptyState icon="document" title="Note not found" body="It may have been deleted, or it belongs to another account." action={<button type="button" onClick={onBack} className={buttonSecondary}>All notes</button>} /></PageFrame> : null}
    {session.phase === 'no-access' ? <PageFrame><EmptyState icon="unlink" title="You no longer have access" body="The owner stopped sharing this note with you, or it was deleted. Ask the owner to share it again." action={<button type="button" onClick={onBack} className={buttonSecondary}>All notes</button>} /></PageFrame> : null}
    {session.phase === 'error' ? <PageFrame><ErrorState message={session.errorMessage ?? 'This note couldn’t be opened.'} onRetry={session.retry} /></PageFrame> : null}

    {session.document && (session.phase === 'ready' || session.phase === 'cached') && session.sync?.status !== 'gone' ? <>
      {session.phase === 'cached' ? <p role="status" className="mx-auto mt-2 w-fit rounded-full bg-surface px-3 py-1 text-xs text-muted">{session.errorMessage ? `${session.errorMessage} Showing the copy saved on this device.` : 'Showing your saved copy while the latest version loads…'}</p> : null}
      {missingBlock ? <p role="status" className="mx-auto mt-2 w-fit rounded-full bg-surface px-3 py-1 text-xs text-muted">That passage has changed since it was indexed, so it can’t be highlighted.</p> : null}
      {selectionToChat.error ? <p role="status" className="mx-auto mt-2 flex w-fit items-center gap-1 rounded-full bg-surface pl-3 text-xs text-muted">{selectionToChat.error}<button type="button" onClick={selectionToChat.dismissError} aria-label="Dismiss" className="grid size-8 place-items-center rounded-full hover:text-foreground"><AppIcon name="close" className="size-3.5" /></button></p> : null}
      <LiveCollabNotice />
      {session.repaired ? <p role="status" className="mx-auto mt-2 w-fit rounded-full bg-surface px-3 py-1 text-xs text-muted">Some content in this note was repaired when it opened.</p> : null}
      {/* No full-height stretch: the top bar shares this scroll box, so an empty note would scroll by its height. */}
      <div>
          <DocumentEditor key={yjsBinding ? `${noteId}:${session.version}:${editable}:yjs:${yjsBinding.epoch}` : `${noteId}:${session.version}:${editable}`} initialDocument={session.document} collaboration={yjsBinding ?? undefined} readonly={!editable} ui="none" aria-label={`Edit ${shownTitle}`} placeholder="Start writing, or type “/” to see commands…"
            onReady={(ready) => { editorRef.current = ready; setEditor(ready); setEditorReady((value) => value + 1) }}
            onChange={(document, event) => { if (!foldLive) session.record({ mode: event.mode, operations: event.operations, document }) }}>
            <DocumentBubbleToolbar leading={(current) => <><DocumentToolbarAction label="Add to chat" onRun={() => void selectionToChat.addToChat(current)}><AppIcon name="sparkles" className="size-4" /><span>Add to chat</span></DocumentToolbarAction><DocumentToolbarAction label="Generate simulation" onRun={() => simulation.generate(current)}><AppIcon name="play" className="size-4" /><span>Generate simulation</span></DocumentToolbarAction></>} /><DocumentSlashMenu items={incantlySlashMenuItems} /><TableHandle /><TableSelectionOverlay showResizeHandles cellMenu={WorkspaceTableCellMenu} /><TableExtendRowColumnButtons /><DocumentFileUploads afterUpload={libraryFollowUp} /><DocumentFindBar open={findOpen} onOpenChange={setFindOpen} showToggle={false} />
          </DocumentEditor>
          <FigureChangePopup editor={editor} session={session} />
          <NoteSuggestionsBar review={review} />
      </div>
    </> : null}

    <SidePanel open={contextOpen} onClose={() => setContextOpen(false)} title="Context" description="What this note draws on."><div className="-mx-5 -my-5">
      <NoteSourcesSection />
      <NoteContextPanel noteId={noteId} />
    </div></SidePanel>
    <SidePanel open={pageSetupOpen} onClose={() => { setPageSetupOpen(false); pageSetup.clearError() }} title="Page setup" description="Paper, margins, headers and footers for this note.">
      <PageSetupPanel state={pageSetup} headerFooter={headerFooter} />
    </SidePanel>
    {shared ? <SidePanel open={commentsOpen} onClose={() => setCommentsOpen(false)} title="Comments" description="Threads, replies and @mentions on this note.">
      <CommentsPanel noteId={noteId} />
    </SidePanel> : null}
    <ExportDialog state={noteExport} onOpenPageSetup={() => { noteExport.close(); setPageSetupOpen(true) }} />
    <HistoryDialog open={dialog === 'history'} onClose={() => setDialog(null)} noteId={noteId} hasPending={(session.sync?.pending ?? 0) > 0} onRestore={session.restore} onAccessDenied={session.markAccessDenied} />
    <ConflictDialog open={dialog === 'conflict'} onClose={() => setDialog(null)} state={session.sync} onKeepMine={session.keepMine} onTakeServer={session.takeServer} onAccessDenied={session.markAccessDenied} />
    <ConfirmDialog open={dialog === 'delete'} onClose={() => setDialog(null)} destructive confirmLabel={DELETE_NOTE_COPY.confirmLabel} title={deleteNoteTitle(shownTitle)}
      body={DELETE_NOTE_COPY.body} onConfirm={() => void onDelete()} />
  </>
}
