'use client'

import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { useCallback, useMemo, type ReactNode } from 'react'
import { aiApi, type AiAllowance } from '../../../../lib/api/ai'
import type { AssistantContext } from '../../assistant/AssistantPanel'
import { useCurrentUser } from '../../SessionGate'
import { createFeatureContext } from '../createFeatureContext'
import { useNavigation } from '../navigation/NavigationProvider'
import { useNotes } from '../notes/NotesProvider'
import { useSpaces } from '../spaces/SpacesProvider'
import { useWorkspaceUI } from '../workspace-ui/WorkspaceUIProvider'

export type AssistantValue = {
  /** Today's remaining AI spend (`GET /v1/ai/allowance`), shared by the chat and Settings. */
  allowance: UseQueryResult<AiAllowance>
  /** Re-read the allowance, e.g. after a job failed with AI_DAILY_LIMIT_REACHED. */
  refreshAllowance: () => void
  /** What the chat is about right now: the open note, and the Space it belongs to. */
  context: AssistantContext
}

const [AssistantStateContext, useAssistant] = createFeatureContext<AssistantValue>('Assistant')
export { useAssistant }

export const allowanceKey = (userId: string) => ['ai-allowance', userId] as const

/** `/v1/ai`: the assistant's shared state. Each chat thread's jobs live in `useAssistantChat`. */
export function AssistantProvider({ children }: { children: ReactNode }) {
  const user = useCurrentUser()
  const client = useQueryClient()
  const { assistantOpen, settingsOpen } = useWorkspaceUI()
  const { activeNoteId } = useNavigation()
  const { activeNote } = useNotes()
  const { activeSpace, noteSpace } = useSpaces()
  // Only fetched while something that shows it is open.
  const allowance = useQuery({ queryKey: allowanceKey(user.id), queryFn: ({ signal }) => aiApi.allowance(signal), enabled: assistantOpen || settingsOpen, staleTime: 60_000, retry: false })
  const refreshAllowance = useCallback(() => { void client.invalidateQueries({ queryKey: allowanceKey(user.id) }) }, [client, user.id])
  const noteTitle = activeNote?.title ?? ''
  const context = useMemo<AssistantContext>(() => ({
    note: activeNoteId ? { id: activeNoteId, title: noteTitle } : undefined,
    space: activeSpace ?? noteSpace,
  }), [activeNoteId, noteTitle, activeSpace, noteSpace])

  const value = useMemo<AssistantValue>(() => ({ allowance, refreshAllowance, context }), [allowance, refreshAllowance, context])
  return <AssistantStateContext.Provider value={value}>{children}</AssistantStateContext.Provider>
}
