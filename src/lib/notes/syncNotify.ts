/** Cross-hook signal: room broadcasts that the head moved, so the saved-sync poller re-reads now. */

/** Which room broadcast moved the head: a checkpoint (`content`) or a restore (`restore`, which re-seeds). */
export type NoteChangedOrigin = 'content' | 'restore'

type NoteChangedListener = (noteId: string, origin: NoteChangedOrigin) => void

const listeners = new Set<NoteChangedListener>()

/** Runs `listener` on every `notifyNoteChanged`; returns an unsubscribe. Never throws. */
export function subscribeNoteChanged(listener: NoteChangedListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Tells pollers the head of `noteId` may have moved (a CONTENT_CHANGED or RESTORED room
 * broadcast). The poller re-reads the checkpoint with `If-None-Match`, so a premature signal
 * costs one cheap 304 at most. Never throws: a broken listener must not break the room handler.
 */
export function notifyNoteChanged(noteId: string, origin: NoteChangedOrigin = 'content'): void {
  for (const listener of [...listeners]) {
    try {
      listener(noteId, origin)
    } catch {
      /* Ignored: see above. */
    }
  }
}
