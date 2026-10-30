'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, type ReactNode } from 'react'
import { useCurrentUser } from '../../SessionGate'
import type { SourceRecord } from '../../workspace/model'
import type { AddSourceInput } from '../../workspace/sourceInput'
import { addSourceToLibrary, libraryKey, useLibrarySources, type AddProgress } from '../../workspace/useLibrary'
import { spaceSourcesKey } from '../../workspace/useSpaces'
import type { ListStatus } from '../../workspace/views'
import { createFeatureContext } from '../createFeatureContext'
import { useNotes } from '../notes/NotesProvider'

export type LibraryValue = {
  sources: SourceRecord[]
  status: ListStatus
  /** Upload if needed, create the Source, and refresh the Library and any Spaces it joined. */
  addSource: (input: AddSourceInput, options: { signal?: AbortSignal; onProgress?: (progress: AddProgress) => void }) => Promise<void>
}

const [LibraryContext, useLibrary] = createFeatureContext<LibraryValue>('Library')
export { useLibrary }

/** `/v1/library`: the user's Sources (refreshing while any are processing) and adding new ones. */
export function LibraryProvider({ children }: { children: ReactNode }) {
  const user = useCurrentUser()
  const client = useQueryClient()
  const { notes } = useNotes()
  const query = useLibrarySources(user.id)
  const { sources, isPending, isError, error, refetch } = query

  const addSource = useCallback<LibraryValue['addSource']>(async (input, options) => {
    await addSourceToLibrary(input, notes, options)
    await Promise.all([
      client.invalidateQueries({ queryKey: libraryKey(user.id) }),
      ...input.spaceIds.map((spaceId) => client.invalidateQueries({ queryKey: spaceSourcesKey(spaceId) })),
    ])
  }, [notes, client, user.id])

  const value = useMemo<LibraryValue>(() => ({
    sources,
    status: { loading: isPending, error: isError ? error : null, retry: () => void refetch() },
    addSource,
  }), [sources, isPending, isError, error, refetch, addSource])

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>
}
