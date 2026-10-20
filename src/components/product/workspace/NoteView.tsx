'use client'

import dynamic from 'next/dynamic'
import { useSyncExternalStore } from 'react'
import type { IncantlyDocument } from '@incantly/core/document'
import type { Editor } from '@tiptap/core'
import { DocumentBubbleToolbar, DocumentFileUploads, DocumentFindBar, DocumentSlashMenu } from '../../../lib/document-editor'
import { TableHandle } from '@/components/tiptap-node/table-node/ui/table-handle'
import { TableSelectionOverlay } from '@/components/tiptap-node/table-node/ui/table-selection-overlay'
import { TableExtendRowColumnButtons } from '@/components/tiptap-node/table-node/ui/table-extend-row-column-button'
import { TableCellHandleMenu } from '@/components/tiptap-node/table-node/ui/table-cell-handle-menu'
import { incantlySlashMenuItems } from '../slashMenuItems'
import { AppIcon, type IconName } from '../AppIcon'
import type { NoteRecord } from './model'
import { Dialog, iconButton } from './ui'

const DocumentEditor = dynamic(
  () => import('../../../lib/document-editor').then((module) => module.DocumentEditor),
  { ssr: false, loading: () => <div className="mx-auto mt-20 h-28 w-full max-w-[46rem] animate-pulse rounded-2xl bg-surface" /> },
)

const WorkspaceTableCellMenu = ({ editor, onOpenChange, onResizeStart }: {
  editor?: Editor | null
  onOpenChange?: (isOpen: boolean) => void
  onResizeStart?: (handle: 'tl' | 'tr' | 'bl' | 'br' | null) => (event: React.MouseEvent) => void
}) => <TableCellHandleMenu editor={editor} onOpenChange={onOpenChange} onMouseDown={(event) => onResizeStart?.('br')(event)} />

function PanelSection({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  return <section className="border-b border-default px-5 py-5 last:border-b-0">
    <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground"><AppIcon name={icon} className="size-4 text-muted" />{title}</h3>
    <p className="mt-2 text-sm leading-6 text-muted">{body}</p>
  </section>
}

/** Sources, search readiness and the evidence preview for one note (filled by Phases 7–8). */
function ContextPanelBody() {
  return <>
    <PanelSection icon="link" title="Sources for this note" body="Choose Library sources this note relies on, so questions about it look there first. Available once notes sync to your account." />
    <PanelSection icon="search" title="Searchable" body="Shows whether this note can be searched yet. New edits are indexed about a minute after you stop typing." />
    <PanelSection icon="sparkles" title="What would the AI see?" body="Preview the passages from this note and its sources that would be used to answer a question." />
  </>
}

const WIDE = '(min-width: 80rem)'
function useWideScreen() {
  return useSyncExternalStore(
    (onChange) => { const query = window.matchMedia(WIDE); query.addEventListener('change', onChange); return () => query.removeEventListener('change', onChange) },
    () => window.matchMedia(WIDE).matches,
    () => false,
  )
}

export function NoteView({ note, save, status, contextOpen, onCloseContext }: { note: NoteRecord; save: (document: IncantlyDocument) => void; status: string; contextOpen: boolean; onCloseContext: () => void }) {
  const wide = useWideScreen()
  return <div className="flex min-h-full">
    <div className="min-w-0 flex-1">
      <DocumentEditor key={note.id} document={note.document} onChange={save} ui="none" aria-label={`Edit ${note.title}`} placeholder="Start writing, or type “/” to see commands…" className="min-h-full">
        <DocumentBubbleToolbar /><DocumentSlashMenu items={incantlySlashMenuItems} /><TableHandle /><TableSelectionOverlay showResizeHandles cellMenu={WorkspaceTableCellMenu} /><TableExtendRowColumnButtons /><DocumentFileUploads /><DocumentFindBar />
      </DocumentEditor>
      <span role="status" className="sr-only">{status}</span>
    </div>
    {/* Wide screens (80rem+): a docked panel beside the editor. */}
    {contextOpen && wide ? <aside aria-label="Note context" className="sticky top-0 max-h-[calc(100svh-4.5rem)] w-80 shrink-0 self-start overflow-y-auto border-l border-default">
      <div className="flex min-h-12 items-center justify-between border-b border-default pl-5 pr-2"><h2 className="text-sm font-semibold text-foreground">Context</h2><button type="button" onClick={onCloseContext} className={iconButton} aria-label="Close context panel"><AppIcon name="close" className="size-4" /></button></div>
      <ContextPanelBody />
    </aside> : null}
    {/* Narrower screens: the same panel as a drawer. */}
    <Dialog variant="drawer" open={contextOpen && !wide} onClose={onCloseContext} title="Context" description="What this note draws on."><div className="-mx-5 -my-5"><ContextPanelBody /></div></Dialog>
  </div>
}
