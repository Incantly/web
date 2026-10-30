'use client'

import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { DocumentBubbleToolbar, DocumentFileUploads, DocumentFindBar, DocumentSlashMenu, revealBlockRange } from '../../../lib/document-editor'
import { TableHandle } from '@/components/tiptap-node/table-node/ui/table-handle'
import { TableSelectionOverlay } from '@/components/tiptap-node/table-node/ui/table-selection-overlay'
import { TableExtendRowColumnButtons } from '@/components/tiptap-node/table-node/ui/table-extend-row-column-button'
import { TableCellHandleMenu } from '@/components/tiptap-node/table-node/ui/table-cell-handle-menu'
import { incantlySlashMenuItems } from '../slashMenuItems'
import { AppIcon, type IconName } from '../AppIcon'
import { apiErrorMessage } from '../../../lib/api/errors'
import { notesApi } from '../../../lib/api/notes'
import { loadDocument } from '../../../lib/notes/documentGate'
import type { SyncState } from '../../../lib/notes/noteSync'
import type { NoteSession } from './useNoteSession'
import { SidePanel } from './sidePanel'
import { useNotesCache, useRevisions } from './useNotes'
import { useCurrentUser } from '../SessionGate'
import { useImports } from '@/hooks/use-imports'
import { useNavigation } from '@/hooks/use-navigation'
import { useNotes } from '@/hooks/use-notes'
import { useSpaces } from '@/hooks/use-spaces'
import { useWorkspaceUI } from '@/hooks/use-workspace-ui'
import { DocumentAssetsProvider } from '../../../lib/document-editor/assetHost'
import { useNoteSession } from './useNoteSession'
import { libraryFollowUp, useServerAssetHost } from './useAssets'
import { ConnectionBanner, TopBarLeading, TopBarTrailing } from './WorkspaceChrome'
import { NoteContextPanel } from './NoteContextPanel'
import { NoteSourcesSection } from './NoteSourcesSection'
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

function HistoryDialog({ open, onClose, noteId, hasPending, onRestore }: { open: boolean; onClose: () => void; noteId: string; hasPending: boolean; onRestore: (revisionId: string) => Promise<void> }) {
  const revisions = useRevisions(noteId, open)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ id: string; document: ReturnType<typeof loadDocument> } | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!previewId) return
    const controller = new AbortController()
    notesApi.revision(noteId, previewId, controller.signal)
      .then((result) => setPreview({ id: previewId, document: loadDocument(result.document) }))
      .catch((cause) => { if (!controller.signal.aborted) setError(apiErrorMessage(cause)) })
    return () => controller.abort()
  }, [noteId, previewId])

  const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  async function restore() {
    if (!previewId) return
    setBusy(true); setError('')
    try { await onRestore(previewId); onClose() } catch (cause) { setError(apiErrorMessage(cause)) } finally { setBusy(false) }
  }

  return <>
    <SidePanel open={open} onClose={() => { setPreviewId(null); setPreview(null); onClose() }} title="Version history" description="Restoring adds a new version; history is never rewritten."
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
              <span className="min-w-0 flex-1"><span className="block text-sm text-foreground">{dateFormat.format(new Date(revision.createdAt))}</span><span className="block text-xs text-muted">Version {revision.revisionNumber}{index === 0 ? ' · Current' : ''}{revision.kind === 'restore' ? ' · Restored' : revision.kind === 'import' ? ' · Imported' : ''}</span></span>
              <AppIcon name="chevron" className="size-4 shrink-0 text-subtle" />
            </button>
          </li>)}
        </ul>}
    </SidePanel>
    <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} title="Replace unsaved edits?" confirmLabel="Restore anyway" destructive
      body="This note has edits that haven’t reached the server yet. Restoring this version replaces them." onConfirm={() => void restore()} />
  </>
}

function ConflictDialog({ open, onClose, state, onKeepMine, onTakeServer }: { open: boolean; onClose: () => void; state: SyncState | null; onKeepMine: () => Promise<void>; onTakeServer: () => Promise<void> }) {
  const [busy, setBusy] = useState<'mine' | 'server' | null>(null)
  const [error, setError] = useState('')
  async function run(kind: 'mine' | 'server', action: () => Promise<void>) {
    setBusy(kind); setError('')
    try { await action(); onClose() } catch (cause) { setError(apiErrorMessage(cause)) } finally { setBusy(null) }
  }
  const isConflict = state?.status === 'conflict'
  return <Dialog open={open} onClose={onClose} title={isConflict ? 'This note changed elsewhere' : 'Saving paused'}
    description={state?.message}
    footer={<>
      {isConflict ? <button type="button" disabled={Boolean(busy)} onClick={() => void run('server', onTakeServer)} className={buttonSecondary}>{busy === 'server' ? 'Loading…' : 'Use the latest version'}</button> : null}
      <button type="button" disabled={Boolean(busy)} onClick={() => void run('mine', onKeepMine)} className={buttonPrimary}>{busy === 'mine' ? 'Saving…' : isConflict ? 'Keep my version' : 'Save my version'}</button>
    </>}>
    <p className="text-sm leading-6 text-muted">{isConflict
      ? 'Your edits overlap with a newer version saved on another device or tab. Keep your version to save it as the newest, or load the latest version and discard the edits made here.'
      : 'Your edits are safe on this device. Save your version to continue syncing it as the newest version.'}</p>
    {error ? <p role="alert" className="mt-3 text-sm text-danger">{error}</p> : null}
  </Dialog>
}

