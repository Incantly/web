import type { Editor, MappablePosition } from "@tiptap/core"
import type { Node as TiptapNode } from "@tiptap/pm/model"
import type { PluginView, Transaction } from "@tiptap/pm/state"
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state"
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view"
import {
  CellSelection,
  findCell,
  moveTableColumn,
  moveTableRow,
  pointsAtCell,
  TableMap,
} from "@tiptap/pm/tables"
import {
  clamp,
  domCellAround,
  getCellIndicesFromDOM,
  getColumnCells,
  getIndexCoordinates,
  getRowCells,
  getTableBodyRect,
  getTableFromDOM,
  isHTMLElement,
  isTableNode,
  safeClosest,
  selectCellsByCoords,
} from "@/components/tiptap-node/table-node/lib/tiptap-table-utils"
import { isValidPosition } from "@/lib/tiptap-utils"
import { createTableDragImage } from "@/components/tiptap-node/table-node/extensions/table-handle/helpers/create-image"

const TABLE_HANDLE_OFFSET_PX = 4

export type TableHandlesState = {
  show: boolean
  showAddOrRemoveRowsButton: boolean
  showAddOrRemoveColumnsButton: boolean
  referencePosCell?: DOMRect
  referencePosTable: DOMRect
  block: TiptapNode
  blockPos: number
  colIndex: number | undefined
  rowIndex: number | undefined
  draggingState?:
    | {
        draggedCellOrientation: "row" | "col"
        originalIndex: number
        mousePos: number
        initialOffset: number
      }
    | undefined
  widgetContainer: HTMLElement | undefined
}

/**
 * A cell followed through transactions, plus the offsets of the table slot it
 * stands for inside a merged cell. Tiptap's mappable positions follow local
 * steps and, with the Collaboration extension, remote ones.
 */
type TrackedCell = {
  from: MappablePosition
  to: MappablePosition
  rowOffset: number
  colOffset: number
  /** The handle indices when the handles froze. */
  rowIndex: number
  colIndex: number
}

function hideElements(selector: string, rootEl: Document | ShadowRoot) {
  rootEl.querySelectorAll<HTMLElement>(selector).forEach((el) => {
    el.style.visibility = "hidden"
  })
}

/** Tracks the cell of `doc` the handles in `state` are on. */
function trackCell(
  editor: Editor,
  doc: TiptapNode,
  state: TableHandlesState | undefined
): TrackedCell | undefined {
  const { rowIndex, colIndex, blockPos = -1 } = state ?? {}
  const table =
    blockPos >= 0 && blockPos < doc.content.size ? doc.nodeAt(blockPos) : null
  if (rowIndex === undefined || colIndex === undefined || !isTableNode(table)) {
    return undefined
  }

  const map = TableMap.get(table)
  if (rowIndex >= map.height || colIndex >= map.width) return undefined

  const offset = map.map[rowIndex * map.width + colIndex]!
  const { top, left } = map.findCell(offset)
  const pos = blockPos + 1 + offset
  return {
    from: editor.utils.createMappablePosition(pos),
    to: editor.utils.createMappablePosition(
      pos + table.nodeAt(offset)!.nodeSize
    ),
    rowOffset: rowIndex - top,
    colOffset: colIndex - left,
    rowIndex,
    colIndex,
  }
}

/** Finds a tracked cell in `doc`, or returns undefined once it is deleted. */
function resolveTrackedCell(doc: TiptapNode, cell: TrackedCell) {
  const pos = cell.from.position
  const $cell = pos >= 0 && pos < doc.content.size ? doc.resolve(pos) : null
  // Deleting the cell collapses both of its ends onto one position.
  if (
    !$cell ||
    !pointsAtCell($cell) ||
    cell.to.position < pos + $cell.nodeAfter!.nodeSize
  ) {
    return undefined
  }

  const rect = findCell($cell)
  return {
    tablePos: $cell.before(-1),
    rowIndex: Math.min(rect.top + cell.rowOffset, rect.bottom - 1),
    colIndex: Math.min(rect.left + cell.colOffset, rect.right - 1),
  }
}

