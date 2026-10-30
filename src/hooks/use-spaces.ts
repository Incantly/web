'use client'

import { useCallback, useMemo } from 'react'
import { useCurrentUser } from '@/components/product/SessionGate'
import { createFeatureContext, useFeatureContext } from '@/components/product/features/createFeatureContext'
import type { SpaceRecord } from '@/components/product/workspace/model'
import { createSpaceVariables, useSpaceActions, useSpaces as useSpacesQuery } from '@/components/product/workspace/useSpaces'
import type { ListStatus } from '@/components/product/workspace/views'
import { useNavigation } from '@/hooks/use-navigation'

export type SpacesValue = {
  spaces: SpaceRecord[]
  status: ListStatus
  /** The Space page being shown, if any. */
  activeSpace: SpaceRecord | undefined
  /** The Space the open note was opened from, if any. */
  noteSpace: SpaceRecord | undefined
  /** Create a Space and open it. */
  createSpace: (draft: { name: string; description: string; icon: string }) => Promise<void>
  /** Put a note in a Space (used when creating a note inside one). */
  addNoteToSpace: (spaceId: string, noteId: string) => Promise<void>
}

export const SpacesContext = createFeatureContext<SpacesValue>('Spaces')

/** `/v1/spaces`: the user's Spaces and the workspace-level actions on them. Runs once, in `SpacesProvider`. */
export function useSpacesState(): SpacesValue {
  const user = useCurrentUser()
  const { activeSpaceId, activeNoteId, noteSpaceId, navigate } = useNavigation()
  const query = useSpacesQuery(user.id)
  const actions = useSpaceActions(user.id)
  const { spaces, isPending, isError, error, refetch } = query
  const openNoteSpaceId = activeNoteId ? noteSpaceId(activeNoteId) : null

  const createSpace = useCallback(async (draft: { name: string; description: string; icon: string }) => {
    const space = await actions.create.mutateAsync(createSpaceVariables(draft))
    navigate(`space:${space.id}`)
  }, [actions.create, navigate])
  const addNoteToSpace = useCallback(async (spaceId: string, noteId: string) => {
    await actions.addNote.mutateAsync({ spaceId, noteId })
  }, [actions.addNote])

  return useMemo<SpacesValue>(() => ({
    spaces,
    status: { loading: isPending, error: isError ? error : null, retry: () => void refetch() },
    activeSpace: activeSpaceId ? spaces.find((space) => space.id === activeSpaceId) : undefined,
    noteSpace: openNoteSpaceId ? spaces.find((space) => space.id === openNoteSpaceId) : undefined,
    createSpace,
    addNoteToSpace,
  }), [spaces, isPending, isError, error, refetch, activeSpaceId, openNoteSpaceId, createSpace, addNoteToSpace])
}

/** `/v1/spaces`: the Spaces list, the open Space, and creating Spaces. Must be used inside `WorkspaceProviders`. */
export function useSpaces(): SpacesValue {
  return useFeatureContext(SpacesContext)
}
