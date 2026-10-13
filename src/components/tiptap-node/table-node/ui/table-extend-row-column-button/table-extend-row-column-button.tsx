"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { type Editor } from "@tiptap/react"
import type { Node } from "@tiptap/pm/model"
import {
  TableMap,
  removeColumn,
  removeRow,
  selectedRect,
} from "@tiptap/pm/tables"
import { FloatingPortal } from "@floating-ui/react"

// --- Hooks ---
import { useTiptapEditor } from "@/hooks/use-tiptap-editor"
import { useTableHandleState } from "@/components/tiptap-node/table-node/hooks/use-table-handle-state"

// --- Lib ---
import type { Orientation } from "@/components/tiptap-node/table-node/lib/tiptap-table-utils"
import {
  EMPTY_CELL_HEIGHT,
  EMPTY_CELL_WIDTH,
  countEmptyRowsFromEnd,
  countEmptyColumnsFromEnd,
  getTable,
  marginRound,
  selectLastCell,
  runPreservingCursor,
} from "@/components/tiptap-node/table-node/lib/tiptap-table-utils"
import { cn } from "@/lib/tiptap-utils"

// --- Icons ---
import { PlusSmallIcon } from "@/components/tiptap-icons/plus-small-icon"

// --- Internal ---
import { useTableExtendRowColumnButtonsPositioning } from "@/components/tiptap-node/table-node/ui/table-extend-row-column-button/use-table-extend-row-column"
import "./table-extend-row-column-button.scss"

interface TableExtendRowColumnButtonProps {
  editor?: Editor | null
  block: Node
  onMouseDown: () => void
  onMouseUp: () => void
  orientation: Orientation
  children?: React.ReactNode
}

/**
 * Simplified button component for extending/reducing table dimensions
 */
export const TableExtendRowColumnButton: React.FC<
  TableExtendRowColumnButtonProps
> = ({
  editor: providedEditor,
  onMouseDown,
  onMouseUp,
  orientation,
  children,
}) => {
  const { editor } = useTiptapEditor(providedEditor)
  const state = useTableHandleState({ editor })
  const isRowOrientation = orientation === "row"

  const movedRef = useRef(false)
  const [dragState, setDragState] = useState<{
    startPos: number
    originalHeight: number
    originalWidth: number
  } | null>(null)

  const startDrag = useCallback(
    (ev: React.MouseEvent) => {
      if (!state) return

      const dims = TableMap.get(state.block)
      movedRef.current = false

      setDragState({
        startPos: isRowOrientation ? ev.clientY : ev.clientX,
        originalHeight: dims.height,
        originalWidth: dims.width,
      })

      onMouseDown()
      ev.preventDefault()
    },
    [state, isRowOrientation, onMouseDown]
  )

  const handleClick = useCallback(() => {
    if (movedRef.current || !editor || !state) return

    runPreservingCursor(editor, () => {
      selectLastCell(editor, state.block, state.blockPos, orientation)

      if (isRowOrientation) {
        editor.commands.addRowAfter()
      } else {
        editor.commands.addColumnAfter()
      }
    })
  }, [editor, isRowOrientation, orientation, state])

  useEffect(() => {
    if (!dragState || !editor || !state) return

    const handleMove = (ev: MouseEvent) => {
      movedRef.current = true

      const currentPos = isRowOrientation ? ev.clientY : ev.clientX
      const diff = currentPos - dragState.startPos
      const cellSize = isRowOrientation ? EMPTY_CELL_HEIGHT : EMPTY_CELL_WIDTH

      const table = getTable(editor, state.blockPos)
      if (!table) return

      const currentDims = table.map
      const currentCount = isRowOrientation
        ? currentDims.height
        : currentDims.width
      const originalCount = isRowOrientation
        ? dragState.originalHeight
        : dragState.originalWidth

      const newCount = Math.max(
        1,
        originalCount + marginRound(diff / cellSize, 0.3)
      )
      const delta = newCount - currentCount

      if (delta === 0) return

      // Add rows/columns
      if (delta > 0) {
        runPreservingCursor(editor, () => {
          selectLastCell(editor, state.block, state.blockPos, orientation)

          for (let i = 0; i < delta; i++) {
            if (isRowOrientation) {
              editor.commands.addRowAfter()
            } else {
              editor.commands.addColumnAfter()
            }
          }
        })
      }
      // Remove rows/columns - but only if they're empty
      else {
        runPreservingCursor(editor, () => {
          const absDelta = Math.abs(delta)

          const emptyCount = isRowOrientation
            ? countEmptyRowsFromEnd(editor, state.blockPos)
            : countEmptyColumnsFromEnd(editor, state.blockPos)

          // Only remove up to the number of empty cells, and keep at least 1
          const safeToRemove = Math.min(absDelta, emptyCount, currentCount - 1)

          for (let i = 0; i < safeToRemove; i++) {
            if (
              !selectLastCell(editor, state.block, state.blockPos, orientation)
            ) {
              break
            }

            // Remove the last line itself: a merged cell that reaches into it
            // shrinks, where deleteRow and deleteColumn would remove every
            // line the merged cell spans
            const rect = selectedRect(editor.state)
            const tr = editor.state.tr
            if (isRowOrientation) {
              removeRow(tr, rect, rect.map.height - 1)
            } else {
              removeColumn(tr, rect, rect.map.width - 1)
            }
            editor.view.dispatch(tr)
          }
        })
      }
    }

    const handleUp = () => {
      setDragState(null)
      onMouseUp()
    }

    window.addEventListener("mousemove", handleMove)
    window.addEventListener("mouseup", handleUp)

    return () => {
      window.removeEventListener("mousemove", handleMove)
      window.removeEventListener("mouseup", handleUp)
    }
  }, [dragState, editor, isRowOrientation, orientation, onMouseUp, state])

  if (!editor?.isEditable) return null

  return (
    <button
      className={cn(
        "tiptap-table-extend-row-column-button",
        isRowOrientation
          ? "tiptap-table-row-end-add-remove"
          : "tiptap-table-column-end-add-remove",
        dragState && "editing"
      )}
      onClick={handleClick}
      onMouseDown={startDrag}
      type="button"
      aria-label={
        isRowOrientation ? "Add or remove rows" : "Add or remove columns"
      }
    >
      {children ?? <PlusSmallIcon className="tiptap-button-icon" />}
    </button>
  )
}

