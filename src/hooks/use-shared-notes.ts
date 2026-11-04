'use client'

import { useMemo } from 'react'
import { useCurrentUser } from '@/components/product/SessionGate'
import { createFeatureContext, useFeatureContext } from '@/components/product/features/createFeatureContext'
import type { SharedWithMeItemDto } from '@/lib/api/notes'
import { useSharedWithMeList } from '@/components/product/workspace/useNotes'
import type { ListStatus } from '@/components/product/workspace/views'

export type SharedNotesValue = {
  shared: SharedWithMeItemDto[]
  status: ListStatus
}

export const SharedNotesContext = createFeatureContext<SharedNotesValue>('SharedNotes')

/** `GET /v1/notes/shared-with-me`: notes others shared with the caller. Runs once, in `SharedNotesProvider`. */
export function useSharedNotesState(): SharedNotesValue {
  const user = useCurrentUser()
  const query = useSharedWithMeList(user.id)
  const { isPending, isError, error, refetch, hasNextPage, fetchNextPage, isFetchingNextPage } = query

  return useMemo<SharedNotesValue>(() => ({
    shared: query.shared,
    status: { loading: isPending, error: isError ? error : null, retry: () => void refetch(), hasMore: hasNextPage, loadMore: () => void fetchNextPage(), loadingMore: isFetchingNextPage },
  }), [query.shared, isPending, isError, error, refetch, hasNextPage, fetchNextPage, isFetchingNextPage])
}

/** `GET /v1/notes/shared-with-me`: notes others shared with the caller. Must be used inside `WorkspaceProviders`. */
export function useSharedNotes(): SharedNotesValue {
  return useFeatureContext(SharedNotesContext)
}
