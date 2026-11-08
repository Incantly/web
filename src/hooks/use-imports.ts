'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, useState } from 'react'
import { useCurrentUser } from '@/components/product/SessionGate'
import { createFeatureContext, useFeatureContext } from '@/components/product/features/createFeatureContext'
import { useImportTracker, type ImportTracker } from '@/components/product/workspace/imports'

export type ImportsValue = {
  /** Running and finished imports (persisted per user), for the tray. */
  tracker: ImportTracker
  /**
   * An open note registers how to reload itself; when an import into it finishes, it reloads.
   * Returns the unregister function.
   */
  registerNoteReloader: (noteId: string, reload: () => void) => () => void
  /**
   * A server-side addition landed in the note (a finished import, an assistant figure):
   * reload it if it is open, and refresh its index entry. Unknown or closed notes are a no-op.
   */
  reloadNote: (noteId: string) => void
}

export const ImportsContext = createFeatureContext<ImportsValue>('Imports')

/** `/v1/imports`: file and web-page imports, tracked across reloads. Runs once, in `ImportsProvider`. */
export function useImportsState(): ImportsValue {
  const user = useCurrentUser()
  const client = useQueryClient()
  const [reloaders] = useState(() => new Map<string, () => void>())
  const reloadNote = useCallback((noteId: string) => {
    reloaders.get(noteId)?.()
    void client.invalidateQueries({ queryKey: ['note-index', noteId] })
  }, [client, reloaders])
  const tracker = useImportTracker(user.id, (_job, item) => {
    if (item.intoNoteId) reloadNote(item.intoNoteId)
  })

  const registerNoteReloader = useCallback((noteId: string, reload: () => void) => {
    reloaders.set(noteId, reload)
    return () => { if (reloaders.get(noteId) === reload) reloaders.delete(noteId) }
  }, [reloaders])

  return useMemo<ImportsValue>(() => ({ tracker, registerNoteReloader, reloadNote }), [tracker, registerNoteReloader, reloadNote])
}

/** `/v1/imports`: tracked imports and reloading a note when one into it finishes. Must be used inside `WorkspaceProviders`. */
export function useImports(): ImportsValue {
  return useFeatureContext(ImportsContext)
}