export const tableHandlePluginKey = new PluginKey("tableHandlePlugin")

class TableHandleView implements PluginView {
  public editor: Editor
  public editorView: EditorView

  public state: TableHandlesState | undefined = undefined
  public menuFrozen = false
  public mouseState: "up" | "down" | "selecting" = "up"
  public tableId: string | undefined
  public tablePos: number | undefined
  public tableElement: HTMLElement | undefined
  /**
   * The cell the handles froze on for a menu or a drag. The plugin state
   * tracks it and maps it through each transaction, which a plugin view never
   * sees, so the menu and the drag keep acting on their own row and column.
   */
  public frozenCell: TrackedCell | undefined

  public emitUpdate: () => void

  constructor(
    editor: Editor,
    editorView: EditorView,
    emitUpdate: (state: TableHandlesState) => void
  ) {
    this.editor = editor
    this.editorView = editorView
    this.emitUpdate = () => this.state && emitUpdate(this.state)

    this.editorView.dom.addEventListener("mousemove", this.mouseMoveHandler)
    this.editorView.dom.addEventListener("mousedown", this.viewMousedownHandler)
    window.addEventListener("mouseup", this.mouseUpHandler)

    this.editorView.root.addEventListener(
      "dragover",
      this.dragOverHandler as EventListener
    )
    this.editorView.root.addEventListener(
      "drop",
      this.dropHandler as unknown as EventListener
    )
  }

  private viewMousedownHandler = (event: MouseEvent) => {
    this.mouseState = "down"

    const { state, view } = this.editor
    if (!(state.selection instanceof CellSelection) || this.editor.isFocused)
      return

    const posInfo = view.posAtCoords({
      left: event.clientX,
      top: event.clientY,
    })
    if (!posInfo) return

    const $pos = state.doc.resolve(posInfo.pos)
    const { nodes } = state.schema
    let paraDepth = -1
    let inTableCell = false

    for (let d = $pos.depth; d >= 0; d--) {
      const node = $pos.node(d)
      if (
        !inTableCell &&
        (node.type === nodes.tableCell || node.type === nodes.tableHeader)
      ) {
        inTableCell = true
      }
      if (paraDepth === -1 && node.type === nodes.paragraph) {
        paraDepth = d
      }
      if (inTableCell && paraDepth !== -1) break
    }

    if (!inTableCell || paraDepth === -1) return

    const from = $pos.start(paraDepth)
    const to = $pos.end(paraDepth)
    const nextSel = TextSelection.create(state.doc, from, to)
    if (state.selection.eq(nextSel)) return

    view.dispatch(state.tr.setSelection(nextSel))
    view.focus()
  }

  private mouseUpHandler = (event: MouseEvent) => {
    this.mouseState = "up"
    this.mouseMoveHandler(event)
  }

  private mouseMoveHandler = (event: MouseEvent) => {
    if (this.menuFrozen || this.mouseState === "selecting") return

    const target = event.target
    if (!isHTMLElement(target) || !this.editorView.dom.contains(target)) return
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    tableHandleView = this
    if (this.isPointerOnHandle(target)) return

    this._handleMouseMoveNow(event)
  }

  private hideHandles() {
    if (!this.state?.show) return

    this.state = {
      ...this.state,
      show: false,
      showAddOrRemoveRowsButton: false,
      showAddOrRemoveColumnsButton: false,
      colIndex: undefined,
      rowIndex: undefined,
      referencePosCell: undefined,
      draggingState: undefined,
    }
    this.emitUpdate()
  }

  private isPointerInHandleBridge(event: MouseEvent) {
    const { referencePosCell, referencePosTable } = this.state ?? {}
    if (!referencePosCell || !referencePosTable) return false

    const x = event.clientX
    const y = event.clientY

    const withinColumn =
      x >= referencePosCell.left && x <= referencePosCell.right
    const betweenColumnHandleAndTable =
      y >= referencePosTable.top - TABLE_HANDLE_OFFSET_PX &&
      y <= referencePosTable.top

    const withinRow = y >= referencePosCell.top && y <= referencePosCell.bottom
    const betweenRowHandleAndTable =
      x >= referencePosTable.left - TABLE_HANDLE_OFFSET_PX &&
      x <= referencePosTable.left

    return (
      (withinColumn && betweenColumnHandleAndTable) ||
      (withinRow && betweenRowHandleAndTable)
    )
  }

