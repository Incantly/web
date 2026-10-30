'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { AppIcon, type IconName } from '../AppIcon'
import { EvidenceResults } from './ContextSearch'
import type { CommandAction, CommandItem } from './commandSearchModel'
import { sourceKindMeta } from './model'
import { updatedLabel } from './SpaceViews'
import { SpaceGlyph, StatusChip, iconButton } from './ui'
import { useCommandSearch } from '@/hooks/use-command-search'
import { useSpaces } from '@/hooks/use-spaces'
import { useWorkspaceUI } from '@/hooks/use-workspace-ui'

const actionIcons: Record<CommandAction, IconName> = { 'new-note': 'plus', 'new-space': 'space', 'add-source': 'upload', settings: 'settings' }

/** The ⌘K search bar, over whatever page is open. It only draws; the behaviour is `useCommandSearch`. */
export function CommandSearch() {
  const { searchOpen, closeSearch } = useWorkspaceUI()
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (searchOpen && !dialog.open) dialog.showModal()
    if (!searchOpen && dialog.open) dialog.close()
  }, [searchOpen])

  return <dialog ref={ref} aria-label="Search" onClose={closeSearch} onCancel={(event) => { event.preventDefault(); closeSearch() }}
    onClick={(event) => { if (event.target === ref.current) closeSearch() }}
    className="m-0 h-dvh max-h-none w-screen max-w-none border-0 bg-raised p-0 text-foreground backdrop:bg-foreground/30 open:flex open:flex-col sm:bottom-auto sm:mx-auto sm:mt-[12vh] sm:h-auto sm:max-h-[min(36rem,76dvh)] sm:w-[min(40rem,calc(100vw-2rem))] sm:rounded-[1.15rem] sm:border sm:border-default sm:shadow-xl">
    {/* Mounted only while open, so every open starts from an empty query. */}
    {searchOpen ? <SearchBody onClose={closeSearch} /> : null}
  </dialog>
}

function SearchBody({ onClose }: { onClose: () => void }) {
  const search = useCommandSearch(onClose)
  const { spaces } = useSpaces()

  return <>
    <div className="flex items-center gap-2 border-b border-default px-3 pt-[env(safe-area-inset-top)] sm:px-4 sm:pt-0">
      <AppIcon name="search" className="size-5 shrink-0 text-muted" />
      <input autoFocus value={search.query} maxLength={1000} onKeyDown={search.onKeyDown} onChange={(event) => search.setQuery(event.target.value)}
        role="combobox" aria-expanded={search.sections.length > 0} aria-controls={search.listId} aria-autocomplete="list" aria-activedescendant={search.sections.length ? search.optionId(search.active) : undefined}
        placeholder="Search notes, Spaces and Library" aria-label="Search notes, Spaces and Library"
        className="min-h-14 min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-subtle" />
      <kbd className="hidden shrink-0 rounded border border-default px-1.5 py-0.5 text-[0.7rem] text-subtle sm:block">esc</kbd>
      <button type="button" onClick={onClose} className={`${iconButton} sm:hidden`} aria-label="Close search"><AppIcon name="close" className="size-5" /></button>
    </div>

    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2">
      <div id={search.listId} role="listbox" aria-label="Results">
        {search.sections.map((section) => <div key={section.id} role="group" aria-labelledby={`${search.listId}-${section.id}`} className="py-1">
          <p id={`${search.listId}-${section.id}`} className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-[0.1em] text-muted">{section.label}</p>
          {section.rows.map(({ item, index }) => <ResultRow key={item.id} id={search.optionId(index)} item={item} selected={index === search.active} spaces={spaces}
            busy={item.kind === 'content' ? search.contentBusy : null} onHover={() => search.setActive(index)} onPick={() => search.pick(item)} />)}
          {section.id === 'content' && search.searched !== null ? <section aria-label={`Inside your notes and files: ${search.searched}`} className="mt-2 px-1 pb-2">
            <EvidenceResults search={search.content} target={search.evidenceTarget} emptyHint="Nothing inside your notes and files matches that yet." />
          </section> : null}
        </div>)}
        {search.empty ? <p className="px-3 py-8 text-center text-sm text-muted">Nothing matches “{search.query.trim()}”.</p> : null}
      </div>
    </div>

    <p className="hidden shrink-0 gap-4 border-t border-default px-4 py-2 text-xs text-subtle sm:flex">
      <span><kbd className="font-sans">↑↓</kbd> move</span><span><kbd className="font-sans">↵</kbd> open</span><span><kbd className="font-sans">⌘K</kbd> close</span>
    </p>
  </>
}

function ResultRow({ id, item, selected, spaces, busy, onHover, onPick }: { id: string; item: CommandItem; selected: boolean; spaces: { id: string; name: string }[]; busy: string | null; onHover: () => void; onPick: () => void }) {
  let leading: ReactNode = null
  let title = ''
  let meta: ReactNode = null
  let trailing: ReactNode = null
  if (item.kind === 'content') {
    leading = <Glyph icon="search" />
    title = `Search inside notes and files for “${item.query}”`
    trailing = busy ? <span className="shrink-0 text-xs text-muted">{busy}</span> : <kbd className="hidden shrink-0 text-xs text-subtle sm:block">↵</kbd>
  } else if (item.kind === 'note') {
    leading = <Glyph icon="document" />
    title = item.note.title || 'Untitled note'
    meta = spaces.find((space) => space.id === item.note.spaceId)?.name ?? `Updated ${updatedLabel(item.note.updatedAt)}`
  } else if (item.kind === 'space') {
    leading = <SpaceGlyph icon={item.space.icon} size="sm" />
    title = item.space.name
    meta = item.space.status === 'ARCHIVED' ? 'Archived Space' : 'Space'
  } else if (item.kind === 'source') {
    leading = <Glyph icon={sourceKindMeta(item.source.kind).icon} />
    title = item.source.title
    meta = sourceKindMeta(item.source.kind).label
    trailing = <StatusChip status={item.source.status} stage={item.source.stage} />
  } else if (item.kind === 'ask') {
    leading = <Glyph icon="sparkles" />
    title = `Ask AI about “${item.query}”`
  } else {
    leading = <Glyph icon={actionIcons[item.action]} />
    title = item.label
  }
  return <div id={id} role="option" aria-selected={selected} onMouseMove={selected ? undefined : onHover} onClick={onPick}
    className={`flex min-h-11 min-w-0 cursor-pointer items-center gap-3 rounded-lg px-3 py-1.5 ${selected ? 'bg-surface' : ''}`}>
    {leading}
    <span className="min-w-0 flex-1"><span className="block truncate text-sm text-foreground">{title}</span>{meta ? <span className="block truncate text-xs text-muted">{meta}</span> : null}</span>
    {trailing}
  </div>
}

function Glyph({ icon }: { icon: IconName }) {
  return <span className="grid size-7 shrink-0 place-items-center rounded-md bg-surface text-muted"><AppIcon name={icon} className="size-4" /></span>
}
