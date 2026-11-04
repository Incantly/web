import type { WorkspaceView } from './model'

/**
 * Whether a `/shared/[token]` page shows the linked note: the route carries a
 * token and the user hasn't opened a note or navigated elsewhere. Navigating
 * away explores the workspace normally; back/refresh restores the link.
 */
export function showsSharedLink(sharedToken: string | undefined, view: WorkspaceView, activeNoteId: string | null): sharedToken is string {
  return sharedToken !== undefined && activeNoteId === null && view === 'home'
}

/** The link payload's note title, or the fallback when it is missing or blank. */
export function sharedLinkTitle(note: unknown, fallback: string): string {
  if (note && typeof note === 'object' && typeof (note as { title?: unknown }).title === 'string') {
    const title = ((note as { title: string }).title || '').trim()
    if (title) return title
  }
  return fallback
}