  private isPointerOnHandle(target: EventTarget | null) {
    return (
      isHTMLElement(target) &&
      !!safeClosest(target, ".tiptap-table-handle-menu")
    )
  }

  private _handleMouseMoveNow(event: MouseEvent) {
    const around = domCellAround(event.target as Element)

    // Hide handles while selecting inside a cell
    if (
      around?.type === "cell" &&
      this.mouseState === "down" &&
      !this.state?.draggingState
    ) {
      this.mouseState = "selecting"
      this.hideHandles()
      return
    }

    if (!around) {
      if (this.isPointerInHandleBridge(event)) {
        return
      }

      this.hideHandles()
      return
    }

    if (!this.editor.isEditable) {
      this.hideHandles()
      return
    }

    const tbody = around.tbodyNode
    if (!tbody) return

    const tableRect = getTableBodyRect(
      tbody,
      around.type === "cell" ? around.domNode : null
    )
    const coords = this.editor.view.posAtCoords({
      left: event.clientX,
      top: event.clientY,
    })
    if (!coords) return

    // Find the table node at this position
    const $pos = this.editor.view.state.doc.resolve(coords.pos)
    let blockInfo: { node: TiptapNode; pos: number } | undefined
    for (let d = $pos.depth; d >= 0; d--) {
      const node = $pos.node(d)
      if (isTableNode(node)) {
        blockInfo = { node, pos: d === 0 ? 0 : $pos.before(d) }
        break
      }
    }
    // A hovered cell belongs to its own table, even where the position under
    // the pointer resolves into a table nested in the cell.
    if (around.type === "cell") {
      blockInfo = getTableFromDOM(around.domNode, this.editor) ?? undefined
    }
    if (!blockInfo || blockInfo.node.type.name !== "table") return

    this.tableElement = this.editor.view.nodeDOM(blockInfo.pos) as
      HTMLElement | undefined
    this.tablePos = blockInfo.pos
    this.tableId = blockInfo.node.attrs.id

    const wrapper = safeClosest<HTMLElement>(around.domNode, ".tableWrapper")
    const widgetContainer = wrapper?.querySelector(
      ":scope > .table-controls"
    ) as HTMLElement | undefined

    // Hovering around the table (outside cells)
    if (around.type === "wrapper") {
      const below =
        event.clientY >= tableRect.bottom - 1 &&
        event.clientY < tableRect.bottom + 20
      const right =
        event.clientX >= tableRect.right - 1 &&
        event.clientX < tableRect.right + 20
      const cursorBeyondRightOrBottom =
        event.clientX > tableRect.right || event.clientY > tableRect.bottom
      // The hovered cell only carries over along the edge of its own table.
      const keepCell =
        !cursorBeyondRightOrBottom && this.state?.blockPos === blockInfo.pos

      this.state = {
        ...this.state,
        show: true,
        showAddOrRemoveRowsButton: below,
        showAddOrRemoveColumnsButton: right,
        referencePosTable: tableRect,
        block: blockInfo.node,
        blockPos: blockInfo.pos,
        widgetContainer,
        colIndex: keepCell ? this.state?.colIndex : undefined,
        rowIndex: keepCell ? this.state?.rowIndex : undefined,
        referencePosCell: keepCell ? this.state?.referencePosCell : undefined,
      }
    } else {
      // Hovering over a cell
      const cellPosition = getCellIndicesFromDOM(
        around.domNode as HTMLTableCellElement,
        blockInfo.node,
        this.editor
      )
      if (!cellPosition) return

      const { rowIndex, colIndex } = cellPosition
      const cellRect = (around.domNode as HTMLElement).getBoundingClientRect()
      const lastRowIndex = blockInfo.node.content.childCount - 1
      const lastColIndex =
        (blockInfo.node.content.firstChild?.content.childCount ?? 0) - 1

      // Skip update if same cell
      if (
        this.state?.show &&
        this.state.blockPos === blockInfo.pos &&
        this.state.rowIndex === rowIndex &&
        this.state.colIndex === colIndex
      ) {
        return
      }

      this.state = {
        show: true,
        showAddOrRemoveColumnsButton: colIndex === lastColIndex,
        showAddOrRemoveRowsButton: rowIndex === lastRowIndex,
        referencePosTable: tableRect,
        block: blockInfo.node,
        blockPos: blockInfo.pos,
        draggingState: undefined,
        referencePosCell: cellRect,
        colIndex,
        rowIndex,
        widgetContainer,
      }
    }

    this.emitUpdate()
    return false
  }

