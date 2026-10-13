"use client"

import { useEffect, useCallback, useRef } from "react"
import type { Editor } from "@tiptap/react"
import { columnResizingPluginKey } from "@tiptap/pm/tables"
import type { Transaction } from "@tiptap/pm/state"

export function useResizeOverlay(
  editor: Editor | null,
  updateSelectionRect: () => void
) {
  const rafId = useRef<number | null>(null)
  const layoutRafId = useRef<number | null>(null)

  const stopLoop = useCallback(() => {
    if (rafId.current != null) {
      cancelAnimationFrame(rafId.current)
      rafId.current = null
    }
  }, [])

  const startLoop = useCallback(() => {
    if (rafId.current != null) return
    const tick = () => {
      const st = columnResizingPluginKey.getState(editor!.state)
      const dragging = !!st?.dragging
      updateSelectionRect() // mutate overlay styles; avoid setState if possible
      if (dragging && !editor!.isDestroyed) {
        rafId.current = requestAnimationFrame(tick)
      } else {
        stopLoop()
        // one final sync after mouseup
        updateSelectionRect()
      }
    }
    rafId.current = requestAnimationFrame(tick)
  }, [editor, updateSelectionRect, stopLoop])

  useEffect(() => {
    if (!editor) return

    const onTx = ({ transaction }: { transaction: Transaction }) => {
      // this is for non-resize txs that may affect selection
      updateSelectionRect()

      const meta = transaction.getMeta(columnResizingPluginKey)
      if (!meta) return

      // drag start
      if (
        Object.prototype.hasOwnProperty.call(meta, "setDragging") &&
        meta.setDragging
      ) {
        startLoop()
      }

      // drag end is also a tx with setDragging: null — rAF loop will notice and stop itself
      if (
        Object.prototype.hasOwnProperty.call(meta, "setDragging") &&
        meta.setDragging == null
      ) {
        // if loop missed it for any reason, force a stop + final sync
        stopLoop()
        updateSelectionRect()
      }

      // handle-only hover (optional): update once for cursor changes, etc.
      if (Object.prototype.hasOwnProperty.call(meta, "setHandle")) {
        updateSelectionRect()
      }
    }

    editor.on("transaction", onTx)
    return () => {
      editor.off("transaction", onTx)
      stopLoop()
    }
  }, [editor, startLoop, stopLoop, updateSelectionRect])

  useEffect(() => {
    if (!editor) return

    const scheduleLayoutSync = () => {
      if (layoutRafId.current != null) return

      layoutRafId.current = requestAnimationFrame(() => {
        layoutRafId.current = null
        updateSelectionRect()
      })
    }

    const editorDom = editor.view.dom
    const editorContainer = editorDom.parentElement
    // Portalled overlays use viewport coordinates. A surrounding layout
    // transition can move the editor without producing an editor transaction.
    const resizeObserver = new ResizeObserver(scheduleLayoutSync)

    resizeObserver.observe(editorDom)
    if (editorContainer) resizeObserver.observe(editorContainer)
    window.addEventListener("resize", scheduleLayoutSync)

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener("resize", scheduleLayoutSync)

      if (layoutRafId.current != null) {
        cancelAnimationFrame(layoutRafId.current)
        layoutRafId.current = null
      }
    }
  }, [editor, updateSelectionRect])
}