export interface TableExtendRowColumnButtonsProps {
  editor?: Editor | null
  onMouseDown?: () => void
  onMouseUp?: () => void
  /** Render outside CSS-zoomed editor content. */
  portalToBody?: boolean
}

export const TableExtendRowColumnButtons: React.FC<
  TableExtendRowColumnButtonsProps
> = ({
  editor: providedEditor,
  onMouseDown,
  onMouseUp,
  portalToBody = false,
}) => {
  const { editor } = useTiptapEditor(providedEditor)
  const state = useTableHandleState({ editor })
  const { columnButton, rowButton } = useTableExtendRowColumnButtonsPositioning(
    state?.showAddOrRemoveColumnsButton ?? false,
    state?.showAddOrRemoveRowsButton ?? false,
    state?.referencePosTable ?? null
  )

  const handleDown = useCallback(() => {
    if (!editor) return
    editor.commands.freezeHandles()
    onMouseDown?.()
  }, [editor, onMouseDown])

  const handleUp = useCallback(() => {
    if (!editor) return
    editor.commands.unfreezeHandles()
    onMouseUp?.()
  }, [editor, onMouseUp])

  if (!state) return null

  return (
    <FloatingPortal root={portalToBody ? undefined : state.widgetContainer}>
      <div
        className={
          portalToBody ? "tiptap-table-control-viewport-floating" : undefined
        }
        ref={rowButton.ref}
        style={rowButton.style}
        inert={!rowButton.isMounted}
      >
        <TableExtendRowColumnButton
          editor={editor}
          orientation="row"
          block={state.block}
          onMouseDown={handleDown}
          onMouseUp={handleUp}
        />
      </div>

      <div
        className={
          portalToBody ? "tiptap-table-control-viewport-floating" : undefined
        }
        ref={columnButton.ref}
        style={columnButton.style}
        inert={!columnButton.isMounted}
      >
        <TableExtendRowColumnButton
          editor={editor}
          orientation="column"
          block={state.block}
          onMouseDown={handleDown}
          onMouseUp={handleUp}
        />
      </div>
    </FloatingPortal>
  )
}