  dragOverHandler = (event: DragEvent) => {
    if (this.state?.draggingState === undefined) {
      return
    }

    event.preventDefault()
    event.dataTransfer!.dropEffect = "move"

    hideElements(
      ".prosemirror-dropcursor-block, .prosemirror-dropcursor-inline",
      this.editorView.root
    )

    // The mouse cursor coordinates, bounded to the full table box. Handles use
    // page-fragment rects under Pages, but drag/drop still needs to move across
    // all fragments of a multi-page table.
    const tableBody = this.tableElement?.querySelector("tbody")
    const dragBounds = tableBody
      ? getTableBodyRect(tableBody)
      : this.state.referencePosTable
    const {
      left: tableLeft,
      right: tableRight,
      top: tableTop,
      bottom: tableBottom,
    } = dragBounds

    const boundedMouseCoords = {
      left: clamp(event.clientX, tableLeft + 1, tableRight - 1),
      top: clamp(event.clientY, tableTop + 1, tableBottom - 1),
    }

    // Gets the table cell element
    const tableCellElements = this.editorView.root
      .elementsFromPoint(boundedMouseCoords.left, boundedMouseCoords.top)
      .filter((element) => element.tagName === "TD" || element.tagName === "TH")
    if (tableCellElements.length === 0) {
      return
    }
    // elementsFromPoint returns the cells of a nested table first.
    const tableCellElement = tableCellElements.find(
      (element) => element.closest("tbody") === tableBody
    )
    if (!isHTMLElement(tableCellElement)) {
      return
    }

    const cellPosition = getCellIndicesFromDOM(
      tableCellElement as HTMLTableCellElement,
      this.state.block,
      this.editor
    )
    if (!cellPosition) return

    const { rowIndex, colIndex } = cellPosition

    // Check what changed
    const oldIndex =
      this.state.draggingState.draggedCellOrientation === "row"
        ? this.state.rowIndex
        : this.state.colIndex
    const newIndex =
      this.state.draggingState.draggedCellOrientation === "row"
        ? rowIndex
        : colIndex
    const dispatchDecorationsTransaction = newIndex !== oldIndex

    const mousePos =
      this.state.draggingState.draggedCellOrientation === "row"
        ? boundedMouseCoords.top
        : boundedMouseCoords.left

    // Check if anything needs updating
    const cellChanged =
      this.state.rowIndex !== rowIndex || this.state.colIndex !== colIndex
    const mousePosChanged = this.state.draggingState.mousePos !== mousePos

    if (cellChanged || mousePosChanged) {
      const targetTbody = tableCellElement.closest(
        "tbody"
      ) as HTMLTableSectionElement | null
      this.state = {
        ...this.state,
        rowIndex: rowIndex,
        colIndex: colIndex,
        referencePosCell: tableCellElement.getBoundingClientRect(),
        referencePosTable: targetTbody
          ? getTableBodyRect(targetTbody, tableCellElement)
          : this.state.referencePosTable,
        draggingState: {
          ...this.state.draggingState,
          mousePos: mousePos,
        },
      }

      this.emitUpdate()
    }

    // Dispatch decorations transaction if needed
    if (dispatchDecorationsTransaction) {
      this.editor.view.dispatch(
        this.editor.state.tr.setMeta(tableHandlePluginKey, true)
      )
    }
  }

