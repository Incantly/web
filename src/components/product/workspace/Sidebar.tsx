'use client'

import Image from 'next/image'
import { useState, type HTMLAttributes, type ReactNode } from 'react'
import { AppIcon, type IconName } from '../AppIcon'
import { useCurrentUser } from '../SessionGate'
import { displayName, initial } from '../../../lib/identity'
import type { Navigate, NoteRecord, SourceRecord, SpaceRecord, WorkspaceView } from './model'
import { sourceKindMeta } from './model'
import { SpaceGlyph } from './ui'
import { sourceDragProps, useSpaceDropTarget } from '@/hooks/use-source-drag'

// Labels fade while the rail narrows; icons keep a fixed left offset so they never move.
const fade = 'transition-opacity duration-200 motion-reduce:transition-none'
const railButton = 'relative flex min-h-11 min-w-0 items-center gap-3 overflow-hidden whitespace-nowrap rounded-lg px-3 text-left text-sm transition-[width,background-color,color] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none hover:bg-raised hover:text-foreground focus-visible:bg-raised'

function Label({ collapsed, children, className = '' }: { collapsed: boolean; children: ReactNode; className?: string }) {
  return <span className={`min-w-0 flex-1 truncate ${fade} ${collapsed ? 'opacity-0' : 'opacity-100'} ${className}`}>{children}</span>
}

function RailItem({ icon, leading, label, active, collapsed, onClick, children, extra, className = '' }: { icon?: IconName; leading?: ReactNode; label: string; active: boolean; collapsed: boolean; onClick: () => void; children?: ReactNode
  /** Drag and drop handlers and attributes. */
  extra?: HTMLAttributes<HTMLButtonElement>; className?: string }) {
  return <button type="button" onClick={onClick} title={collapsed ? label : undefined} aria-current={active ? 'page' : undefined} {...extra}
    className={`${railButton} ${collapsed ? 'w-10' : 'w-full'} ${active ? 'bg-raised font-medium text-foreground' : 'text-muted'} ${className}`}>
    {leading ?? (icon ? <AppIcon name={icon} className="size-[1.125rem] shrink-0" /> : null)}
    <Label collapsed={collapsed}>{label}</Label>
    {children}
  </button>
}

