import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { Editor } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'
import type { Transaction } from '@tiptap/pm/state'
import {
  SearchQuery,
  findNext,
  findPrev,
  getMatchHighlights,
  replaceAll,
  replaceNext,
  setSearchState,
} from 'prosemirror-search'
import { useDocumentEditor } from '../DocumentEditorContext'

export interface DocumentFindBarProps {
  editor?: Editor | null
  className?: string
}

const runSearchCommand = (
  editor: Editor,
  command: (state: Editor['state'], dispatch?: (tr: Transaction) => void) => boolean,
): boolean => {
  try {
    return command(editor.state, (transaction) => editor.view.dispatch(transaction))
  } catch {
    return false
  }
}

interface MatchStatus {
  total: number
  /** 1-based index of the match holding the selection, or 0 when none. */
  current: number
}

function readMatchStatus(editor: Editor | null, query: string): MatchStatus | null {
  if (!editor || editor.isDestroyed || !query) return { total: 0, current: 0 }
  try {
    const ranges = getMatchHighlights(editor.state).find()
      .map((deco) => ({ from: deco.from, to: deco.to }))
      .sort((a, b) => a.from - b.from)
    if (!ranges.length) return { total: 0, current: 0 }
    const caret = editor.state.selection.from
    const inside = ranges.findIndex((range) => caret >= range.from && caret <= range.to)
    if (inside >= 0) return { total: ranges.length, current: inside + 1 }
    const upcoming = ranges.findIndex((range) => range.from > caret)
    return { total: ranges.length, current: upcoming >= 0 ? upcoming + 1 : ranges.length }
  } catch {
    return null
  }
}

/**
 * In-document find and replace. Matches highlight via transient
 * ProseMirror decorations (never persisted); replacements dispatch normal
 * transactions, so the canonical mapping handles them like typed text.
 */
export function DocumentFindBar({ editor: suppliedEditor, className }: DocumentFindBarProps) {
  const contextualEditor = useDocumentEditor()
  const editor = suppliedEditor ?? contextualEditor
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [matchCase, setMatchCase] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const status = useEditorState({
    editor,
    selector: ({ editor: current }) => readMatchStatus(current, query),
  })

  // Push the query (and replacement text) into the search plugin.
  useEffect(() => {
    if (!editor || editor.isDestroyed || !open) return
    try {
      editor.view.dispatch(setSearchState(
        editor.state.tr,
        new SearchQuery({ search: query, replace: replacement, caseSensitive: matchCase }),
      ))
    } catch {
      // A query that cannot apply leaves the previous highlights in place.
    }
  }, [editor, open, query, replacement, matchCase])

  // Mod-F opens from the editor; Escape closes from the bar.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    const element = editor.view.dom
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        event.stopPropagation()
        setOpen(true)
        window.setTimeout(() => inputRef.current?.focus(), 0)
      }
    }
    element.addEventListener('keydown', onKeyDown, true)
    return () => element.removeEventListener('keydown', onKeyDown, true)
  }, [editor])

  if (!editor) return null

  const close = (): void => {
    setOpen(false)
    try {
      editor.view.dispatch(setSearchState(editor.state.tr, new SearchQuery({ search: '' })))
    } catch {
      // Clearing highlights is best-effort on teardown paths.
    }
    editor.commands.focus()
  }

  if (!open) {
    return (
      <button
        type="button"
        className={['incantly-find-toggle', className].filter(Boolean).join(' ')}
        aria-label="Find in document"
        title="Find in document (Mod-F)"
        onClick={() => { setOpen(true); window.setTimeout(() => inputRef.current?.focus(), 0) }}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="8" cy="8" r="5.5" />
          <line x1="12.5" y1="12.5" x2="16" y2="16" />
        </svg>
      </button>
    )
  }

  const onSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault()
      runSearchCommand(editor, event.shiftKey ? findPrev : findNext)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      close()
    }
  }

  const statusText = !query
    ? ''
    : !status || status.total === 0
      ? 'No matches'
      : status.current > 0
        ? `${status.current} of ${status.total}`
        : `${status.total} matches`

  return (
    <div className={['incantly-find-bar', className].filter(Boolean).join(' ')} role="search" aria-label="Find and replace">
      <div className="incantly-find-bar__row">
        <label>
          <span className="sr-only">Find</span>
          <input
            ref={inputRef}
            type="text"
            aria-label="Find"
            placeholder="Find"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onSearchKeyDown}
          />
        </label>
        <span className="incantly-find-bar__count" role="status">{statusText}</span>
        <button type="button" aria-label="Previous match" title="Previous match (Shift-Enter)" onClick={() => runSearchCommand(editor, findPrev)}>↑</button>
        <button type="button" aria-label="Next match" title="Next match (Enter)" onClick={() => runSearchCommand(editor, findNext)}>↓</button>
        <button type="button" aria-label="Close find" title="Close find (Escape)" onClick={close}>✕</button>
      </div>
      <div className="incantly-find-bar__row">
        <label>
          <span className="sr-only">Replace with</span>
          <input
            type="text"
            aria-label="Replace with"
            placeholder="Replace"
            value={replacement}
            onChange={(event) => setReplacement(event.target.value)}
            onKeyDown={onSearchKeyDown}
          />
        </label>
        <button type="button" onClick={() => runSearchCommand(editor, replaceNext)}>Replace</button>
        <button type="button" onClick={() => runSearchCommand(editor, replaceAll)}>All</button>
        <label className="incantly-find-bar__case">
          <input
            type="checkbox"
            checked={matchCase}
            onChange={(event) => setMatchCase(event.target.checked)}
          />
          Aa
        </label>
      </div>
    </div>
  )
}
