'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import { useCurrentUser } from '@/components/product/SessionGate'
import { createFeatureContext, useFeatureContext } from '@/components/product/features/createFeatureContext'
import type { SourceRecord } from '@/components/product/workspace/model'
import type { AddSourceInput } from '@/components/product/workspace/sourceInput'
import { addSourceToLibrary, libraryKey, useLibrarySources, type AddProgress } from '@/components/product/workspace/useLibrary'
import { spaceSourcesKey } from '@/components/product/workspace/useSpaces'
import type { ListStatus } from '@/components/product/workspace/views'
import { useNotes } from '@/hooks/use-notes'

export type LibraryValue = {
  sources: SourceRecord[]
  status: ListStatus
  /** Upload if needed, create the Source, and refresh the Library and any Spaces it joined. */
  addSource: (input: AddSourceInput, options: { signal?: AbortSignal; onProgress?: (progress: AddProgress) => void }) => Promise<void>
}

export const LibraryContext = createFeatureContext<LibraryValue>('Library')

/** `/v1/library`: the user's Sources (refreshing while any are processing) and adding new ones. Runs once, in `LibraryProvider`. */
export function useLibraryState(): LibraryValue {
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

  return useMemo<LibraryValue>(() => ({
    sources,
    status: { loading: isPending, error: isError ? error : null, retry: () => void refetch() },
    addSource,
  }), [sources, isPending, isError, error, refetch, addSource])
}

/** `/v1/library`: the Library's Sources and adding new ones. Must be used inside `WorkspaceProviders`. */
export function useLibrary(): LibraryValue {
  return useFeatureContext(LibraryContext)
}
