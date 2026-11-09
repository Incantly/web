'use client'

import { AppIcon } from '../AppIcon'
import { apiErrorMessage } from '../../../lib/api/errors'
import { useNavigation } from '@/hooks/use-navigation'
import { useNoteIntent } from '@/hooks/use-note-prefetch'
import { useSharedNotes } from '@/hooks/use-shared-notes'
import { useTrash } from '@/hooks/use-trash'
import { updatedLabel } from './SpaceViews'
import { trashDeletedCopy, trashPurgeCopy } from './trashModel'
import { EmptyState, ErrorState, ListSkeleton, PageFrame, PageHeading, buttonPrimary, buttonSecondary } from './ui'

export function TrashView() {
  const { trashed, status: trashStatus, restoringId, restoreNote, restoreError, clearRestoreError, restored, clearRestored } = useTrash()
  const { openNote } = useNavigation()
  return <PageFrame>
    <PageHeading title="Trash" subtitle="Deleted notes stay here for 30 days, then they’re permanently deleted. Restoring brings a note — and its sharing — back." />
    {restored ? <div role="status" className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-default bg-surface px-4 py-3 text-sm text-foreground">
      <span className="flex min-w-0 items-center gap-2"><AppIcon name="checkCircle" className="size-4 shrink-0 text-muted" /><span className="truncate">“{restored.title || 'Untitled note'}” is back in your notes.</span></span>
      <span className="flex gap-2">
        <button type="button" onClick={() => openNote(restored.id)} className={buttonPrimary}>Open note</button>
        <button type="button" onClick={clearRestored} className={buttonSecondary}>Dismiss</button>
      </span>
    </div> : null}
    {restoreError ? <div role="alert" className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger bg-danger-surface px-4 py-3 text-sm text-danger">
      <span className="min-w-0 flex-1 basis-48">{apiErrorMessage(restoreError)}</span>
      <button type="button" onClick={clearRestoreError} className="min-h-11 rounded-lg px-3 font-semibold hover:bg-raised">Dismiss</button>
    </div> : null}
    <div className="mt-8">
      {trashStatus.loading ? <ListSkeleton rows={6} label="Loading trash" />
        : trashStatus.error ? <ErrorState message={apiErrorMessage(trashStatus.error)} onRetry={trashStatus.retry} />
        : trashed.length ? <><ul className="divide-y divide-default border-y border-default">
        {trashed.map((note) => {
          const restoring = restoringId === note.id
          return <li key={note.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface text-muted"><AppIcon name="trash" className="size-4" /></span>
            <span className="min-w-0 flex-1 basis-48"><span className="block truncate text-sm font-medium text-foreground">{note.title || 'Untitled note'}</span>
              <span className="mt-0.5 block truncate text-xs text-muted">{trashDeletedCopy(note.deletedAt)} · {trashPurgeCopy(note.purgeAt)}</span></span>
            <button type="button" onClick={() => void restoreNote(note.id)} disabled={restoring || restoringId !== null} className={buttonSecondary} aria-label={restoring ? `Restoring ${note.title || 'note'}` : `Restore ${note.title || 'note'}`}>
              <AppIcon name="restore" className="size-4" />{restoring ? 'Restoring…' : 'Restore'}
            </button>
          </li>
        })}
      </ul>
        {trashStatus.hasMore ? <div className="mt-4 flex justify-center"><button type="button" onClick={trashStatus.loadMore} disabled={trashStatus.loadingMore} className={buttonSecondary}>{trashStatus.loadingMore ? 'Loading…' : 'Load more'}</button></div> : null}
      </> : <EmptyState icon="trash" title="Trash is empty" body="Notes you delete stay here for 30 days, in case you change your mind." />}
    </div>
  </PageFrame>
}

export function SharedWithMeView() {
  const { shared, status: sharedStatus } = useSharedNotes()
  const { openNote } = useNavigation()
  const noteIntent = useNoteIntent()
  return <PageFrame>
    <PageHeading title="Shared with me" subtitle="Notes other people shared with you. Open one to read it; what you can change depends on your role." />
    <div className="mt-8">
      {sharedStatus.loading ? <ListSkeleton rows={6} label="Loading shared notes" />
        : sharedStatus.error ? <ErrorState message={apiErrorMessage(sharedStatus.error)} onRetry={sharedStatus.retry} />
        : shared.length ? <><div className="divide-y divide-default border-y border-default">
        {shared.map((item) => <button type="button" key={item.id} onClick={() => openNote(item.note.id)} {...noteIntent(item.note.id)} className="flex min-h-[4.25rem] w-full min-w-0 items-center gap-3 py-3 text-left">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface text-muted"><AppIcon name="share" className="size-4" /></span>
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-foreground">{item.note.title || 'Untitled note'}</span>
            <span className="mt-0.5 block truncate text-xs text-muted">Shared by {item.note.owner.name} · Updated {updatedLabel(Date.parse(item.note.updatedAt) || 0)}</span></span>
          <AppIcon name="chevron" className="size-4 shrink-0 text-subtle" />
        </button>)}
      </div>
        {sharedStatus.hasMore ? <div className="mt-4 flex justify-center"><button type="button" onClick={sharedStatus.loadMore} disabled={sharedStatus.loadingMore} className={buttonSecondary}>{sharedStatus.loadingMore ? 'Loading…' : 'Load more notes'}</button></div> : null}
      </> : <EmptyState icon="share" title="No shared notes" body="When someone shares a note with you, it shows up here." />}
    </div>
  </PageFrame>
}
