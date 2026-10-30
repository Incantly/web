'use client'

import { useEffect, useRef } from 'react'
import { useWorkspaceUI } from '@/hooks/use-workspace-ui'

/**
 * Every workspace keyboard shortcut in one place (Settings › General lists them):
 * ⌘K search bar (toggles), ⌘J chat, ⌘\ sidebar, ⌘, settings. ⌘F (find in note) lives in the editor.
 */
export function useWorkspaceShortcuts() {
  const ui = useWorkspaceUI()
  // The listener is registered once; it reads the latest actions through a ref.
  const latest = useRef(ui)
  useEffect(() => { latest.current = ui })

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return
      const current = latest.current
      const key = event.key.toLowerCase()
      if (key === '\\') { event.preventDefault(); current.rail.toggle() }
      else if (key === ',') { event.preventDefault(); current.openSettings() }
      else if (key === 'j') { event.preventDefault(); current.toggleAssistant() }
      else if (key === 'k') { event.preventDefault(); current.toggleSearch() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
