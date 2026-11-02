'use client'

import { useEffect, useRef } from 'react'
import { useAssistant } from '@/hooks/use-assistant'
import { useWorkspaceUI } from '@/hooks/use-workspace-ui'

/**
 * Every workspace keyboard shortcut in one place (Settings › General lists them):
 * ⌘K search bar (toggles), ⌘J chat (on a note), ⌘\ sidebar, ⌘, settings. ⌘F (find in note) lives in the editor.
 */
export function useWorkspaceShortcuts() {
  const ui = useWorkspaceUI()
  const { available: chatAvailable } = useAssistant()
  // The listener is registered once; it reads the latest actions through a ref.
  const latest = useRef({ ui, chatAvailable })
  useEffect(() => { latest.current = { ui, chatAvailable } })

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return
      const { ui: current, chatAvailable: canChat } = latest.current
      const key = event.key.toLowerCase()
      if (key === '\\') { event.preventDefault(); current.rail.toggle() }
      else if (key === ',') { event.preventDefault(); current.openSettings() }
      else if (key === 'j') { if (canChat) { event.preventDefault(); current.toggleAssistant() } }
      else if (key === 'k') { event.preventDefault(); current.toggleSearch() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
