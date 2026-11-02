'use client'

import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import type { Editor } from '@tiptap/core'
import { useCallback, useMemo, useState } from 'react'
import type { AssistantContext } from '@/components/product/assistant/AssistantPanel'
import { useCurrentUser } from '@/components/product/SessionGate'
import { createFeatureContext, useFeatureContext } from '@/components/product/features/createFeatureContext'
import { useNavigation } from '@/hooks/use-navigation'
import { useNotes } from '@/hooks/use-notes'
import { useSpaces } from '@/hooks/use-spaces'
import { useWorkspaceUI } from '@/hooks/use-workspace-ui'
import type { NoteSession } from '@/components/product/workspace/useNoteSession'
import { aiApi, type AiAllowance, type SelectionRange } from '@/lib/api/ai'
import { selectedText, selectedTextRanges } from '@/lib/document-editor/blockNavigation'

/** Text picked in the note editor and attached to the next chat message. Only the ranges are sent; `quote` is for display. */
export type ChatSelection = { noteId: string; revisionNumber: number; ranges: SelectionRange[]; quote: string }

export type AssistantValue = {
  /** Today's remaining AI spend (`GET /v1/ai/allowance`), shared by the chat and Settings. */
  allowance: UseQueryResult<AiAllowance>
  /** Re-read the allowance, e.g. after a job failed with AI_DAILY_LIMIT_REACHED. */
  refreshAllowance: () => void
  /** What the chat is about right now: the open note, and the Space it belongs to. */
  context: AssistantContext
  /** The chat is only offered on a note; elsewhere its button, ⌘J and "Ask AI" do nothing. */
  available: boolean
  /** The chat panel is showing: opened, and on a note. */
  open: boolean
  /** Text attached from the open note, if any. */
  selection: ChatSelection | null
  /** Attach text from the note and open the chat. */
  attachSelection: (selection: ChatSelection) => void
  clearSelection: () => void
}

export const AssistantStateContext = createFeatureContext<AssistantValue>('Assistant')

export const allowanceKey = (userId: string) => ['ai-allowance', userId] as const

/** `/v1/ai`: the assistant's shared state. Each chat thread's jobs live in `useAssistantChat`. Runs once, in `AssistantProvider`. */
export function useAssistantState(): AssistantValue {
  const user = useCurrentUser()
  const client = useQueryClient()
  const { assistantOpen, settingsOpen, openAssistant } = useWorkspaceUI()
  const [attached, setAttached] = useState<ChatSelection | null>(null)
  const { activeNoteId } = useNavigation()
  const { activeNote } = useNotes()
  const { activeSpace, noteSpace } = useSpaces()
  // Only fetched while something that shows it is open.
  const allowance = useQuery({ queryKey: allowanceKey(user.id), queryFn: ({ signal }) => aiApi.allowance(signal), enabled: (assistantOpen && Boolean(activeNoteId)) || settingsOpen, staleTime: 60_000, retry: false })
  const refreshAllowance = useCallback(() => { void client.invalidateQueries({ queryKey: allowanceKey(user.id) }) }, [client, user.id])
  const noteTitle = activeNote?.title ?? ''
  const context = useMemo<AssistantContext>(() => ({
    note: activeNoteId ? { id: activeNoteId, title: noteTitle } : undefined,
    space: activeSpace ?? noteSpace,
  }), [activeNoteId, noteTitle, activeSpace, noteSpace])

  // Belongs to one note: moving to another note hides it.
  const selection = attached && attached.noteId === activeNoteId ? attached : null
  const attachSelection = useCallback((next: ChatSelection) => { setAttached(next); openAssistant() }, [openAssistant])
  const clearSelection = useCallback(() => setAttached(null), [])

  const available = Boolean(activeNoteId)
  const open = assistantOpen && available
  return useMemo<AssistantValue>(() => ({ allowance, refreshAllowance, context, available, open, selection, attachSelection, clearSelection }), [allowance, refreshAllowance, context, available, open, selection, attachSelection, clearSelection])
}

/** `/v1/ai`: the shared AI allowance and what the chat is about. Must be used inside `WorkspaceProviders`. */
export function useAssistant(): AssistantValue {
  return useFeatureContext(AssistantStateContext)
}

const QUOTE_MAX = 160

/**
 * "Add to chat" in the note editor: sends the note's pending edits (the server reads the selected
 * text from the saved note), then attaches the selection by block IDs and offsets and opens the chat.
 */
export function useAddSelectionToChat(noteId: string, session: NoteSession) {
  const { attachSelection } = useAssistant()
  const [error, setError] = useState<string | null>(null)
  const addToChat = useCallback(async (editor: Editor | null) => {
    const ranges = selectedTextRanges(editor)
    if (!ranges.length) { setError('Select some text in the note first.'); return }
    const text = selectedText(editor)
    const quote = text.length > QUOTE_MAX ? `${text.slice(0, QUOTE_MAX).trimEnd()}…` : text
    setError(null)
    const state = await session.flush()
    if (!state || state.pending > 0) { setError('Your latest edits haven’t saved yet. Try again once the note says Saved.'); return }
    attachSelection({ noteId, revisionNumber: state.revisionNumber, ranges, quote })
  }, [attachSelection, noteId, session])
  return { addToChat, error, dismissError: () => setError(null) }
}