  dropHandler = () => {
    this.mouseState = "up"

    const st = this.state
    if (!st?.draggingState) return false

    const { draggingState, rowIndex, colIndex, blockPos } = st
    if (!isValidPosition(blockPos)) return false

    // The dragged row or column, followed through edits since dragstart. A
    // read-only document keeps its order.
    const originalIndex = this.getDragSource(this.editor.state.doc)?.index
    if (originalIndex === undefined || !this.editor.isEditable) return false

    if (
      (draggingState.draggedCellOrientation === "row" &&
        rowIndex === undefined) ||
      (draggingState.draggedCellOrientation === "col" && colIndex === undefined)
    ) {
      throw new Error(
        "Attempted to drop table row or column, but no table block was hovered prior."
      )
    }

    const isRow = draggingState.draggedCellOrientation === "row"
    const orientation = isRow ? "row" : "column"
    const destIndex = isRow ? rowIndex! : colIndex!

    const cellCoords = getIndexCoordinates({
      editor: this.editor,
      index: originalIndex,
      orientation,
      tablePos: blockPos,
    })
    if (!cellCoords) return false

    const stateWithCellSel = selectCellsByCoords(
      this.editor,
      blockPos,
      cellCoords,
      { mode: "state" }
    )
    if (!stateWithCellSel) return false

    const dispatch = (tr: Transaction) => this.editor.view.dispatch(tr)

    if (isRow) {
      moveTableRow({
        from: originalIndex,
        to: destIndex,
        select: true,
        pos: blockPos + 1,
      })(stateWithCellSel, dispatch)
    } else {
      moveTableColumn({
        from: originalIndex,
        to: destIndex,
        select: true,
        pos: blockPos + 1,
      })(stateWithCellSel, dispatch)
    }

    this.state = { ...st, draggingState: undefined }
    this.emitUpdate()

    this.editor.view.dispatch(
      this.editor.state.tr.setMeta(tableHandlePluginKey, null)
    )

    return true
  }

  mapFrozenCell(tr: Transaction) {
    const cell = this.frozenCell
    if (!cell || !tr.docChanged) return

    this.frozenCell = {
      ...cell,
      from: this.editor.utils.getUpdatedPosition(cell.from, tr).position,
      to: this.editor.utils.getUpdatedPosition(cell.to, tr).position,
    }
  }

  /** Puts the handles back on the indices they froze on. */
  restoreFrozenIndices() {
    const cell = this.frozenCell
    if (!cell || !this.state) return

    this.state = {
      ...this.state,
      rowIndex: cell.rowIndex,
      colIndex: cell.colIndex,
    }
  }

  /** The table and index of the dragged row or column, while it exists. */
  getDragSource(doc: TiptapNode) {
    const orientation = this.state?.draggingState?.draggedCellOrientation
    const cell = this.frozenCell && resolveTrackedCell(doc, this.frozenCell)
    if (!orientation || !cell) return undefined

    return {
      tablePos: cell.tablePos,
      index: orientation === "row" ? cell.rowIndex : cell.colIndex,
    }
  }

