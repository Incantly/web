'use client'

import { useEffect, useRef } from 'react'
import { useNavigation } from '@/hooks/use-navigation'
import { useWorkspaceUI } from '@/hooks/use-workspace-ui'

/** The Search page's field, focused by ⌘K. */
export const WORKSPACE_SEARCH_INPUT_ID = 'workspace-search'

/**
 * Every workspace keyboard shortcut in one place (Settings › General lists them):
 * ⌘K search, ⌘J chat, ⌘\ sidebar, ⌘, settings. ⌘F (find in note) lives in the editor.
 */
export function useWorkspaceShortcuts() {
  const ui = useWorkspaceUI()
  const { navigate } = useNavigation()
  // The listener is registered once; it reads the latest actions through a ref.
  const latest = useRef({ ui, navigate })
  useEffect(() => { latest.current = { ui, navigate } })

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return
      const { ui: current, navigate: go } = latest.current
      const key = event.key.toLowerCase()
      if (key === '\\') { event.preventDefault(); current.rail.toggle() }
      else if (key === ',') { event.preventDefault(); current.openSettings() }
      else if (key === 'j') { event.preventDefault(); current.toggleAssistant() }
      else if (key === 'k') {
        event.preventDefault()
        go('search')
        window.setTimeout(() => document.getElementById(WORKSPACE_SEARCH_INPUT_ID)?.focus(), 0)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
