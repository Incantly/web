'use client'

import type { ReactNode } from 'react'
import { AssistantProvider } from './assistant/AssistantProvider'
import { ImportsProvider } from './imports/ImportsProvider'
import { LibraryProvider } from './library/LibraryProvider'
import { NavigationProvider } from './navigation/NavigationProvider'
import { NotesProvider } from './notes/NotesProvider'
import { SpacesProvider } from './spaces/SpacesProvider'
import { WorkspaceUIProvider } from './workspace-ui/WorkspaceUIProvider'

/**
 * Every workspace feature context, outermost first. Each one may use the ones above it:
 * UI → Navigation → Spaces → Notes → Library → Imports → Assistant.
 * Components read them through `src/hooks/use-<feature>.ts`. A new API-backed feature adds its
 * provider here and its hook there (see AGENTS.md, "Feature contexts").
 */
export function WorkspaceProviders({ children }: { children: ReactNode }) {
  return <WorkspaceUIProvider>
    <NavigationProvider>
      <SpacesProvider>
        <NotesProvider>
          <LibraryProvider>
            <ImportsProvider>
              <AssistantProvider>{children}</AssistantProvider>
            </ImportsProvider>
          </LibraryProvider>
        </NotesProvider>
      </SpacesProvider>
    </NavigationProvider>
  </WorkspaceUIProvider>
}
