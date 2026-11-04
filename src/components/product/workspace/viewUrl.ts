import type { WorkspaceView } from './model'

/** Where a URL points: the view, plus the Space a note was opened from (the notes list has no Space field). */
export type UrlState = { view: WorkspaceView; noteSpaceId: string | null }

const PAGES: ReadonlySet<string> = new Set(['notes', 'shared', 'invitations', 'spaces', 'library', 'trash', 'artifacts'])

/**
 * Reads the workspace view from a query string, so a refresh or shared link reopens the same page:
 * `?note=<id>` (optionally `&space=<id>`), `?space=<id>`, `?quiz=<id>`, `?deck=<id|new>`, `?artifact=<id|new>`,
 * or `?view=notes|shared|invitations|spaces|library|trash|artifacts`.
 * Anything else is Home (including the old `?view=search`, now the ⌘K search bar).
 */
export function viewFromSearch(search: string): UrlState {
  const params = new URLSearchParams(search)
  const note = params.get('note')
  const space = params.get('space')
  const quiz = params.get('quiz')
  const deck = params.get('deck')
  const artifact = params.get('artifact')
  if (note) return { view: `note:${note}`, noteSpaceId: space || null }
  if (quiz) return { view: `quiz:${quiz}`, noteSpaceId: null }
  if (deck) return { view: `deck:${deck}`, noteSpaceId: null }
  if (artifact) return { view: `artifact:${artifact}`, noteSpaceId: null }
  if (space) return { view: `space:${space}`, noteSpaceId: null }
  const page = params.get('view')
  return { view: page && PAGES.has(page) ? (page as WorkspaceView) : 'home', noteSpaceId: null }
}

/** The query string for a view (empty for Home). Inverse of `viewFromSearch`. */
export function searchForView(view: WorkspaceView, noteSpaceId: string | null = null): string {
  const params = new URLSearchParams()
  if (view.startsWith('note:')) {
    params.set('note', view.slice(5))
    if (noteSpaceId) params.set('space', noteSpaceId)
  } else if (view.startsWith('quiz:')) {
    params.set('quiz', view.slice(5))
  } else if (view.startsWith('deck:')) {
    params.set('deck', view.slice(5))
  } else if (view.startsWith('artifact:')) {
    params.set('artifact', view.slice(9))
  } else if (view.startsWith('space:')) {
    params.set('space', view.slice(6))
  } else if (view !== 'home') {
    params.set('view', view)
  }
  const query = params.toString()
  return query ? `?${query}` : ''
}
