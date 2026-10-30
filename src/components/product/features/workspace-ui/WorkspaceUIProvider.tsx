'use client'

import type { ReactNode } from 'react'
import { SidePanelProvider, useSidePanelHost } from '../../workspace/sidePanel'
import { WorkspaceUIContext, useWorkspaceUIState } from '@/hooks/use-workspace-ui'

/**
 * Shares the workspace chrome's state, and hosts the docked side panels. The logic lives in
 * `useWorkspaceUIState` (`src/hooks/use-workspace-ui.ts`); this runs it once and shares it.
 */
export function WorkspaceUIProvider({ children }: { children: ReactNode }) {
  const panels = useSidePanelHost()
  return <WorkspaceUIContext.Provider value={useWorkspaceUIState(panels)}>
    <SidePanelProvider registry={panels.registry} top={panels.top}>{children}</SidePanelProvider>
  </WorkspaceUIContext.Provider>
}
