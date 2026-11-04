'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { AppIcon } from '../AppIcon'
import { apiErrorMessage } from '../../../lib/api/errors'
import { useNotifications, type NotificationRow } from '@/hooks/use-notifications'
import { formatCommentTime } from './commentsModel'
import { formatBadgeCount } from './notificationsModel'
import { EmptyState, ErrorState, ListSkeleton } from './ui'

/** One inbox row: actor + action as text, the note/thread link as text, and a mark-read action. */
function NotificationListItem({ row, onOpen, onMarkRead }: { row: NotificationRow; onOpen: () => void; onMarkRead: () => void }) {
  const body = <>
    <span className="block min-w-0 break-words text-sm text-foreground">
      {row.unread ? <span aria-hidden="true" className="mr-2 inline-block size-2 rounded-full bg-button align-middle" /> : null}
      {row.title}
    </span>
    {row.detail ? <span className="mt-0.5 block truncate text-xs text-muted">{row.detail}</span> : null}
    <span className="mt-0.5 block text-xs text-subtle">{formatCommentTime(row.createdAt)}</span>
  </>
  return <li className="flex items-start gap-1 py-1">
    {row.noteId
      ? <button type="button" onClick={onOpen} aria-label={`${row.title}${row.detail ? `, ${row.detail}` : ''}`} className="min-h-11 min-w-0 flex-1 rounded-lg px-2 py-2 text-left transition-colors hover:bg-surface">{body}</button>
      : <span className="min-h-11 min-w-0 flex-1 px-2 py-2">{body}</span>}
    {row.unread ? <button
      type="button"
      onClick={onMarkRead}
      disabled={row.marking}
      aria-label={`Mark read: ${row.title}`}
      title="Mark read"
      className="grid size-11 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-foreground disabled:opacity-60"
    ><AppIcon name={row.marking ? 'clock' : 'check'} className="size-4" /></button> : null}
  </li>
}

/**
 * The notification bell: unread count plus the inbox panel. Rows navigate
 * (threads deep-link into the comments panel); read state is per row or
 * read-all. Patterned on `InboxPopover`.
 */
export function NotificationsBell() {
  const notifications = useNotifications()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const baseId = useId()
  const unread = notifications.unread

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false) }
    const onKey = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); triggerRef.current?.focus() } }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onPointerDown); document.removeEventListener('keydown', onKey) }
  }, [open ])

  return <div ref={rootRef} className="relative">
    <button
      ref={triggerRef}
      type="button"
      onClick={() => setOpen((current) => !current)}
      aria-expanded={open}
      aria-controls={`${baseId}-notifications`}
      aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
      className={`relative grid size-11 shrink-0 place-items-center rounded-lg transition-colors hover:bg-surface hover:text-foreground ${open ? 'bg-surface text-foreground' : 'text-muted'}`}
    >
      <AppIcon name="bell" className="size-5" />
      {unread ? <span aria-hidden="true" className="absolute right-1 top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-button px-1 text-[11px] font-semibold leading-5 text-inverse ring-2 ring-raised">{formatBadgeCount(unread)}</span> : null}
    </button>

    <div
      id={`${baseId}-notifications`}
      role="dialog"
      aria-label="Notifications"
      inert={!open}
      className={`absolute right-0 top-full z-50 mt-2 w-[min(24rem,calc(100vw-1.5rem))] origin-top-right rounded-[1.15rem] border border-default bg-raised shadow-lg duration-200 ease-out motion-reduce:transition-none ${open ? 'visible scale-100 opacity-100 transition-[opacity,scale]' : 'pointer-events-none invisible scale-95 opacity-0 transition-[opacity,scale,visibility]'}`}
    >
      <div className="flex min-h-14 items-center justify-between gap-3 border-b border-default px-4">
        <h2 className="font-display text-lg text-foreground">Notifications</h2>
        <button
          type="button"
          onClick={() => notifications.readAll()}
          disabled={notifications.readingAll || unread === 0}
          className="min-h-11 rounded-lg px-2.5 text-xs font-semibold text-button transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60"
        >{notifications.readingAll ? 'Marking…' : 'Mark all read'}</button>
      </div>

      <div className="max-h-[min(26rem,60svh)] overflow-y-auto overscroll-contain px-2 py-1">
        {!notifications.online ? <p role="status" className="mx-2 mt-2 rounded-xl bg-surface px-3.5 py-2.5 text-sm text-muted">You’re offline. Notifications will refresh when you reconnect.</p> : null}
        {notifications.actionError ? <div role="alert" className="mx-2 mt-2 flex items-center justify-between gap-2 rounded-xl border border-danger bg-danger-surface px-3.5 py-1 text-sm text-danger">
          <span className="min-w-0 py-2">{notifications.actionError}</span>
          <button type="button" onClick={notifications.clearActionError} aria-label="Dismiss" className="grid size-11 shrink-0 place-items-center rounded-lg hover:text-foreground"><AppIcon name="close" className="size-4" /></button>
        </div> : null}
        {notifications.inboxLoading ? <div className="px-2 py-2"><ListSkeleton rows={3} label="Loading notifications" /></div>
          : notifications.inboxError ? <div className="px-2 py-4"><ErrorState message={apiErrorMessage(notifications.inboxError)} onRetry={notifications.retryInbox} /></div>
          : notifications.rows.length === 0 ? <div className="px-2 py-4"><EmptyState icon="bell" title="You’re all caught up" body="Shares, invitations and updates will show up here." /></div>
          : <>
            <ul>
              {notifications.rows.map((row) => <NotificationListItem
                key={row.id}
                row={row}
                onOpen={() => { setOpen(false); notifications.openRow(row) }}
                onMarkRead={() => notifications.markRead(row)}
              />)}
            </ul>
            {notifications.hasMore ? <div className="flex justify-center border-t border-default py-1">
              <button type="button" onClick={() => notifications.loadMore()} disabled={notifications.loadingMore} className="min-h-11 rounded-lg px-3 text-sm font-medium text-muted transition-colors hover:bg-surface hover:text-foreground disabled:opacity-60">
                {notifications.loadingMore ? 'Loading…' : 'Show older'}
              </button>
            </div> : null}
          </>}
      </div>
    </div>
  </div>
}
