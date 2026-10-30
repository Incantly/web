'use client'

import { AppIcon } from '../AppIcon'
import { IndexStatusView } from './ContextSearch'
import { buttonSecondary } from './ui'
import { useNoteSearchStatus } from '@/hooks/use-context-search'

/** Whether this note can be found by search yet, and "Index now". Searching itself lives in ⌘K. */
export function NoteContextPanel({ noteId }: { noteId: string }) {
  const search = useNoteSearchStatus(noteId)
  return <section aria-labelledby="note-searchable" className="space-y-3 px-5 py-5">
    <h3 id="note-searchable" className="flex items-center gap-2 text-sm font-semibold text-foreground"><AppIcon name="search" className="size-4 text-muted" />Searchable</h3>
    <IndexStatusView status={search.status} subject="note" loading={search.loading} />
    {search.unavailable ? <p className="text-xs text-muted">Search status isn’t available right now.</p> : null}
    <p className="text-xs leading-5 text-muted">Find anything inside it with <kbd className="rounded border border-default px-1 font-sans">⌘K</kbd>.</p>
    <button type="button" onClick={search.reindex} disabled={search.reindexDisabled} className={buttonSecondary}><AppIcon name="restore" className="size-4" />{search.reindexLabel}</button>
    {search.reindexFailed ? <p role="alert" className="text-xs text-danger">Indexing couldn’t be scheduled. Try again shortly.</p> : null}
  </section>
}
