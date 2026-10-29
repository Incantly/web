'use client'

// Adapted from beui.dev/components/agents/citations: same parts and API shape, rebuilt on the
// app's semantic tokens and icons, with CSS transitions instead of motion. Sources here are the
// user's own notes and files, so a row opens it in the workspace instead of linking off-site.

import { useId, useState, type ReactNode } from 'react'
import { AppIcon, type IconName } from '../AppIcon'

export type CitationItem = {
  id: string
  title: ReactNode
  /** Where in the original: "Page 4", a timestamp, or a heading path. */
  detail?: ReactNode
  icon?: IconName
  onOpen?: () => void
}

export function citationTargetId(prefix: string, citationId: string) {
  return `${prefix}-${citationId.replace(/[^a-zA-Z0-9_-]/g, '-')}`
}

/** Shared height-and-fade reveal for collapsible agent content. Closed content is inert. */
export function Disclosure({ id, open, children, className = '' }: { id?: string; open: boolean; children: ReactNode; className?: string }) {
  return <div id={id} inert={!open} aria-hidden={!open}
    className={`grid transition-[grid-template-rows,opacity] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'} ${className}`}>
    <div className="min-h-0 overflow-hidden">{children}</div>
  </div>
}

/** Inline numbered marker. Selecting it reveals and focuses the matching row. */
export function Citation({ citationId, index, idPrefix, label, onSelect }: { citationId: string; index: number; idPrefix: string; label?: string; onSelect?: (citationId: string) => void }) {
  return <button type="button" onClick={() => onSelect?.(citationId)} aria-label={label ?? `View source ${index}`} aria-controls={citationTargetId(idPrefix, citationId)}
    className="mx-0.5 inline-flex min-w-5 -translate-y-0.5 items-center justify-center rounded-md bg-surface px-1 py-0.5 align-baseline text-[0.7rem] font-semibold leading-none text-muted tabular-nums transition-colors hover:bg-canvas hover:text-foreground">
    {index}
  </button>
}

function CitationGlyph({ icon = 'document', className = '' }: { icon?: IconName; className?: string }) {
  return <span aria-hidden="true" className={`grid size-7 shrink-0 place-items-center rounded-lg bg-surface text-muted ${className}`}><AppIcon name={icon} className="size-3.5" /></span>
}

/** Overlapping glyphs summarising a source list. */
export function CitationStack({ citations, limit = 3 }: { citations: CitationItem[]; limit?: number }) {
  return <span aria-hidden="true" className="flex -space-x-1.5">
    {citations.slice(0, limit).map((citation) => <CitationGlyph key={citation.id} icon={citation.icon} className="size-6 rounded-full ring-2 ring-raised" />)}
  </span>
}

function CitationRow({ citation, index, idPrefix }: { citation: CitationItem; index: number; idPrefix: string }) {
  const content = <>
    <CitationGlyph icon={citation.icon} />
    <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
      <span className="min-w-0 truncate text-sm font-medium text-foreground">{citation.title}</span>
      {citation.detail ? <span className="min-w-0 truncate text-xs text-muted">{citation.detail}</span> : null}
    </span>
    <span className="grid size-5 shrink-0 place-items-center rounded-md bg-surface text-[0.65rem] font-semibold text-muted tabular-nums">{index}</span>
  </>
  const className = 'flex min-h-11 w-full min-w-0 items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors'
  const id = citationTargetId(idPrefix, citation.id)
  return citation.onOpen
    ? <button id={id} type="button" onClick={citation.onOpen} className={`${className} hover:bg-surface`}>{content}</button>
    : <div id={id} tabIndex={-1} className={className}>{content}</div>
}

export function CitationList({ citations, idPrefix, className = '' }: { citations: CitationItem[]; idPrefix: string; className?: string }) {
  return <ol className={`grid gap-0.5 ${className}`}>
    {citations.map((citation, index) => <li key={citation.id} className="min-w-0 animate-[citation-in_180ms_ease-out] motion-reduce:animate-none"><CitationRow citation={citation} index={index + 1} idPrefix={idPrefix} /></li>)}
  </ol>
}

/** "Sources N" disclosure with the full list. */
export function Citations({ citations, title = 'Sources', open, defaultOpen = false, onOpenChange, idPrefix }: { citations: CitationItem[]; title?: ReactNode; open?: boolean; defaultOpen?: boolean; onOpenChange?: (open: boolean) => void; idPrefix: string }) {
  const contentId = useId()
  const [internal, setInternal] = useState(defaultOpen)
  const current = open ?? internal
  const setOpen = (next: boolean) => { if (open === undefined) setInternal(next); onOpenChange?.(next) }
  return <div className="w-full text-sm">
    <button type="button" aria-expanded={current} aria-controls={contentId} onClick={() => setOpen(!current)}
      className="-ml-1 flex min-h-11 items-center gap-2 rounded-lg px-1 text-left text-muted transition-colors hover:text-foreground">
      <AppIcon name="library" className="size-4" />
      <span className="font-medium">{title}</span>
      <span className="rounded-full bg-surface px-1.5 py-0.5 text-[0.65rem] font-semibold tabular-nums">{citations.length}</span>
      <AppIcon name="chevron" className={`size-3.5 transition-transform duration-200 motion-reduce:transition-none ${current ? '-rotate-90' : 'rotate-90'}`} />
    </button>
    <Disclosure id={contentId} open={current}><CitationList citations={citations} idPrefix={idPrefix} className="mt-1" /></Disclosure>
  </div>
}
