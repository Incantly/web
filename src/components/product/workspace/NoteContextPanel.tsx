'use client'

import { AppIcon } from '../AppIcon'
import { IndexStatusView } from './ContextSearch'
import { useNoteIndexStatus, useReindexNote } from './useContextSearch'
import { buttonSecondary } from './ui'

/** Whether this note can be found by search yet, and "Index now". Searching itself lives in ⌘K. */
export function NoteContextPanel({ noteId }: { noteId: string }) {
  const index = useNoteIndexStatus(noteId)
  // The build starts on a worker shortly after scheduling, so look again a few times.
  const reindex = useReindexNote(noteId, () => { for (const ms of [0, 3000, 10000]) window.setTimeout(() => void index.refetch(), ms) })
  const reindexLabel = reindex.isPending ? 'Scheduling…' : reindex.rateLimited ? `Try again in ${reindex.wait} s` : reindex.isSuccess ? 'Indexing scheduled' : 'Index now'

  return <section aria-labelledby="note-searchable" className="space-y-3 px-5 py-5">
    <h3 id="note-searchable" className="flex items-center gap-2 text-sm font-semibold text-foreground"><AppIcon name="search" className="size-4 text-muted" />Searchable</h3>
    <IndexStatusView status={index.data} subject="note" loading={index.isPending} />
    {index.isError ? <p className="text-xs text-muted">Search status isn’t available right now.</p> : null}
    <p className="text-xs leading-5 text-muted">Find anything inside it with <kbd className="rounded border border-default px-1 font-sans">⌘K</kbd>.</p>
    <button type="button" onClick={() => reindex.mutate()} disabled={reindex.isPending || reindex.rateLimited} className={buttonSecondary}><AppIcon name="restore" className="size-4" />{reindexLabel}</button>
    {reindex.isError && !reindex.rateLimited ? <p role="alert" className="text-xs text-danger">Indexing couldn’t be scheduled. Try again shortly.</p> : null}
  </section>
}
