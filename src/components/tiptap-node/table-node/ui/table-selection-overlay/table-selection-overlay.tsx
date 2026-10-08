"use client"

import { useEffect, useState, useCallback, useMemo, useRef } from "react"
import type { Editor } from "@tiptap/react"
import {
  CellSelection,
  TableMap,
  cellAround,
  findCell,
  pointsAtCell,
} from "@tiptap/pm/tables"
import type { EditorState, Selection, Transaction } from "@tiptap/pm/state"
import type { Node } from "@tiptap/pm/model"
import type { EditorView } from "@tiptap/pm/view"
import { autoUpdate, FloatingPortal, useFloating } from "@floating-ui/react"

// --- Hooks ---
import { useTiptapEditor } from "@/hooks/use-tiptap-editor"
import { useResizeOverlay } from "@/components/tiptap-node/table-node/ui/table-selection-overlay/use-resize-overlay"

// --- Lib ---
import {
  domCellAround,
  getTable,
  rectEq,
} from "@/components/tiptap-node/table-node/lib/tiptap-table-utils"

export interface TableSelectionOverlayProps {
  editor?: Editor | null
  /**
   * Component rendered inside the selection overlay (typically the cell menu).
   *
   * IMPORTANT: pass a *stable* component reference — a module-level component
   * or one wrapped in `useMemo`/`useCallback`. Passing an inline arrow
   * (`cellMenu={(props) => <.../>}`) creates a new component type on every
   * render, so React remounts the whole menu subtree each time the parent
   * re-renders; under an editor that re-renders on every transaction this
   * escalates into "Maximum update depth exceeded".
   */
  cellMenu?: React.ComponentType<{
    onOpenChange?: (isOpen: boolean) => void
    editor?: Editor | null
    onResizeStart?: (handle: ResizeHandle) => (event: React.MouseEvent) => void
  }>
  showResizeHandles?: boolean
  onMenuOpenChange?: (isOpen: boolean) => void
  /** Render outside CSS-zoomed editor content. */
  portalToBody?: boolean
}

// tl = top-left
// tr = top-right
// bl = bottom-left
// br = bottom-right
type ResizeHandle = "tl" | "tr" | "bl" | "br" | null

// if an element’s edge is within 5px of the selection edge,
// it is treated as aligned.
const CORNER_DETECTION_TOLERANCE = 5

const getCellAtCoordinates = (
  state: EditorState,
  view: EditorView,
  x: number,
  y: number
) => {
  const pos = view.posAtCoords({ left: x, top: y })?.pos
  if (pos == null) return null

  const $pos = state.doc.resolve(pos)
  return cellAround($pos)
}

const getSelectionBoundingRect = (
  view: EditorView,
  selection: Selection
): DOMRect | null => {
  if (!(selection instanceof CellSelection)) return null

  // The anchor and head cells reach every edge of the TableMap rectangle.
  // Only a selected merged cell can reach past its right or bottom edge.
  const { $anchorCell, $headCell } = selection
  const tableStart = $anchorCell.start(-1)
  const map = TableMap.get($anchorCell.node(-1))
  const { width, height } = map
  const area = map.rectBetween(
    $anchorCell.pos - tableStart,
    $headCell.pos - tableStart
  )
  const offsets = new Set([
    $anchorCell.pos - tableStart,
    $headCell.pos - tableStart,
  ])
  const addOverflowing = (row: number, col: number, next: number) => {
    const offset = map.map[row * width + col]!
    if (map.map[next] !== offset) return
    // A cell that starts above or left of the rectangle is not selected.
    if (area.top > 0 && map.map[(area.top - 1) * width + col] === offset) return
    if (area.left > 0 && map.map[row * width + area.left - 1] === offset) return
    offsets.add(offset)
  }
  if (area.right < width) {
    for (let row = area.top; row < area.bottom; row++) {
      addOverflowing(row, area.right - 1, row * width + area.right)
    }
  }
  if (area.bottom < height) {
    for (let col = area.left; col < area.right; col++) {
      addOverflowing(area.bottom - 1, col, area.bottom * width + col)
    }
  }

  const cells: Element[] = []
  offsets.forEach((offset) => {
    const dom = view.nodeDOM(tableStart + offset) as Element | null
    if (dom) cells.push(dom)
  })

  if (cells.length === 0) return null

  const bounds = {
    left: Infinity,
    top: Infinity,
    right: -Infinity,
    bottom: -Infinity,
  }

  cells.forEach((cell) => {
    const rect = cell.getBoundingClientRect()
    bounds.left = Math.min(bounds.left, rect.left)
    bounds.top = Math.min(bounds.top, rect.top)
    bounds.right = Math.max(bounds.right, rect.right)
    bounds.bottom = Math.max(bounds.bottom, rect.bottom)
  })

  return new DOMRect(
    bounds.left,
    bounds.top,
    bounds.right - bounds.left,
    bounds.bottom - bounds.top
  )
}

