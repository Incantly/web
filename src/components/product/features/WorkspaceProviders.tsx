'use client'

import type { ReactNode } from 'react'
import { AssistantProvider } from './assistant/AssistantProvider'
import { BillingProvider } from './billing/BillingProvider'
import { CommentsProvider } from './comments/CommentsProvider'
import { ImportsProvider } from './imports/ImportsProvider'
import { LibraryProvider } from './library/LibraryProvider'
import { LiveCollabProvider } from './live-collab/LiveCollabProvider'
import { NavigationProvider } from './navigation/NavigationProvider'
import { NoteBindingsProvider } from './note-bindings/NoteBindingsProvider'
import { NotesProvider } from './notes/NotesProvider'
import { SharedNotesProvider } from './shared-notes/SharedNotesProvider'
import { SharingProvider } from './sharing/SharingProvider'
import { SpacesProvider } from './spaces/SpacesProvider'
import { TrashProvider } from './trash/TrashProvider'
import { WorkspaceUIProvider } from './workspace-ui/WorkspaceUIProvider'

/**
 * Every workspace feature context, outermost first. Each one may use the ones above it:
 * UI → Navigation → Spaces → Notes → Trash → SharedNotes → Sharing → LiveCollab → Comments → Library → NoteBindings → Imports → Assistant → Billing.
 * Each feature's logic lives in `src/hooks/use-<feature>.ts`; its provider runs it once and shares it.
 * A new API-backed feature adds its hook there and its provider here (see AGENTS.md, "Feature contexts").
 */
export function WorkspaceProviders({ children }: { children: ReactNode }) {
  return <WorkspaceUIProvider>
    <NavigationProvider>
      <SpacesProvider>
        <NotesProvider>
          <TrashProvider>
            <SharedNotesProvider>
              <SharingProvider>
                <LiveCollabProvider>
                  <CommentsProvider>
                    <LibraryProvider>
                      <NoteBindingsProvider>
                        <ImportsProvider>
                          <AssistantProvider><BillingProvider>{children}</BillingProvider></AssistantProvider>
                        </ImportsProvider>
                      </NoteBindingsProvider>
                    </LibraryProvider>
                  </CommentsProvider>
                </LiveCollabProvider>
              </SharingProvider>
            </SharedNotesProvider>
          </TrashProvider>
        </NotesProvider>
      </SpacesProvider>
    </NavigationProvider>
  </WorkspaceUIProvider>
}
