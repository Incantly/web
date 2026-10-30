'use client'

import type { ReactNode } from 'react'
import { AssistantStateContext, useAssistantState } from '@/hooks/use-assistant'

/** Shares the assistant's allowance and context. The logic lives in `useAssistantState` (`src/hooks/use-assistant.ts`); this runs it once and shares it. */
export function AssistantProvider({ children }: { children: ReactNode }) {
  return <AssistantStateContext.Provider value={useAssistantState()}>{children}</AssistantStateContext.Provider>
}
