import { apiErrorMessage } from '../../../lib/api/errors'

/** The drag payload type for a Library source; other drags (text, files from the desktop) are ignored. */
export const SOURCE_DRAG_TYPE = 'application/x-incantly-source'

/** Whether a drag carries a Library source. During dragover only the types are readable, not the data. */
export function isSourceDrag(types: readonly string[]): boolean {
  return types.includes(SOURCE_DRAG_TYPE)
}

export type DropFeedback = { tone: 'done' | 'error'; text: string }

/** What a Space says after a source is dropped on it: short in the sidebar row, naming the Space on its page. */
export function dropFeedback(result: { created: boolean } | { error: unknown }, spaceName?: string): DropFeedback {
  if ('error' in result) return { tone: 'error', text: apiErrorMessage(result.error) }
  if (result.created) return { tone: 'done', text: spaceName ? `Added to ${spaceName}` : 'Added' }
  return { tone: 'done', text: spaceName ? `Already in ${spaceName}` : 'Already in this Space' }
}