const getSingleCellBoundingRect = (
  view: EditorView,
  cellPos: number
): DOMRect | null => {
  const cellDom = view.nodeDOM(cellPos) as Element | null
  if (!cellDom) return null

  const rect = cellDom.getBoundingClientRect()
  return new DOMRect(rect.left, rect.top, rect.width, rect.height)
}

const getEditorSelectionBoundingRect = (editor: Editor): DOMRect | null => {
  if (editor.isDestroyed) return null

  const { selection } = editor.state

  if (selection instanceof CellSelection) {
    return getSelectionBoundingRect(editor.view, selection)
  }

  const cell = cellAround(selection.$anchor)
  return cell ? getSingleCellBoundingRect(editor.view, cell.pos) : null
}

interface CornerPositions {
  topLeft: number | null
  topRight: number | null
  bottomLeft: number | null
  bottomRight: number | null
}

const findCornerCells = (
  view: EditorView,
  selection: CellSelection,
  selectionRect: DOMRect
): CornerPositions => {
  const corners: CornerPositions = {
    topLeft: null,
    topRight: null,
    bottomLeft: null,
    bottomRight: null,
  }

  // It takes two numbers: value1 and value2.
  // It calculates the absolute difference between them: Math.abs(value1 - value2).
  // It checks whether that difference is less than 5 (CORNER_DETECTION_TOLERANCE).
  // It returns a boolean:
  // true → if value1 and value2 are within 5 (CORNER_DETECTION_TOLERANCE) of each other.
  // false → if they are 5 or more units apart.
  const isNearEdge = (value1: number, value2: number) =>
    Math.abs(value1 - value2) < CORNER_DETECTION_TOLERANCE

  selection.forEachCell((_node: Node, pos: number) => {
    const dom = view.nodeDOM(pos) as Element | null
    if (!dom) return

    const cellRect = dom.getBoundingClientRect()

    // Top-left corner
    if (
      isNearEdge(cellRect.left, selectionRect.left) &&
      isNearEdge(cellRect.top, selectionRect.top)
    ) {
      corners.topLeft = pos
    }

    // Top-right corner
    if (
      isNearEdge(cellRect.right, selectionRect.right) &&
      isNearEdge(cellRect.top, selectionRect.top)
    ) {
      corners.topRight = pos
    }

    // Bottom-left corner
    if (
      isNearEdge(cellRect.left, selectionRect.left) &&
      isNearEdge(cellRect.bottom, selectionRect.bottom)
    ) {
      corners.bottomLeft = pos
    }

    // Bottom-right corner
    if (
      isNearEdge(cellRect.right, selectionRect.right) &&
      isNearEdge(cellRect.bottom, selectionRect.bottom)
    ) {
      corners.bottomRight = pos
    }
  })

  return corners
}

