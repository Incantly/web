'use client'

import { useFeatureContext } from '@/components/product/features/createFeatureContext'
import { WorkspaceUIContext, type WorkspaceUIValue } from '@/components/product/features/workspace-ui/WorkspaceUIProvider'

/** Workspace chrome: sidebar, rail, docked panels, dialogs, search query, inbox. Must be used inside `WorkspaceProviders`. */
export function useWorkspaceUI(): WorkspaceUIValue {
  return useFeatureContext(WorkspaceUIContext)
}
