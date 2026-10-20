'use client'

import Image from 'next/image'
import { useState, type ReactNode } from 'react'
import { AppIcon, type IconName } from '../AppIcon'
import { useCurrentUser } from '../SessionGate'
import { displayName, initial } from '../../../lib/identity'
import type { Navigate, NoteRecord, SpaceRecord, WorkspaceView } from './model'
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

function SectionHeader({ icon, title, collapsed, onOpen, active, action }: { icon: IconName; title: string; collapsed: boolean; onOpen: () => void; active: boolean; action?: ReactNode }) {
  return <div className="flex items-center">
    <button type="button" onClick={onOpen} title={collapsed ? title : undefined} aria-current={active ? 'page' : undefined}
      className={`${railButton} ${collapsed ? 'w-10' : 'w-full flex-1'} ${active ? 'bg-raised text-foreground' : 'text-muted'}`}>
      <AppIcon name={icon} className="size-[1.125rem] shrink-0" />
      <Label collapsed={collapsed} className="text-xs font-semibold uppercase tracking-[0.1em]">{title}</Label>
    </button>
    {action ? <div className={`shrink-0 ${fade} ${collapsed ? 'pointer-events-none opacity-0' : 'opacity-100'}`} inert={collapsed}>{action}</div> : null}
  </div>
}

export type NewAction = 'note' | 'space' | 'source' | 'import-file' | 'import-url'

function NewMenu({ collapsed, onSelect }: { collapsed: boolean; onSelect: (action: NewAction) => void }) {
  const [open, setOpen] = useState(false)
  const items: { action: NewAction; label: string; icon: IconName; available: boolean }[] = [
    { action: 'note', label: 'New note', icon: 'document', available: true },
    { action: 'space', label: 'New Space', icon: 'space', available: true },
    { action: 'source', label: 'Add to Library', icon: 'upload', available: true },
    { action: 'import-file', label: 'Import file as note', icon: 'import', available: false },
    { action: 'import-url', label: 'Import from web address', icon: 'globe', available: false },
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

export function Sidebar({ view, notes, spaces, navigate, onNew, collapsed = false, onClose }: { view: WorkspaceView; notes: NoteRecord[]; spaces: SpaceRecord[]; navigate: Navigate; onNew: (action: NewAction) => void; collapsed?: boolean; onClose?: () => void }) {
  const user = useCurrentUser()
  const [showArchived, setShowArchived] = useState(false)
  const recent = notes.slice().sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6)
  const listedSpaces = spaces.filter((space) => (showArchived ? space.status === 'ARCHIVED' : space.status === 'ACTIVE'))

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
      <RailItem icon="library" label="Library" collapsed={collapsed} active={view === 'library'} onClick={() => navigate('library')} />
    </nav>

    <div className="mt-5">
      <SectionHeader icon="space" title="Spaces" collapsed={collapsed} active={view === 'spaces'} onOpen={() => navigate('spaces')}
        action={<button type="button" onClick={() => onNew('space')} className="grid size-11 place-items-center rounded-lg text-muted hover:bg-raised hover:text-foreground" aria-label="New Space"><AppIcon name="plus" className="size-4" /></button>} />
      <Foldable open={!collapsed}>
        <div className="pl-3">
          <div role="group" aria-label="Spaces filter" className="mb-1 flex gap-1 px-1">
            {([['Active', false], ['Archived', true]] as const).map(([label, archived]) => <button key={label} type="button" aria-pressed={showArchived === archived} onClick={() => setShowArchived(archived)}
              className={`min-h-9 rounded-md px-2 text-xs transition-colors ${showArchived === archived ? 'bg-raised font-medium text-foreground' : 'text-muted hover:text-foreground'}`}>{label}</button>)}
          </div>
          <nav className="max-h-[12rem] overflow-y-auto" aria-label="Spaces">
            {listedSpaces.map((space) => <RailItem key={space.id} leading={<SpaceGlyph icon={space.icon} size="sm" />} label={space.name} collapsed={false} active={view === `space:${space.id}`} onClick={() => navigate(`space:${space.id}`)} />)}
            {listedSpaces.length === 0 ? (showArchived
              ? <p className="px-3 py-2 text-xs text-muted">No archived Spaces.</p>
              : <button type="button" onClick={() => onNew('space')} className="min-h-11 px-3 text-left text-xs text-muted hover:text-foreground">+ Create your first Space</button>) : null}
          </nav>
        </div>
      </Foldable>
    </div>

    <div className="mt-3">
      <SectionHeader icon="document" title="Notes" collapsed={collapsed} active={view === 'notes'} onOpen={() => navigate('notes')}
        action={<button type="button" onClick={() => onNew('note')} className="grid size-11 place-items-center rounded-lg text-muted hover:bg-raised hover:text-foreground" aria-label="New note"><AppIcon name="plus" className="size-4" /></button>} />
      <Foldable open={!collapsed}>
        <nav className="max-h-[14rem] overflow-y-auto pl-3" aria-label="Recent notes">
          {recent.map((note) => <RailItem key={note.id} icon="document" label={note.title || 'Untitled note'} collapsed={false} active={view === `note:${note.id}`} onClick={() => navigate(`note:${note.id}`)} />)}
          {recent.length === 0 ? <button type="button" onClick={() => onNew('note')} className="min-h-11 px-3 text-left text-xs text-muted hover:text-foreground">+ Write your first note</button> : null}
        </nav>
      </Foldable>
    </div>

    <div className="mt-auto border-t border-default pt-2">
      <RailItem icon="settings" label="Settings" collapsed={collapsed} active={view === 'settings'} onClick={() => navigate('settings')} />
      <div className="mt-1 flex min-h-11 items-center gap-2 overflow-hidden whitespace-nowrap px-[0.45rem]" title={collapsed ? displayName(user) : undefined}>
        <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-full bg-button text-xs font-semibold text-inverse">{initial(user)}</span>
        <Label collapsed={collapsed} className="text-sm font-medium text-foreground">{displayName(user)}</Label>
      </div>
    </div>
  </aside>
}