/** Height-animates its children away when the rail collapses. */
function Foldable({ open, children }: { open: boolean; children: ReactNode }) {
  return <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`} inert={!open}>
    <div className="min-h-0 overflow-hidden">{children}</div>
  </div>
}

/**
 * A list section ("Spaces", "My Library"). Its name opens the section's page; `+` creates a new item;
 * the chevron folds the list. Collapsed, the rail shows just the icon, which opens the page.
 */
function Section({ id, icon, title, addLabel, collapsed, open, onToggle, onOverview, onAdd, active, children }: { id: string; icon: IconName; title: string; addLabel: string; collapsed: boolean; open: boolean; onToggle: () => void; onOverview: () => void; onAdd: () => void; active: boolean; children: ReactNode }) {
  const action = 'grid size-11 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-raised hover:text-foreground'
  return <div className="mt-4">
    {collapsed
      ? <RailItem icon={icon} label={title} collapsed active={active} onClick={onOverview} />
      : <div className="flex items-center">
        <RailItem icon={icon} label={title} collapsed={false} active={active} onClick={onOverview} className="flex-1" />
        <button type="button" onClick={onAdd} className={action} aria-label={addLabel} title={addLabel}><AppIcon name="plus" className="size-4" /></button>
        <button type="button" onClick={onToggle} className={action} aria-expanded={open} aria-controls={id} aria-label={open ? `Hide ${title}` : `Show ${title}`}>
          <AppIcon name="chevron" className={`size-3.5 transition-transform duration-200 motion-reduce:transition-none ${open ? 'rotate-90' : ''}`} />
        </button>
      </div>}
    <Foldable open={!collapsed && open}><div id={id} className="mt-0.5 grid gap-0.5">{children}</div></Foldable>
  </div>
}

/** A Space in the list. While a Library source is dragged it outlines itself, and a drop links the source here. */
function SpaceRow({ space, active, onOpen, onLinkSource }: { space: SpaceRecord; active: boolean; onOpen: () => void; onLinkSource?: (spaceId: string, sourceId: string) => Promise<boolean> }) {
  const target = useSpaceDropTarget(onLinkSource ? (sourceId) => onLinkSource(space.id, sourceId) : undefined)
  // Drawn inside the row: the folding list clips anything outside it.
  const ring = target.over ? 'bg-raised text-foreground ring-2 ring-inset ring-button' : target.armed ? 'outline-1 outline-dashed -outline-offset-1 outline-strong' : ''
  return <RailItem leading={<SpaceGlyph icon={space.icon} size="inline" />} icon="space" label={space.name} collapsed={false} active={active} onClick={onOpen}
    extra={target.dropProps} className={ring}>
    {target.over ? <span className="shrink-0 text-xs text-foreground">Add here</span>
      : target.busy ? <span className="shrink-0 text-xs text-muted">Adding…</span>
      : target.feedback ? <span role="status" title={target.feedback.text} className={`max-w-[55%] shrink-0 truncate text-xs ${target.feedback.tone === 'error' ? 'text-danger' : 'text-muted'}`}>{target.feedback.text}</span>
      : null}
  </RailItem>
}

export type NewAction = 'note' | 'space' | 'source' | 'import-file' | 'import-url'

function NewMenu({ collapsed, onSelect }: { collapsed: boolean; onSelect: (action: NewAction) => void }) {
  const [open, setOpen] = useState(false)
  const items: { action: NewAction; label: string; icon: IconName; available: boolean }[] = [
    { action: 'note', label: 'New note', icon: 'document', available: true },
    { action: 'space', label: 'New Space', icon: 'space', available: true },
    { action: 'source', label: 'Add to Library', icon: 'upload', available: true },
    { action: 'import-file', label: 'Import file as note', icon: 'import', available: true },
    { action: 'import-url', label: 'Import from web address', icon: 'globe', available: true },
  ]
  return <div className="relative" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }} onKeyDown={(event) => { if (event.key === 'Escape' && open) { event.stopPropagation(); setOpen(false) } }}>
    <button type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open} aria-haspopup="menu" title={collapsed ? 'New' : undefined}
      className={`${railButton} ${collapsed ? 'w-10' : 'w-full'} border border-default bg-raised !px-[0.6875rem] font-medium text-foreground hover:border-strong`}>
      {/* 1px less padding than other rows makes up for the border, so the + sits in the icon column. */}
      <AppIcon name="plus" className="size-[1.125rem] shrink-0" />
      <Label collapsed={collapsed}>New</Label>
    </button>
    {open ? <ul role="menu" aria-label="Create" className="absolute left-0 top-full z-40 mt-1 w-[15.5rem] rounded-xl border border-default bg-raised p-1 shadow-lg">
      {items.map((item) => <li key={item.action} role="none">
        <button type="button" role="menuitem" disabled={!item.available} onClick={() => { setOpen(false); onSelect(item.action) }}
          className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm text-foreground transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:text-subtle disabled:hover:bg-transparent">
          <AppIcon name={item.icon} className="size-4 shrink-0" />
          <span className="min-w-0 flex-1">{item.label}</span>
          {item.available ? null : <span className="text-xs">Soon</span>}
        </button>
      </li>)}
    </ul> : null}
  </div>
}

export function Sidebar({ view, notes, spaces, sources, navigate, onNew, onOpenSource, onOpenSettings, onOpenSearch, onLinkSource, collapsed = false, onClose }: { view: WorkspaceView; notes: NoteRecord[]; spaces: SpaceRecord[]; sources: SourceRecord[]; navigate: Navigate; onNew: (action: NewAction) => void; onOpenSource: (sourceId: string) => void; onOpenSettings: () => void; onOpenSearch: () => void
  /** Link a dragged Library source to a Space. Without it (the landing preview), nothing drags. */
  onLinkSource?: (spaceId: string, sourceId: string) => Promise<boolean>; collapsed?: boolean; onClose?: () => void }) {
  const user = useCurrentUser()
  const [open, setOpen] = useState({ spaces: true, library: true })
  const activeSpaces = spaces.filter((space) => space.status === 'ACTIVE')
  const librarySources = sources.filter((source) => source.status !== 'ARCHIVED' && source.status !== 'DELETED')
  const LIST_LIMIT = 8

  return <aside className="flex h-full min-h-0 flex-col overflow-x-hidden overflow-y-auto bg-surface px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3" aria-label="Workspace navigation">
    <div className="flex min-h-11 items-center justify-between gap-2">
      <button type="button" onClick={() => navigate('home')} className="flex min-h-11 min-w-0 items-center gap-3 overflow-hidden whitespace-nowrap rounded-lg px-3 text-foreground hover:bg-raised" aria-label="Incantly home">
        {/* The mark sits in the same 18px column as every icon below it, and the wordmark on the label line. */}
        <span className="grid w-[1.125rem] shrink-0 place-items-center"><Image src="/incantly-logo.svg" alt="" width={17} height={24} priority /></span>
        <span className={`font-display text-[1.45rem] leading-none tracking-[-0.05em] ${fade} ${collapsed ? 'opacity-0' : 'opacity-100'}`}>incantly</span>
      </button>
      {onClose ? <button type="button" onClick={onClose} className="grid size-11 shrink-0 place-items-center rounded-lg text-foreground hover:bg-raised" aria-label="Close sidebar"><AppIcon name="panel" className="size-5" /></button> : null}
    </div>

    <div className="mt-3"><NewMenu collapsed={collapsed} onSelect={onNew} /></div>

    <nav className="mt-3 grid gap-0.5" aria-label="Main navigation">
      <RailItem icon="search" label="Search" collapsed={collapsed} active={false} onClick={onOpenSearch}><span className={`hidden shrink-0 rounded bg-canvas px-1.5 py-0.5 text-[0.65rem] text-subtle sm:block ${fade} ${collapsed ? 'opacity-0' : 'opacity-100'}`}>⌘ K</span></RailItem>
      <RailItem icon="home" label="Home" collapsed={collapsed} active={view === 'home'} onClick={() => navigate('home')} />
      <RailItem icon="document" label="All notes" collapsed={collapsed} active={view === 'notes'} onClick={() => navigate('notes')}>{notes.length ? <span className={`shrink-0 text-xs text-subtle ${fade} ${collapsed ? 'opacity-0' : 'opacity-100'}`}>{notes.length}</span> : null}</RailItem>
    </nav>

    <Section id="sidebar-spaces" icon="space" title="Spaces" addLabel="New Space" collapsed={collapsed} open={open.spaces} onToggle={() => setOpen((current) => ({ ...current, spaces: !current.spaces }))} onOverview={() => navigate('spaces')} onAdd={() => onNew('space')} active={view === 'spaces'}>
      {activeSpaces.slice(0, LIST_LIMIT).map((space) => <SpaceRow key={space.id} space={space} active={view === `space:${space.id}`} onOpen={() => navigate(`space:${space.id}`)} onLinkSource={onLinkSource} />)}
      {activeSpaces.length > LIST_LIMIT ? <RailItem icon="more" label={`${activeSpaces.length - LIST_LIMIT} more`} collapsed={false} active={false} onClick={() => navigate('spaces')} /> : null}
    </Section>

    <Section id="sidebar-library" icon="library" title="My Library" addLabel="Add to Library" collapsed={collapsed} open={open.library} onToggle={() => setOpen((current) => ({ ...current, library: !current.library }))} onOverview={() => navigate('library')} onAdd={() => onNew('source')} active={view === 'library'}>
      {librarySources.slice(0, LIST_LIMIT).map((source) => <RailItem key={source.id} icon={sourceKindMeta(source.kind).icon} label={source.title} collapsed={false} active={false} onClick={() => onOpenSource(source.id)}
        extra={onLinkSource && source.status !== 'ARCHIVED' ? { ...sourceDragProps(source.id, source.title), title: 'Drag onto a Space to add it there' } : undefined} className={onLinkSource ? 'cursor-grab active:cursor-grabbing' : ''} />)}
      {librarySources.length > LIST_LIMIT ? <RailItem icon="more" label={`${librarySources.length - LIST_LIMIT} more`} collapsed={false} active={false} onClick={() => navigate('library')} /> : null}
    </Section>

    <div className="mt-auto border-t border-default pt-2">
      <RailItem icon="settings" label="Settings" collapsed={collapsed} active={false} onClick={onOpenSettings} />
      <div className="mt-1 flex min-h-11 items-center gap-2 overflow-hidden whitespace-nowrap px-[0.45rem]" title={collapsed ? displayName(user) : undefined}>
        <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-full bg-button text-xs font-semibold text-inverse">{initial(user)}</span>
        <Label collapsed={collapsed} className="text-sm font-medium text-foreground">{displayName(user)}</Label>
      </div>
    </div>
  </aside>
}
