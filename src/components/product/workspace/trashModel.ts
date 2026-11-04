const trashDate = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })

/** A trash timestamp as a plain date, from the backend's own value (never a client-computed one). */
export function formatTrashDate(value: string | null | undefined): string {
  if (!value) return 'Unknown date'
  const time = Date.parse(value)
  return Number.isFinite(time) ? trashDate.format(new Date(time)) : 'Unknown date'
}

/** Meta line under a trashed note's title: when it was deleted. */
export function trashDeletedCopy(deletedAt: string | null): string {
  return `Deleted ${formatTrashDate(deletedAt)}`
}

/** Meta line under a trashed note's title: when the automatic purge makes it gone for good. */
export function trashPurgeCopy(purgeAt: string): string {
  return `Permanently deleted on ${formatTrashDate(purgeAt)}`
}

/** Delete confirmation copy: delete is an owner-only soft delete, restorable from Trash. */
export const DELETE_NOTE_COPY = {
  confirmLabel: 'Delete note',
  body: 'It leaves your notes and any Space it’s in at once, and anyone it was shared with loses access immediately. It’s restorable for 30 days from Trash.',
} as const

export function deleteNoteTitle(title: string): string {
  return `Delete “${title || 'this note'}”?`
}
