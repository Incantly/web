'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { useCurrentUser } from '../../SessionGate'
import { useImportTracker, type ImportTracker } from '../../workspace/imports'
import { createFeatureContext } from '../createFeatureContext'

export type ImportsValue = {
  /** Running and finished imports (persisted per user), for the tray. */
  tracker: ImportTracker
  /**
   * An open note registers how to reload itself; when an import into it finishes, it reloads.
   * Returns the unregister function.
   */
  registerNoteReloader: (noteId: string, reload: () => void) => () => void
}

const [ImportsContext, useImports] = createFeatureContext<ImportsValue>('Imports')
export { useImports }

/** `/v1/imports`: file and web-page imports, tracked across reloads. */
export function ImportsProvider({ children }: { children: ReactNode }) {
  const user = useCurrentUser()
  const client = useQueryClient()
  const [reloaders] = useState(() => new Map<string, () => void>())
  const tracker = useImportTracker(user.id, (_job, item) => {
    if (item.intoNoteId) { reloaders.get(item.intoNoteId)?.(); void client.invalidateQueries({ queryKey: ['note-index', item.intoNoteId] }) }
  })

  const registerNoteReloader = useCallback((noteId: string, reload: () => void) => {
    reloaders.set(noteId, reload)
    return () => { if (reloaders.get(noteId) === reload) reloaders.delete(noteId) }
  }, [reloaders])

  const value = useMemo<ImportsValue>(() => ({ tracker, registerNoteReloader }), [tracker, registerNoteReloader])
  return <ImportsContext.Provider value={value}>{children}</ImportsContext.Provider>
}
