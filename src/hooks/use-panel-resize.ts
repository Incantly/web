'use client'

import { useRef, type KeyboardEvent, type PointerEvent } from 'react'
import { PANEL_DEFAULT, PANEL_KEY_STEP, PANEL_MIN, clampPanelWidth, panelMaxWidth, sidebarWidth } from '@/components/product/workspace/panelWidthModel'
import { useWorkspaceUI } from '@/hooks/use-workspace-ui'

/**
 * Dragging the docked panel's left edge to resize it (also ←/→, Home/End, and double-click to reset).
 * While dragging, the width goes straight to the `--panel-width` CSS variable on the workspace, so the
 * page doesn't re-render on every pointer move; it's saved to state (and this device) on release.
 */
export function usePanelResize() {
  const { panelWidth, setPanelWidth, rail } = useWorkspaceUI()
  const sidebar = sidebarWidth(rail.expanded)
  const drag = useRef<{ startX: number; startWidth: number; width: number; root: HTMLElement } | null>(null)

  const finish = () => {
    const current = drag.current
    if (!current) return
    drag.current = null
    delete current.root.dataset.panelResizing
    document.body.style.removeProperty('cursor')
    document.body.style.removeProperty('user-select')
    setPanelWidth(current.width)
  }

  return {
    role: 'separator' as const,
    'aria-orientation': 'vertical' as const,
    'aria-label': 'Resize panel',
    'aria-valuemin': PANEL_MIN,
    'aria-valuemax': panelMaxWidth(typeof window === 'undefined' ? 0 : window.innerWidth, sidebar),
    'aria-valuenow': panelWidth,
    tabIndex: 0,
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return
      const root = event.currentTarget.closest<HTMLElement>('[data-workspace]')
      if (!root) return
      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      // Start from what's on screen, which may be narrower than the saved width on a small window.
      const shown = event.currentTarget.parentElement?.getBoundingClientRect().width ?? panelWidth
      drag.current = { startX: event.clientX, startWidth: shown, width: Math.round(shown), root }
      root.dataset.panelResizing = ''
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      const current = drag.current
      if (!current) return
      // The edge is on the panel's left, so moving left makes it wider.
      current.width = clampPanelWidth(current.startWidth + current.startX - event.clientX, window.innerWidth, sidebar)
      current.root.style.setProperty('--panel-width', `${current.width}px`)
    },
    onPointerUp: finish,
    onPointerCancel: finish,
    onLostPointerCapture: finish,
    onDoubleClick: () => setPanelWidth(PANEL_DEFAULT),
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      const max = panelMaxWidth(window.innerWidth, sidebar)
      const next = event.key === 'ArrowLeft' ? panelWidth + PANEL_KEY_STEP
        : event.key === 'ArrowRight' ? panelWidth - PANEL_KEY_STEP
        : event.key === 'Home' ? PANEL_MIN
        : event.key === 'End' ? max
        : null
      if (next === null) return
      event.preventDefault()
      setPanelWidth(clampPanelWidth(next, window.innerWidth, sidebar))
    },
  }
}
