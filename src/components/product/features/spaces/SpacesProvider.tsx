'use client'

import { useCallback, useMemo, type ReactNode } from 'react'
import { useCurrentUser } from '../../SessionGate'
import type { SpaceRecord } from '../../workspace/model'
import { createSpaceVariables, useSpaceActions, useSpaces as useSpacesQuery } from '../../workspace/useSpaces'
import type { ListStatus } from '../../workspace/views'
import { createFeatureContext } from '../createFeatureContext'
import { useNavigation } from '../navigation/NavigationProvider'

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

const [SpacesContext, useSpaces] = createFeatureContext<SpacesValue>('Spaces')
export { useSpaces }

/** `/v1/spaces`: the user's Spaces and the workspace-level actions on them. */
export function SpacesProvider({ children }: { children: ReactNode }) {
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

  const value = useMemo<SpacesValue>(() => ({
    spaces,
    status: { loading: isPending, error: isError ? error : null, retry: () => void refetch() },
    activeSpace: activeSpaceId ? spaces.find((space) => space.id === activeSpaceId) : undefined,
    noteSpace: openNoteSpaceId ? spaces.find((space) => space.id === openNoteSpaceId) : undefined,
    createSpace,
    addNoteToSpace,
  }), [spaces, isPending, isError, error, refetch, activeSpaceId, openNoteSpaceId, createSpace, addNoteToSpace])

  return <SpacesContext.Provider value={value}>{children}</SpacesContext.Provider>
}