  update(view: EditorView): void {
    const pluginState = tableHandlePluginKey.getState(view.state)
    if (pluginState !== undefined && pluginState !== this.menuFrozen) {
      this.menuFrozen = pluginState
    }

    if (!this.state?.show) return

    if (!this.tableElement?.isConnected) {
      this.hideHandles()
      return
    }

    const tableInfo = getTableFromDOM(this.tableElement, this.editor)
    if (!tableInfo) {
      this.hideHandles()
      return
    }

    // Check if table changed
    const blockChanged =
      this.state.block !== tableInfo.node ||
      this.state.blockPos !== tableInfo.pos

    if (
      !tableInfo.node ||
      tableInfo.node.type.name !== "table" ||
      !this.tableElement?.isConnected
    ) {
      this.hideHandles()
      return
    }

    const { height: rowCount, width: colCount } = TableMap.get(tableInfo.node)

    // Calculate new indices
    let newRowIndex = this.state.rowIndex
    let newColIndex = this.state.colIndex

    // A menu keeps acting on the cell its handles froze on, wherever edits
    // move it, until that cell is deleted. During a drag the handles follow
    // the drop target instead.
    if (this.frozenCell && !this.state.draggingState) {
      const cell = resolveTrackedCell(view.state.doc, this.frozenCell)
      if (cell) {
        newRowIndex = cell.rowIndex
        newColIndex = cell.colIndex
      }
    }

    // Clamp indices if rows/columns were deleted
    if (newRowIndex !== undefined && newRowIndex >= rowCount) {
      newRowIndex = rowCount ? rowCount - 1 : undefined
    }
    if (newColIndex !== undefined && newColIndex >= colCount) {
      newColIndex = colCount ? colCount - 1 : undefined
    }

    const tableBody = this.tableElement.querySelector("tbody")
    if (!tableBody) {
      throw new Error(
        "Table block does not contain a 'tbody' HTML element. This should never happen."
      )
    }

    // Calculate new reference positions
    let newReferencePosCell = this.state.referencePosCell
    let newReferenceCellElement: Element | undefined
    if (newRowIndex !== undefined && newColIndex !== undefined) {
      // DOM rows skip the slots that merged cells cover
      const map = TableMap.get(tableInfo.node)
      const cellEl = view.nodeDOM(
        tableInfo.pos + 1 + map.map[newRowIndex * map.width + newColIndex]!
      ) as Element | null

      if (cellEl) {
        newReferenceCellElement = cellEl
        newReferencePosCell = cellEl.getBoundingClientRect()
      } else {
        newRowIndex = undefined
        newColIndex = undefined
        newReferencePosCell = undefined
      }
    }

    const newReferencePosTable = getTableBodyRect(
      tableBody,
      newReferenceCellElement
    )

    // Check if anything changed
    const indicesChanged =
      newRowIndex !== this.state.rowIndex || newColIndex !== this.state.colIndex
    const refPosChanged =
      newReferencePosCell !== this.state.referencePosCell ||
      newReferencePosTable !== this.state.referencePosTable

    if (blockChanged || indicesChanged || refPosChanged) {
      this.state = {
        ...this.state,
        block: tableInfo.node,
        blockPos: tableInfo.pos,
        rowIndex: newRowIndex,
        colIndex: newColIndex,
        referencePosCell: newReferencePosCell,
        referencePosTable: newReferencePosTable,
      }
      this.emitUpdate()
    }
  }

  destroy(): void {
    this.editorView.dom.removeEventListener(
      "mousemove",
      this.mouseMoveHandler as EventListener
    )
    window.removeEventListener("mouseup", this.mouseUpHandler as EventListener)
    this.editorView.dom.removeEventListener(
      "mousedown",
      this.viewMousedownHandler as EventListener
    )
    this.editorView.root.removeEventListener(
      "dragover",
      this.dragOverHandler as EventListener
    )
    this.editorView.root.removeEventListener(
      "drop",
      this.dropHandler as unknown as EventListener
    )
    if (tableHandleView === this) tableHandleView = null
  }
}

/** The view that last handled a pointer event, which a handle drag uses. */
let tableHandleView: TableHandleView | null = null

