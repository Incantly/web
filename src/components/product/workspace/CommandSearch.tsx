'use client'

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { AppIcon, type IconName } from '../AppIcon'
import { EvidenceResults, type EvidenceTarget } from './ContextSearch'
import { commandGroups, moveActive, type CommandAction, type CommandItem } from './commandSearchModel'
import { sourceKindMeta } from './model'
import { updatedLabel } from './SpaceViews'
import { SpaceGlyph, StatusChip, iconButton } from './ui'
import { useContentSearch } from './useContextSearch'
import { useLibrary } from '@/hooks/use-library'
import { useNavigation } from '@/hooks/use-navigation'
import { useNotes } from '@/hooks/use-notes'
import { useSpaces } from '@/hooks/use-spaces'
import { useWorkspaceUI } from '@/hooks/use-workspace-ui'

const actionIcons: Record<CommandAction, IconName> = { 'new-note': 'plus', 'new-space': 'space', 'add-source': 'upload', settings: 'settings' }

/**
 * The ⌘K search bar, over whatever page is open. Names match as you type from data already loaded;
 * searching inside notes and files is an explicit choice (Enter on its row), as the API asks for
 * broad search, and repeats within a minute come from memory.
 */
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
  const { notes, createNote } = useNotes()
  const { spaces, activeSpace } = useSpaces()
  const { sources } = useLibrary()
  const { navigate, openNote, openSource, evidenceTarget } = useNavigation()
  const { openDialog, openSettings, askAssistant } = useWorkspaceUI()
  const search = useContentSearch()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [searched, setSearched] = useState<string | null>(null)
  const listId = useId()
  const optionId = (index: number) => `${listId}-${index}`

  const groups = useMemo(() => commandGroups(query, { notes, spaces, sources }), [query, notes, spaces, sources])
  const items = groups.flatMap((group) => group.items)
  const current = Math.min(active, Math.max(items.length - 1, 0))

  useEffect(() => { document.getElementById(`${listId}-${current}`)?.scrollIntoView({ block: 'nearest' }) }, [listId, current])

  // Opening a passage leaves the search bar.
  const target: EvidenceTarget = {
    openNote: (noteId, range) => { onClose(); evidenceTarget.openNote(noteId, range) },
    openSource: (sourceId) => { onClose(); evidenceTarget.openSource(sourceId) },
  }

  function activate(item: CommandItem | undefined) {
    if (!item) return
    if (item.kind === 'content') {
      if (search.wait || search.pending) return
      setSearched(item.query)
      search.run({ scope: 'LIBRARY', query: item.query })
      return
    }
    if (item.kind === 'ask') { askAssistant(item.query); return }
    onClose()
    if (item.kind === 'note') openNote(item.note.id, item.note.spaceId ?? undefined)
    else if (item.kind === 'space') navigate(`space:${item.space.id}`)
    else if (item.kind === 'source') openSource(item.source.id)
    else if (item.action === 'new-note') createNote({ spaceId: activeSpace?.status === 'ACTIVE' ? activeSpace.id : null })
    else if (item.action === 'new-space') openDialog('space')
    else if (item.action === 'add-source') openDialog('source')
    else openSettings()
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setActive(moveActive(current, event.key === 'ArrowDown' ? 1 : -1, items.length))
    } else if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
      event.preventDefault()
      activate(items[current])
    }
  }

  return <>
    <div className="flex items-center gap-2 border-b border-default px-3 pt-[env(safe-area-inset-top)] sm:px-4 sm:pt-0">
      <AppIcon name="search" className="size-5 shrink-0 text-muted" />
      <input autoFocus value={query} maxLength={1000} onKeyDown={onKeyDown}
        onChange={(event) => { setQuery(event.target.value); setActive(0) }}
        role="combobox" aria-expanded={items.length > 0} aria-controls={listId} aria-autocomplete="list" aria-activedescendant={items.length ? optionId(current) : undefined}
        placeholder="Search notes, Spaces and Library" aria-label="Search notes, Spaces and Library"
        className="min-h-14 min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-subtle" />
      <kbd className="hidden shrink-0 rounded border border-default px-1.5 py-0.5 text-[0.7rem] text-subtle sm:block">esc</kbd>
      <button type="button" onClick={onClose} className={`${iconButton} sm:hidden`} aria-label="Close search"><AppIcon name="close" className="size-5" /></button>
    </div>

    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2">
      <div id={listId} role="listbox" aria-label="Results">
        {groups.map((group) => <div key={group.id} role="group" aria-labelledby={`${listId}-${group.id}`} className="py-1">
          <p id={`${listId}-${group.id}`} className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-[0.1em] text-muted">{group.label}</p>
          {group.items.map((item) => {
            const position = items.indexOf(item)
            return <ResultRow key={item.id} id={optionId(position)} item={item} selected={position === current} spaces={spaces}
              busy={item.kind === 'content' ? (search.pending ? 'Searching…' : search.wait ? `Wait ${search.wait} s` : null) : null}
              onHover={() => setActive(position)} onPick={() => activate(item)} />
          })}
          {group.id === 'content' && searched !== null ? <section aria-label={`Inside your notes and files: ${searched}`} className="mt-2 px-1 pb-2">
            <EvidenceResults search={search} target={target} emptyHint="Nothing inside your notes and files matches that yet." />
          </section> : null}
        </div>)}
        {query.trim() && !items.length ? <p className="px-3 py-8 text-center text-sm text-muted">Nothing matches “{query.trim()}”.</p> : null}
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