/** One open note: its session (load, sync, history) plus the screen. Mounted per note id. */
export function NoteRoute({ noteId }: { noteId: string }) {
  const user = useCurrentUser()
  const cache = useNotesCache(user.id)
  const { registerNoteReloader } = useImports()
  const session = useNoteSession(user.id, noteId, {
    onAck: (_revision, title) => cache.upsert({ id: noteId, updatedAt: new Date().toISOString(), ...(title ? { title } : {}) }),
  })
  // An import into this note finished: show it now, unless local edits are still on their way.
  const sessionRef = useRef(session)
  useEffect(() => { sessionRef.current = session })
  useEffect(() => registerNoteReloader(noteId, () => {
    const current = sessionRef.current
    if (current.phase === 'ready' && !current.sync?.pending) void current.takeServer().catch(() => {})
  }), [registerNoteReloader, noteId])
  const assets = useServerAssetHost(user.id)
  return <DocumentAssetsProvider host={assets}><NoteScreen noteId={noteId} session={session} /></DocumentAssetsProvider>
}

/** The note's top bar, editor, and side panels. Everything beyond the session comes from the feature contexts. */
export function NoteScreen({ noteId, session }: { noteId: string; session: NoteSession }) {
  const { navigate, focusBlock: requestedBlock } = useNavigation()
  const { activeNote, deleteNote, shareNote } = useNotes()
  const { noteSpace: space } = useSpaces()
  const { openImport } = useWorkspaceUI()
  const title = activeNote?.title ?? ''
  /** A passage to jump to (from search); `nonce` repeats the jump for the same blocks. */
  const focusBlock = requestedBlock?.noteId === noteId ? requestedBlock : null
  const onImport = (mode: 'file' | 'url') => openImport({ mode, intoNote: { id: noteId, title } })
  const onOpenSpace = (spaceId: string) => navigate(`space:${spaceId}`)
  const onShare = () => shareNote(noteId)
  const onDelete = () => deleteNote(noteId)
  const onBack = () => navigate('notes')
  const [contextOpen, setContextOpen] = useState(false)
  const [findOpen, setFindOpen] = useState(false)
  const editorRef = useRef<Editor | null>(null)
  const [editorReady, setEditorReady] = useState(0)
  const [missingBlock, setMissingBlock] = useState(false)
  // Jump to a cited passage once the editor (re)loads; the nonce repeats a jump to the same block.
  useEffect(() => {
    const editor = editorRef.current
    if (!focusBlock || !editor || editor.isDestroyed) return
    setMissingBlock(!revealBlockRange(editor, focusBlock.blockId, focusBlock.endBlockId))
  }, [focusBlock, editorReady])
  const [dialog, setDialog] = useState<'history' | 'delete' | 'conflict' | null>(null)
  const [renamed, setRenamed] = useState<string | null>(null)
  const editable = session.phase === 'ready' && session.sync?.status !== 'gone'
  // The loaded document keeps its original title; a rename made here wins until the list catches up.
  const shownTitle = renamed ?? (title || session.document?.metadata.title || '')
  const rename = (next: string) => { setRenamed(next.trim()); session.rename(next) }

  return <>
    <TopBar banner={<ConnectionBanner />}>
      <TopBarLeading />
      <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-1.5">
        {space ? <><button type="button" onClick={() => onOpenSpace(space.id)} className="flex min-h-11 max-w-[40%] shrink items-center gap-1.5 rounded-lg px-1.5 text-sm text-muted hover:bg-surface hover:text-foreground"><SpaceGlyph icon={space.icon} size="sm" /><span className="truncate">{space.name}</span></button><span aria-hidden="true" className="text-subtle">/</span></> : null}
        <TitleInput key={noteId} title={shownTitle} disabled={!editable} onRename={rename} />
      </nav>
      <div className="ml-auto flex shrink-0 items-center gap-0.5">
        {session.phase === 'ready' || session.phase === 'cached' ? <SyncIndicator state={session.sync} cached={session.phase === 'cached'} onResolve={() => setDialog('conflict')} /> : null}
        <ActionMenu label="Note actions" items={[
          { label: 'Find in note', icon: 'search', hint: '⌘F', onSelect: () => setFindOpen(true), disabled: !session.document },
          { label: 'Note context', icon: 'link', onSelect: () => setContextOpen(true) },
          { label: 'Version history', icon: 'history', onSelect: () => setDialog('history'), disabled: session.phase !== 'ready' },
          { label: 'Import file into note', icon: 'import', onSelect: () => onImport('file'), disabled: !editable },
          { label: 'Import web page into note', icon: 'globe', onSelect: () => onImport('url'), disabled: !editable },
          { label: 'Share summary', icon: 'share', onSelect: onShare },
          { label: 'Delete note', icon: 'trash', destructive: true, onSelect: () => setDialog('delete') },
        ]} />
        <TopBarTrailing />
      </div>
    </TopBar>

    {session.phase === 'loading' ? <div className="mx-auto mt-16 h-28 w-full max-w-[46rem] animate-pulse rounded-2xl bg-surface motion-reduce:animate-none" role="status" aria-label="Loading note" /> : null}
    {session.phase === 'not-found' || session.sync?.status === 'gone' ? <PageFrame><EmptyState icon="document" title="Note not found" body="It may have been deleted, or it belongs to another account." action={<button type="button" onClick={onBack} className={buttonSecondary}>All notes</button>} /></PageFrame> : null}
    {session.phase === 'error' ? <PageFrame><ErrorState message={session.errorMessage ?? 'This note couldn’t be opened.'} onRetry={session.retry} /></PageFrame> : null}

    {session.document && (session.phase === 'ready' || session.phase === 'cached') && session.sync?.status !== 'gone' ? <>
      {session.phase === 'cached' ? <p role="status" className="mx-auto mt-2 w-fit rounded-full bg-surface px-3 py-1 text-xs text-muted">{session.errorMessage ? `${session.errorMessage} Showing the copy saved on this device.` : 'Showing your saved copy while the latest version loads…'}</p> : null}
      {missingBlock ? <p role="status" className="mx-auto mt-2 w-fit rounded-full bg-surface px-3 py-1 text-xs text-muted">That passage has changed since it was indexed, so it can’t be highlighted.</p> : null}
      {session.repaired ? <p role="status" className="mx-auto mt-2 w-fit rounded-full bg-surface px-3 py-1 text-xs text-muted">Some content in this note was repaired when it opened.</p> : null}
      <div className="min-h-full">
          <DocumentEditor key={`${noteId}:${session.version}:${editable}`} initialDocument={session.document} readonly={!editable} ui="none" aria-label={`Edit ${shownTitle}`} placeholder="Start writing, or type “/” to see commands…" className="min-h-full"
            onReady={(editor) => { editorRef.current = editor; setEditorReady((value) => value + 1) }}
            onChange={(document, event) => session.record({ mode: event.mode, operations: event.operations, document })}>
            <DocumentBubbleToolbar /><DocumentSlashMenu items={incantlySlashMenuItems} /><TableHandle /><TableSelectionOverlay showResizeHandles cellMenu={WorkspaceTableCellMenu} /><TableExtendRowColumnButtons /><DocumentFileUploads afterUpload={libraryFollowUp} /><DocumentFindBar open={findOpen} onOpenChange={setFindOpen} showToggle={false} />
          </DocumentEditor>
      </div>
    </> : null}

    <SidePanel open={contextOpen} onClose={() => setContextOpen(false)} title="Context" description="What this note draws on."><div className="-mx-5 -my-5">
      <NoteSourcesSection space={space} />
      <NoteContextPanel noteId={noteId} space={space} getEditor={() => editorRef.current} />
    </div></SidePanel>
    <HistoryDialog open={dialog === 'history'} onClose={() => setDialog(null)} noteId={noteId} hasPending={(session.sync?.pending ?? 0) > 0} onRestore={session.restore} />
    <ConflictDialog open={dialog === 'conflict'} onClose={() => setDialog(null)} state={session.sync} onKeepMine={session.keepMine} onTakeServer={session.takeServer} />
    <ConfirmDialog open={dialog === 'delete'} onClose={() => setDialog(null)} destructive confirmLabel="Delete note" title={`Delete “${shownTitle || 'this note'}”?`}
      body="It’s removed from your notes and any Space it’s in. This can’t be undone from here." onConfirm={() => void onDelete()} />
  </>
}