const getAnchorCellForHandle = (
  view: EditorView,
  selection: CellSelection,
  selectionRect: DOMRect,
  handle: ResizeHandle
): { pos: number } | null => {
  if (!handle) return null

  const corners = findCornerCells(view, selection, selectionRect)

  const anchorMap: Record<NonNullable<ResizeHandle>, keyof CornerPositions> = {
    tl: "bottomRight",
    tr: "bottomLeft",
    bl: "topRight",
    br: "topLeft",
  }

  const anchorPos = corners[anchorMap[handle]]
  return anchorPos ? { pos: anchorPos } : null
}

const createHandleStyles = (): React.CSSProperties => ({
  position: "absolute",
  width: 15,
  height: 15,
  borderRadius: "50%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "transparent",
  pointerEvents: "auto",
  zIndex: 10,
  touchAction: "none",
})

const createCornerHandleStyles = (
  position: "tl" | "tr" | "bl" | "br",
  isActiveHandle: boolean,
  isDisabled: boolean = false
): React.CSSProperties => {
  const baseStyles = createHandleStyles()

  const positionStyles: Record<typeof position, React.CSSProperties> = {
    tl: {
      top: -7.5,
      left: -7.5,
      cursor: isDisabled ? "default" : "nwse-resize",
    },
    tr: {
      top: -7.5,
      right: -7.5,
      cursor: isDisabled ? "default" : "nesw-resize",
    },
    bl: {
      bottom: -7.5,
      left: -7.5,
      cursor: isDisabled ? "default" : "nesw-resize",
    },
    br: {
      bottom: -7.5,
      right: -7.5,
      cursor: isDisabled ? "default" : "nwse-resize",
    },
  }

  return {
    ...baseStyles,
    ...positionStyles[position],
    opacity: isDisabled ? 0.3 : isActiveHandle ? 1 : 0.5,
    pointerEvents: isDisabled ? "none" : "auto",
  }
}

