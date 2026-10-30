'use client'

import { useCallback, useDeferredValue, useEffect, useId, useMemo, useState, type KeyboardEvent } from 'react'
import type { EvidenceTarget } from '@/components/product/workspace/ContextSearch'
import { commandGroups, moveActive, type CommandGroup, type CommandItem } from '@/components/product/workspace/commandSearchModel'
import { useContentSearch, type ContentSearch } from '@/hooks/use-context-search'
import { useLibrary } from '@/hooks/use-library'
import { useNavigation } from '@/hooks/use-navigation'
import { useNotes } from '@/hooks/use-notes'
import { useSpaces } from '@/hooks/use-spaces'
import { useWorkspaceUI } from '@/hooks/use-workspace-ui'

/** A group of rows, each with its position in the whole list (for the highlight and keyboard). */
export type CommandSection = Omit<CommandGroup, 'items'> & { rows: { item: CommandItem; index: number }[] }

export type CommandSearchValue = {
  query: string
  setQuery: (text: string) => void
  /** Rows to show, grouped. Name matching trails typing slightly (`useDeferredValue`) so the field never lags. */
  sections: CommandSection[]
  /** Nothing matches the typed text. */
  empty: boolean
  /** Index of the highlighted row across all groups. */
  active: number
  setActive: (index: number) => void
  /** DOM id of a row, for `aria-activedescendant` and scrolling it into view. */
  optionId: (index: number) => string
  listId: string
  /** ↑/↓ move the highlight, Enter picks it. */
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
  /** Do what a row means: run the content search, open something, ask AI, or run an action. */
  pick: (item: CommandItem) => void
  /** The text the content search last ran for, or null before the first run. */
  searched: string | null
  content: ContentSearch
  /** "Searching…" or the rate-limit wait, shown on the content row; null when it's ready. */
  contentBusy: string | null
  /** Opening a passage closes the search bar first. */
  evidenceTarget: EvidenceTarget
}

/**
 * Everything the ⌘K search bar does; `CommandSearch.tsx` only draws it. Names match from data already
 * loaded (no request per keystroke). Searching inside notes and files runs only when that row is
 * picked, since the API asks for broad search to be an explicit choice, and repeats come from memory.
 */
export function useCommandSearch(onClose: () => void): CommandSearchValue {
  const { notes, createNote } = useNotes()
  const { spaces, activeSpace } = useSpaces()
  const { sources } = useLibrary()
  const { navigate, openNote, openSource, evidenceTarget } = useNavigation()
  const { openDialog, openSettings, askAssistant } = useWorkspaceUI()
  const content = useContentSearch()
  const [query, setText] = useState('')
  const [active, setActive] = useState(0)
  const [searched, setSearched] = useState<string | null>(null)
  const listId = useId()

  const deferredQuery = useDeferredValue(query)
  const groups = useMemo(() => commandGroups(deferredQuery, { notes, spaces, sources }), [deferredQuery, notes, spaces, sources])
  const items = useMemo(() => groups.flatMap((group) => group.items), [groups])
  const sections = useMemo(() => {
    let index = 0
    return groups.map(({ items: groupItems, ...group }) => ({ ...group, rows: groupItems.map((item) => ({ item, index: index++ })) }))
  }, [groups])
  const current = Math.min(active, Math.max(items.length - 1, 0))
  const optionId = useCallback((index: number) => `${listId}-${index}`, [listId])

  // Keep the highlighted row visible while moving with the keyboard.
  useEffect(() => { document.getElementById(optionId(current))?.scrollIntoView({ block: 'nearest' }) }, [optionId, current])

  const setQuery = (text: string) => { setText(text); setActive(0) }

  function pick(item: CommandItem) {
    if (item.kind === 'content') {
      if (content.wait || content.pending) return
      // The live text, not the deferred one, so Enter right after typing searches what was typed.
      const text = query.trim() || item.query
      setSearched(text)
      content.run({ scope: 'LIBRARY', query: text })
      return
    }
    if (item.kind === 'ask') { askAssistant(query.trim() || item.query); return }
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
      const item = items[current]
      if (item) pick(item)
    }
  }

  return {
    query,
    setQuery,
    sections,
    empty: Boolean(query.trim()) && !items.length,
    active: current,
    setActive,
    optionId,
    listId,
    onKeyDown,
    pick,
    searched,
    content,
    contentBusy: content.pending ? 'Searching…' : content.wait ? `Wait ${content.wait} s` : null,
    evidenceTarget: {
      openNote: (noteId, range) => { onClose(); evidenceTarget.openNote(noteId, range) },
      openSource: (sourceId) => { onClose(); evidenceTarget.openSource(sourceId) },
    },
  }
}
