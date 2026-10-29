'use client'

import Image from 'next/image'
import { useState, type ReactNode } from 'react'
import { AppIcon, type IconName } from '../AppIcon'
import { useCurrentUser } from '../SessionGate'
import { displayName, initial } from '../../../lib/identity'
import type { Navigate, NoteRecord, SourceRecord, SpaceRecord, WorkspaceView } from './model'
import { sourceKindMeta } from './model'
import { SpaceGlyph } from './ui'

// Labels fade while the rail narrows; icons keep a fixed left offset so they never move.
const fade = 'transition-opacity duration-200 motion-reduce:transition-none'
const railButton = 'relative flex min-h-11 min-w-0 items-center gap-3 overflow-hidden whitespace-nowrap rounded-lg px-3 text-left text-sm transition-[width,background-color,color] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none hover:bg-raised hover:text-foreground focus-visible:bg-raised'

function Label({ collapsed, children, className = '' }: { collapsed: boolean; children: ReactNode; className?: string }) {
  return <span className={`min-w-0 flex-1 truncate ${fade} ${collapsed ? 'opacity-0' : 'opacity-100'} ${className}`}>{children}</span>
}

function RailItem({ icon, leading, label, active, collapsed, onClick, children }: { icon?: IconName; leading?: ReactNode; label: string; active: boolean; collapsed: boolean; onClick: () => void; children?: ReactNode }) {
  return <button type="button" onClick={onClick} title={collapsed ? label : undefined} aria-current={active ? 'page' : undefined}
    className={`${railButton} ${collapsed ? 'w-10' : 'w-full'} ${active ? 'bg-raised font-medium text-foreground' : 'text-muted'}`}>
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
 * "Spaces ⌄"-style section: the header toggles the list. When the rail is collapsed the header
 * becomes an icon that opens the section's overview page instead.
 */
function Section({ id, icon, title, collapsed, open, onToggle, onOverview, active, children }: { id: string; icon: IconName; title: string; collapsed: boolean; open: boolean; onToggle: () => void; onOverview: () => void; active: boolean; children: ReactNode }) {
  return <div className="mt-4">
    {collapsed
      ? <RailItem icon={icon} label={title} collapsed active={active} onClick={onOverview} />
      : <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={id} className="flex min-h-11 w-full items-center gap-1.5 rounded-lg px-3 text-left text-sm text-muted transition-colors hover:bg-raised hover:text-foreground">
        <span className="truncate">{title}</span>
        <AppIcon name="chevron" className={`size-3.5 shrink-0 transition-transform duration-200 motion-reduce:transition-none ${open ? 'rotate-90' : ''}`} />
      </button>}
    <Foldable open={!collapsed && open}><div id={id} className="mt-0.5 grid gap-0.5">{children}</div></Foldable>
  </div>
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
      className={`${railButton} ${collapsed ? 'w-10' : 'w-full'} border border-default bg-raised font-medium text-foreground hover:border-strong`}>
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

export function Sidebar({ view, notes, spaces, sources, navigate, onNew, onOpenSource, onOpenSettings, collapsed = false, onClose }: { view: WorkspaceView; notes: NoteRecord[]; spaces: SpaceRecord[]; sources: SourceRecord[]; navigate: Navigate; onNew: (action: NewAction) => void; onOpenSource: (sourceId: string) => void; onOpenSettings: () => void; collapsed?: boolean; onClose?: () => void }) {
  const user = useCurrentUser()
  const [open, setOpen] = useState({ spaces: true, library: true })
  const activeSpaces = spaces.filter((space) => space.status === 'ACTIVE')
  const librarySources = sources.filter((source) => source.status !== 'ARCHIVED' && source.status !== 'DELETED')
  const LIST_LIMIT = 8

  return <aside className="flex h-full min-h-0 flex-col overflow-x-hidden overflow-y-auto bg-surface px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3" aria-label="Workspace navigation">
    <div className="flex min-h-11 items-center justify-between gap-2">
      <button type="button" onClick={() => navigate('home')} className="flex min-h-11 min-w-0 items-center gap-2.5 overflow-hidden whitespace-nowrap rounded-lg px-[0.65rem] text-foreground hover:bg-raised" aria-label="Incantly home">
        <Image src="/incantly-logo.svg" alt="" width={17} height={24} className="shrink-0" priority />
        <span className={`font-display text-[1.45rem] leading-none tracking-[-0.05em] ${fade} ${collapsed ? 'opacity-0' : 'opacity-100'}`}>incantly</span>
      </button>
      {onClose ? <button type="button" onClick={onClose} className="grid size-11 shrink-0 place-items-center rounded-lg text-foreground hover:bg-raised" aria-label="Close sidebar"><AppIcon name="panel" className="size-5" /></button> : null}
    </div>

    <div className="mt-3"><NewMenu collapsed={collapsed} onSelect={onNew} /></div>

    <nav className="mt-3 grid gap-0.5" aria-label="Main navigation">
      <RailItem icon="search" label="Search" collapsed={collapsed} active={view === 'search'} onClick={() => navigate('search')}><span className={`hidden shrink-0 rounded bg-canvas px-1.5 py-0.5 text-[0.65rem] text-subtle sm:block ${fade} ${collapsed ? 'opacity-0' : 'opacity-100'}`}>⌘ K</span></RailItem>
      <RailItem icon="home" label="Home" collapsed={collapsed} active={view === 'home'} onClick={() => navigate('home')} />
      <RailItem icon="document" label="All notes" collapsed={collapsed} active={view === 'notes'} onClick={() => navigate('notes')}>{notes.length ? <span className={`shrink-0 text-xs text-subtle ${fade} ${collapsed ? 'opacity-0' : 'opacity-100'}`}>{notes.length}</span> : null}</RailItem>
    </nav>

    <Section id="sidebar-spaces" icon="space" title="Spaces" collapsed={collapsed} open={open.spaces} onToggle={() => setOpen((current) => ({ ...current, spaces: !current.spaces }))} onOverview={() => navigate('spaces')} active={view === 'spaces' || view.startsWith('space:')}>
      <RailItem icon="plus" label="New Space" collapsed={false} active={false} onClick={() => onNew('space')} />
      {activeSpaces.slice(0, LIST_LIMIT).map((space) => <RailItem key={space.id} leading={space.icon ? <SpaceGlyph icon={space.icon} size="sm" /> : undefined} icon="space" label={space.name} collapsed={false} active={view === `space:${space.id}`} onClick={() => navigate(`space:${space.id}`)} />)}
      {spaces.length > 0 ? <RailItem icon="chevron" label={activeSpaces.length > LIST_LIMIT ? `All Spaces (${activeSpaces.length})` : 'All Spaces'} collapsed={false} active={view === 'spaces'} onClick={() => navigate('spaces')} /> : null}
    </Section>

    <Section id="sidebar-library" icon="library" title="My Library" collapsed={collapsed} open={open.library} onToggle={() => setOpen((current) => ({ ...current, library: !current.library }))} onOverview={() => navigate('library')} active={view === 'library'}>
      <RailItem icon="upload" label="Add to Library" collapsed={false} active={false} onClick={() => onNew('source')} />
      {librarySources.slice(0, LIST_LIMIT).map((source) => <RailItem key={source.id} icon={sourceKindMeta(source.kind).icon} label={source.title} collapsed={false} active={false} onClick={() => onOpenSource(source.id)} />)}
      {sources.length > 0 ? <RailItem icon="chevron" label={librarySources.length > LIST_LIMIT ? `Open Library (${librarySources.length})` : 'Open Library'} collapsed={false} active={view === 'library'} onClick={() => navigate('library')} /> : null}
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