export function TableHandlePlugin(
  editor: Editor,
  emitUpdate: (state: TableHandlesState) => void
): Plugin {
  let handleView: TableHandleView | null = null

  return new Plugin({
    key: tableHandlePluginKey,

    state: {
      init: () => false,
      apply: (tr, frozen) => {
        const meta = tr.getMeta(tableHandlePluginKey)
        // Handles that freeze follow their cell until they unfreeze. A menu
        // or an extend drag unfreezes with false and puts the handles back
        // on the indices they froze on, so its own edits leave them there.
        if (handleView && meta !== undefined && !meta !== !frozen) {
          if (meta === false) handleView.restoreFrozenIndices()
          handleView.frozenCell = meta
            ? trackCell(editor, tr.before, handleView.state)
            : undefined
        }
        handleView?.mapFrozenCell(tr)
        return meta !== undefined ? meta : frozen
      },
    },

    view: (editorView) => {
      handleView = new TableHandleView(editor, editorView, emitUpdate)
      tableHandleView = handleView

      return tableHandleView
    },

    props: {
      decorations: (state) => {
        // This editor's view, not the one the pointer last used
        const tableHandleView = handleView
        if (!tableHandleView) return null

        if (
          tableHandleView === undefined ||
          tableHandleView.state === undefined ||
          tableHandleView.state.draggingState === undefined ||
          tableHandleView.tablePos === undefined
        ) {
          return
        }

        const newIndex =
          tableHandleView.state.draggingState.draggedCellOrientation === "row"
            ? tableHandleView.state.rowIndex
            : tableHandleView.state.colIndex

        if (newIndex === undefined) {
          return
        }

        // The dragged row or column, followed through edits since dragstart
        const source = tableHandleView.getDragSource(state.doc)
        if (!source) {
          return
        }

        const decorations: Decoration[] = []
        const { index: originalIndex, tablePos } = source

        if (
          tableHandleView.state.draggingState.draggedCellOrientation === "row"
        ) {
          const originalCells = getRowCells(editor, originalIndex, tablePos)
          originalCells.cells.forEach((cell) => {
            if (cell.node) {
              decorations.push(
                Decoration.node(cell.pos, cell.pos + cell.node.nodeSize, {
                  class: "table-cell-dragging-source",
                })
              )
            }
          })
        } else {
          const originalCells = getColumnCells(editor, originalIndex, tablePos)
          originalCells.cells.forEach((cell) => {
            if (cell.node) {
              decorations.push(
                Decoration.node(cell.pos, cell.pos + cell.node.nodeSize, {
                  class: "table-cell-dragging-source",
                })
              )
            }
          })
        }

        // Return empty decorations if:
        // - original index is same as new index (no change)
        // - editor is not defined for some reason
        if (newIndex === originalIndex || !editor) {
          return DecorationSet.create(state.doc, decorations)
        }

        if (
          tableHandleView.state.draggingState.draggedCellOrientation === "row"
        ) {
          const cellsInRow = getRowCells(editor, newIndex, tablePos)

          cellsInRow.cells.forEach((cell) => {
            const cellNode = cell.node
            if (!cellNode) {
              return
            }

            // Creates a decoration at the start or end of each cell,
            // depending on whether the new index is before or after the
            // original index.
            const decorationPos =
              cell.pos + (newIndex > originalIndex ? cellNode.nodeSize - 2 : 2)
            decorations.push(
              Decoration.widget(decorationPos, () => {
                const widget = document.createElement("div")
                widget.className = "tiptap-table-dropcursor"
                widget.style.left = "0"
                widget.style.right = "0"
                // This is only necessary because the drop indicator's height
                // is an even number of pixels, whereas the border between
                // table cells is an odd number of pixels. So this makes the
                // positioning slightly more consistent regardless of where
                // the row is being dropped.
                if (newIndex > originalIndex) {
                  widget.style.bottom = "-1px"
                } else {
                  widget.style.top = "-1px"
                }
                widget.style.height = "3px"

                return widget
              })
            )
          })
        } else {
          const cellsInColumn = getColumnCells(editor, newIndex, tablePos)
          cellsInColumn.cells.forEach((cell) => {
            const cellNode = cell.node
            if (!cellNode) {
              return
            }
            // Creates a decoration at the start or end of each cell,
            // depending on whether the new index is before or after the
            // original index.
            const decorationPos =
              cell.pos + (newIndex > originalIndex ? cellNode.nodeSize - 2 : 2)
            decorations.push(
              Decoration.widget(decorationPos, () => {
                const widget = document.createElement("div")
                widget.className = "tiptap-table-dropcursor"
                widget.style.top = "0"
                widget.style.bottom = "0"
                // This is only necessary because the drop indicator's width
                // is an even number of pixels, whereas the border between
                // table cells is an odd number of pixels. So this makes the
                // positioning slightly more consistent regardless of where
                // the column is being dropped.
                if (newIndex > originalIndex) {
                  widget.style.right = "-1px"
                } else {
                  widget.style.left = "-1px"
                }
                widget.style.width = "3px"
                return widget
              })
            )
          })
        }

        return DecorationSet.create(state.doc, decorations)
      },
    },
  })
}