export const TableSelectionOverlay: React.FC<TableSelectionOverlayProps> = ({
  editor: providedEditor,
  cellMenu: CellMenu,
  showResizeHandles = true,
  onMenuOpenChange,
  portalToBody = false,
}) => {
  const { editor } = useTiptapEditor(providedEditor)
  const [isVisible, setIsVisible] = useState(true)
  const [selectionRect, setSelectionRect] = useState<DOMRect | null>(null)
  const [activeHandle, setActiveHandle] = useState<ResizeHandle>(null)
  const [tableDom, setTableDom] = useState<HTMLElement | null>(null)
  // FloatingPortal keeps its first portal node, so a new container needs a
  // new key.
  const [portalRoot, setPortalRoot] = useState<{
    container: HTMLElement | null
    key: number
  }>({ container: null, key: 0 })
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  const anchorCellRef = useRef<number | null>(null)
  const activeHandleRef = useRef<ResizeHandle>(null)
  const isMenuOpenRef = useRef(false)

  const positionReference = useMemo(() => {
    if (!editor) return null

    return {
      getBoundingClientRect: () =>
        getEditorSelectionBoundingRect(editor) ?? new DOMRect(),
    }
  }, [editor])

  const { refs, floatingStyles, update } = useFloating({
    placement: "top-start",
    ...(portalToBody && {
      whileElementsMounted(reference, floating, updatePosition) {
        return autoUpdate(reference, floating, updatePosition, {
          animationFrame: true,
        })
      },
    }),
  })

  useEffect(() => {
    refs.setPositionReference(positionReference)

    return () => refs.setPositionReference(null)
  }, [positionReference, refs])

  const updateSelectionRect = useCallback(() => {
    if (!editor) return

    const rect = getEditorSelectionBoundingRect(editor)

    if (!rect) {
      setIsVisible(false)
      setSelectionRect((prev) => (prev ? null : prev))
      return
    }

    setSelectionRect((prev) => (rectEq(prev, rect) ? prev : rect))
    setIsVisible(true)
  }, [editor])

  useResizeOverlay(editor, updateSelectionRect)

  useEffect(() => {
    if (update && selectionRect) {
      update()
    }
  }, [update, selectionRect])

  const createResizeHandler = useCallback(
    (handle: ResizeHandle) => (event: React.MouseEvent) => {
      if (
        !editor ||
        !handle ||
        !selectionRect ||
        isMenuOpen ||
        !showResizeHandles
      )
        return

      event.preventDefault()
      event.stopPropagation()

      const { selection } = editor.state
      let cellSelection: CellSelection | null = null

      if (selection instanceof CellSelection) {
        cellSelection = selection
      } else {
        const { $anchor } = selection
        const cell = cellAround($anchor)

        if (cell) {
          try {
            cellSelection = CellSelection.create(
              editor.state.doc,
              cell.pos,
              cell.pos
            )
          } catch (error) {
            console.warn(
              "Could not create single cell selection for resize:",
              error
            )
            return
          }
        }
      }

      if (!cellSelection) return

      const anchorCell = getAnchorCellForHandle(
        editor.view,
        cellSelection,
        getEditorSelectionBoundingRect(editor) ?? selectionRect,
        handle
      )
      if (!anchorCell) return

      setActiveHandle(handle)
      activeHandleRef.current = handle
      anchorCellRef.current = anchorCell.pos

      // Map the anchor through edits during the drag. A remote Yjs update
      // deletes the mapped position, and the drag goes on from its slot.
      const $anchorCell = editor.state.doc.resolve(anchorCell.pos)
      const anchorTable = editor.view.nodeDOM($anchorCell.before(-1))
      let anchorSlot = findCell($anchorCell)

      const handleTransaction = ({
        transaction,
      }: {
        transaction: Transaction
      }) => {
        if (anchorCellRef.current == null || !transaction.docChanged) return

        const { pos, deleted } = transaction.mapping.mapResult(
          anchorCellRef.current
        )
        const $cell = transaction.doc.resolve(pos)
        if (deleted || !pointsAtCell($cell)) {
          anchorCellRef.current = null
          return
        }

        anchorCellRef.current = pos
        anchorSlot = findCell($cell)
      }

      const handleMouseMove = (mouseEvent: MouseEvent) => {
        if (!editor || editor.isDestroyed) return

        const target = domCellAround(
          editor.view.root.elementFromPoint(
            mouseEvent.clientX,
            mouseEvent.clientY
          ) as Element
        )
        if (!target || target.type !== "cell") return

        const targetCell = getCellAtCoordinates(
          editor.state,
          editor.view,
          mouseEvent.clientX,
          mouseEvent.clientY
        )
        if (!targetCell) return

        const tableStart = targetCell.start(-1)
        if (
          anchorTable?.isConnected &&
          editor.view.nodeDOM(tableStart - 1) !== anchorTable
        ) {
          return
        }

        if (anchorCellRef.current == null) {
          const map = TableMap.get(targetCell.node(-1))
          const row = Math.min(anchorSlot.top, map.height - 1)
          const col = Math.min(anchorSlot.left, map.width - 1)
          anchorCellRef.current = tableStart + map.map[row * map.width + col]!
        }

        try {
          const newSelection = CellSelection.create(
            editor.state.doc,
            anchorCellRef.current,
            targetCell.pos
          )

          const transaction = editor.state.tr.setSelection(newSelection)
          editor.view.dispatch(transaction)
        } catch {
          // Ignore invalid transient selections while drag-resizing.
          return
        }
      }

      const handleMouseUp = () => {
        setActiveHandle(null)
        activeHandleRef.current = null
        anchorCellRef.current = null
        editor.off("transaction", handleTransaction)

        window.removeEventListener("pointermove", handleMouseMove)
        window.removeEventListener("pointerup", handleMouseUp)
        window.removeEventListener("pointercancel", handleMouseUp)
      }

      editor.on("transaction", handleTransaction)
      window.addEventListener("pointermove", handleMouseMove)
      window.addEventListener("pointerup", handleMouseUp)
      window.addEventListener("pointercancel", handleMouseUp)
    },
    [editor, selectionRect, isMenuOpen, showResizeHandles]
  )

  const updateTableDom = useCallback(() => {
    if (!editor || editor.isDestroyed) {
      setTableDom(null)
      return
    }

    const table = getTable(editor)
    if (!table) {
      setTableDom(null)
      return
    }

    setTableDom((prev) => {
      const currentDom = prev
      const newDom = editor.view.nodeDOM(table.pos) as HTMLElement | null
      return currentDom === newDom ? currentDom : newDom
    })
  }, [editor])

  const handleMenuOpenChange = useCallback(
    (isOpen: boolean) => {
      if (isMenuOpenRef.current === isOpen) return

      isMenuOpenRef.current = isOpen
      setIsMenuOpen(isOpen)
      onMenuOpenChange?.(isOpen)
    },
    [onMenuOpenChange]
  )

  useEffect(() => {
    if (!editor) return

    const handleSelectionUpdate = () => {
      updateSelectionRect()
      updateTableDom()
    }

    editor.on("selectionUpdate", handleSelectionUpdate)
    updateSelectionRect()
    updateTableDom()

    return () => {
      editor.off("selectionUpdate", handleSelectionUpdate)
    }
  }, [editor, updateSelectionRect, updateTableDom])

  useEffect(() => {
    const c = tableDom?.querySelector(
      ".table-selection-overlay-container"
    ) as HTMLElement | null
    const container = c ?? null
    setPortalRoot((prev) =>
      prev.container === container ? prev : { container, key: prev.key + 1 }
    )
  }, [tableDom])

  if (!isVisible || !selectionRect) {
    return null
  }

  if (!editor) return null

  const renderCellMenu = () => {
    if (!CellMenu) return null

    return (
      <span
        onMouseDown={(e) => e.stopPropagation()}
        style={{ pointerEvents: "auto" }}
      >
        <CellMenu
          onOpenChange={handleMenuOpenChange}
          editor={editor}
          onResizeStart={createResizeHandler}
        />
      </span>
    )
  }

  return (
    <FloatingPortal
      key={portalRoot.key}
      root={portalToBody ? undefined : portalRoot.container}
    >
      <div
        ref={refs.setFloating}
        style={{
          ...floatingStyles,
          width: selectionRect.width,
          pointerEvents: "none",
          zIndex: 10,
        }}
      >
        <div className="tiptap-table-selection-overlay">
          <div
            style={{
              position: "absolute",
              width: selectionRect.width,
              height: selectionRect.height,
              zIndex: 2,
              borderRadius: 2,
              top: 0,
              left: 0,
            }}
          />

          <div
            style={{
              position: "absolute",
              width: selectionRect.width,
              height: selectionRect.height,
              border: `2px solid var(--tt-brand-color-400)`,
              borderRadius: 2,
              zIndex: 3,
              top: 0,
              left: 0,
            }}
          >
            {/* Menu Component */}
            {renderCellMenu()}

            {/* Corner resize handles */}
            {showResizeHandles && (
              <>
                <div
                  style={createCornerHandleStyles(
                    "tl",
                    !activeHandle || activeHandle === "tl",
                    isMenuOpen
                  )}
                  onPointerDown={createResizeHandler("tl")}
                />
                <div
                  style={createCornerHandleStyles(
                    "tr",
                    !activeHandle || activeHandle === "tr",
                    isMenuOpen
                  )}
                  onPointerDown={createResizeHandler("tr")}
                />
                <div
                  style={createCornerHandleStyles(
                    "bl",
                    !activeHandle || activeHandle === "bl",
                    isMenuOpen
                  )}
                  onPointerDown={createResizeHandler("bl")}
                />
                <div
                  style={createCornerHandleStyles(
                    "br",
                    !activeHandle || activeHandle === "br",
                    isMenuOpen
                  )}
                  onPointerDown={createResizeHandler("br")}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </FloatingPortal>
  )
}
