'use client'

import { useState, type FormEvent } from 'react'
import type { Editor } from '@tiptap/core'
import { selectedBlockIds } from '../../../lib/document-editor/blockNavigation'
import { AppIcon } from '../AppIcon'
import type { ContextPreviewRequest } from '../../../lib/api/context'
import { EvidenceResults, IndexStatusView } from './ContextSearch'
import { useContentSearch, useNoteIndexStatus, useReindexNote } from './useContextSearch'
import { isUsableSource, sourceKindMeta, type SpaceRecord } from './model'
import { useLibrary } from '@/hooks/use-library'
import { useNavigation } from '@/hooks/use-navigation'
import { useNotes } from '@/hooks/use-notes'
import { buttonSecondary, inputClass, labelClass } from './ui'

const MAX_PICKED = 50

type Scope = 'NOTE' | 'SELECTION' | 'SPACE' | 'PICK' | 'LIBRARY'

export function NoteContextPanel({ noteId, space, getEditor }: { noteId: string; space?: SpaceRecord; getEditor: () => Editor | null }) {
  const { notes } = useNotes()
  const { sources } = useLibrary()
  const { evidenceTarget: target } = useNavigation()
  const index = useNoteIndexStatus(noteId)
  // The build starts on a worker shortly after scheduling, so look again a few times.
  const reindex = useReindexNote(noteId, () => { for (const ms of [0, 3000, 10000]) window.setTimeout(() => void index.refetch(), ms) })
  const search = useContentSearch()
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<Scope>('NOTE')
  const [includeSpaceNotes, setIncludeSpaceNotes] = useState(true)
  const [picked, setPicked] = useState<string[]>([])
  const [scopeError, setScopeError] = useState('')
  const usable = sources.filter(isUsableSource)
  const otherNotes = notes.filter((note) => note.id !== noteId)
  const activeSpace = space?.status === 'ACTIVE' ? space : undefined

  function toggle(key: string) {
    setPicked((current) => (current.includes(key) ? current.filter((item) => item !== key) : current.length >= MAX_PICKED ? current : [...current, key]))
  }

  function request(text: string): ContextPreviewRequest | string {
    if (scope === 'NOTE') return { scope: 'NOTE', noteId, query: text }
    if (scope === 'SELECTION') {
      const nodeIds = selectedBlockIds(getEditor())
      return nodeIds.length ? { scope: 'SELECTION', noteId, nodeIds, query: text } : 'Select some text in the note first.'
    }
    if (scope === 'SPACE') return activeSpace ? { scope: 'SPACE', spaceId: activeSpace.id, includeSpaceNotes, query: text } : 'Open this note from its Space to search the Space.'
    if (scope === 'LIBRARY') return { scope: 'LIBRARY', query: text }
    const sourceIds = picked.filter((key) => key.startsWith('source:')).map((key) => key.slice(7))
    const noteIds = picked.filter((key) => key.startsWith('note:')).map((key) => key.slice(5))
    if (!sourceIds.length && !noteIds.length) return 'Choose at least one note or source.'
    return noteIds.length ? { scope: 'CUSTOM', noteIds, sourceIds, query: text } : { scope: 'SELECTED_SOURCES', sourceIds, query: text }
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    const text = query.trim()
    if (!text || search.wait) return
    const body = request(text)
    if (typeof body === 'string') { setScopeError(body); return }
    setScopeError('')
    search.run(body)
  }

  const reindexLabel = reindex.isPending ? 'Scheduling…' : reindex.rateLimited ? `Try again in ${reindex.wait} s` : reindex.isSuccess ? 'Indexing scheduled' : 'Index now'

  return <>
    <section aria-labelledby="note-searchable" className="space-y-3 border-b border-default px-5 py-5">
      <h3 id="note-searchable" className="flex items-center gap-2 text-sm font-semibold text-foreground"><AppIcon name="search" className="size-4 text-muted" />Searchable</h3>
      <IndexStatusView status={index.data} subject="note" loading={index.isPending} />
      {index.isError ? <p className="text-xs text-muted">Search status isn’t available right now.</p> : null}
      <button type="button" onClick={() => reindex.mutate()} disabled={reindex.isPending || reindex.rateLimited} className={buttonSecondary}><AppIcon name="restore" className="size-4" />{reindexLabel}</button>
      {reindex.isError && !reindex.rateLimited ? <p role="alert" className="text-xs text-danger">Indexing couldn’t be scheduled. Try again shortly.</p> : null}
    </section>

    <section aria-labelledby="note-preview" className="space-y-4 px-5 py-5">
      <div>
        <h3 id="note-preview" className="flex items-center gap-2 text-sm font-semibold text-foreground"><AppIcon name="sparkles" className="size-4 text-muted" />What would the AI see?</h3>
        <p className="mt-1 text-xs leading-5 text-muted">Ask a question to see the exact passages an answer would be built from.</p>
      </div>
      <form onSubmit={submit} className="space-y-3">
        <label className={labelClass}>Question
          <textarea value={query} onChange={(event) => setQuery(event.target.value)} maxLength={1000} rows={2} placeholder="What do mitochondria produce?"
            onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit() } }}
            className={`${inputClass} min-h-20 resize-y py-2.5`} />
        </label>
        <label className={labelClass}>Look in
          <select value={scope} onChange={(event) => { setScope(event.target.value as Scope); setScopeError('') }} className={inputClass}>
            <option value="NOTE">This note</option>
            <option value="SELECTION">Selected text</option>
            {activeSpace ? <option value="SPACE">This Space</option> : null}
            <option value="PICK">Notes and sources I choose</option>
            <option value="LIBRARY">All notes and sources</option>
          </select>
        </label>
        {scope === 'SPACE' ? <label className="flex min-h-11 items-center gap-3 text-sm text-foreground"><input type="checkbox" checked={includeSpaceNotes} onChange={(event) => setIncludeSpaceNotes(event.target.checked)} className="size-5 accent-current" />Include the Space’s notes</label> : null}
        {scope === 'PICK' ? <fieldset className="min-w-0 rounded-xl border border-default p-3">
          <legend className="px-1 text-xs text-muted">{picked.length} of {MAX_PICKED} chosen</legend>
          <div className="max-h-56 space-y-0.5 overflow-y-auto">
            {usable.length || otherNotes.length ? null : <p className="py-2 text-sm text-muted">Nothing else to choose yet.</p>}
            {usable.map((source) => <label key={source.id} className="flex min-h-11 min-w-0 items-center gap-3 text-sm text-foreground"><input type="checkbox" checked={picked.includes(`source:${source.id}`)} onChange={() => toggle(`source:${source.id}`)} className="size-5 shrink-0" /><AppIcon name={sourceKindMeta(source.kind).icon} className="size-4 shrink-0 text-muted" /><span className="min-w-0 truncate">{source.title}</span></label>)}
            {otherNotes.map((note) => <label key={note.id} className="flex min-h-11 min-w-0 items-center gap-3 text-sm text-foreground"><input type="checkbox" checked={picked.includes(`note:${note.id}`)} onChange={() => toggle(`note:${note.id}`)} className="size-5 shrink-0" /><AppIcon name="document" className="size-4 shrink-0 text-muted" /><span className="min-w-0 truncate">{note.title || 'Untitled note'}</span></label>)}
          </div>
        </fieldset> : null}
        {scope === 'LIBRARY' ? <p className="text-xs leading-5 text-muted">Searches everything in your account, not just this note.</p> : null}
        {scopeError ? <p role="alert" className="text-sm text-danger">{scopeError}</p> : null}
        <button type="submit" disabled={!query.trim() || search.pending || search.wait > 0} className={`${buttonSecondary} w-full`}><AppIcon name="search" className="size-4" />{search.pending ? 'Looking…' : search.wait ? `Wait ${search.wait} s` : 'Preview passages'}</button>
      </form>
      <EvidenceResults search={search} target={target} />
    </section>
  </>
}
