'use client'

import { useFeatureContext } from '@/components/product/features/createFeatureContext'
import { AssistantStateContext, type AssistantValue } from '@/components/product/features/assistant/AssistantProvider'

/** `/v1/ai`: the shared AI allowance and what the chat is about. Must be used inside `WorkspaceProviders`. */
export function useAssistant(): AssistantValue {
  return useFeatureContext(AssistantStateContext)
}