/**
 * Shared drag start handler for table rows and columns
 */
const tableDragStart = (
  orientation: "col" | "row",
  event: {
    dataTransfer: DataTransfer | null
    currentTarget: EventTarget & Element
    clientX: number
    clientY: number
  }
) => {
  // A handle still shown after its view lost the hovered cell, for example
  // to a plugin reconfigure, has nothing to drag.
  if (!tableHandleView?.state) {
    return
  }

  const { state, editor } = tableHandleView
  const index = orientation === "col" ? state.colIndex : state.rowIndex

  if (index === undefined) {
    return
  }

  const { blockPos, referencePosCell } = state
  const mousePos = orientation === "col" ? event.clientX : event.clientY

  // Clear cell selection to prevent table reference collapse
  if (editor.state.selection instanceof CellSelection) {
    const safeSel = TextSelection.near(editor.state.doc.resolve(blockPos), 1)
    editor.view.dispatch(editor.state.tr.setSelection(safeSel))
  }

  const dragImage = createTableDragImage(editor, orientation, index, blockPos)

  // Configure drag image
  if (event.dataTransfer) {
    const handleRect = (
      event.currentTarget as HTMLElement
    ).getBoundingClientRect()
    const offset =
      orientation === "col"
        ? { x: handleRect.width / 2, y: 0 }
        : { x: 0, y: handleRect.height / 2 }

    // ProseMirror ignores events on the handle, so Firefox starts the drag
    // only if this stores data. A private type keeps drop targets from
    // reading it as content.
    event.dataTransfer.setData("application/x-tiptap-table-handle", orientation)
    event.dataTransfer.effectAllowed =
      orientation === "col" ? "move" : "copyMove"
    event.dataTransfer.setDragImage(dragImage, offset.x, offset.y)
  }

  // Cleanup drag image
  const cleanup = () => dragImage.parentNode?.removeChild(dragImage)
  // dragend reaches the handle even after it left the DOM, as when its table
  // is deleted mid-drag, which React does not see.
  const handle = event.currentTarget
  handle.addEventListener(
    "dragend",
    () => {
      cleanup()
      if (!handle.isConnected) dragEnd()
    },
    { once: true }
  )

  const initialOffset = referencePosCell
    ? (orientation === "col" ? referencePosCell.left : referencePosCell.top) -
      mousePos
    : 0

  // Update dragging state
  tableHandleView.state = {
    ...state,
    draggingState: {
      draggedCellOrientation: orientation,
      originalIndex: index,
      mousePos,
      initialOffset,
    },
  }
  tableHandleView.emitUpdate()
  editor.view.dispatch(editor.state.tr.setMeta(tableHandlePluginKey, true))
}

/**
 * Callback for column drag handle
 */
export const colDragStart = (event: {
  dataTransfer: DataTransfer | null
  currentTarget: EventTarget & Element
  clientX: number
}) => tableDragStart("col", { ...event, clientY: 0 })

/**
 * Callback for row drag handle
 */
export const rowDragStart = (event: {
  dataTransfer: DataTransfer | null
  currentTarget: EventTarget & Element
  clientY: number
}) => tableDragStart("row", { ...event, clientX: 0 })

/**
 * Drag end cleanup
 */
export const dragEnd = () => {
  if (!tableHandleView) {
    return
  }

  // A drag that ends without a drop sends no mouseup
  tableHandleView.mouseState = "up"

  // A view that lost its state to a plugin reconfigure still unfreezes
  if (tableHandleView.state !== undefined) {
    tableHandleView.state = {
      ...tableHandleView.state,
      draggingState: undefined,
    }
    tableHandleView.emitUpdate()
  }

  const editor = tableHandleView.editor
  editor.view.dispatch(editor.state.tr.setMeta(tableHandlePluginKey, null))
}
