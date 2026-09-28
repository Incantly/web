import type { Editor, JSONContent } from '@tiptap/core'
import { Fragment, type Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import {
  CellSelection,
  TableMap,
  addColumnAfter,
  addColumnBefore,
  addRowAfter,
  addRowBefore,
  deleteColumn,
  deleteRow,
  selectedRect,
  selectionCell,
  toggleHeader,
} from '@tiptap/pm/tables'

export interface TableSelectionContext {
  row: number
  col: number
  rows: number
  cols: number
  tableStart: number
  table: ProseMirrorNode
  map: TableMap
}

/** Anchor-cell context for the table containing the selection, or null outside tables. */
export function getTableSelectionContext(editor: Editor): TableSelectionContext | null {
  try {
    const $cell = selectionCell(editor.state)
    const table = $cell.node(-1)
    const tableStart = $cell.start(-1)
    const map = TableMap.get(table)
    const cell = map.findCell($cell.pos - tableStart)
    return { row: cell.top, col: cell.left, rows: map.height, cols: map.width, tableStart, table, map }
  } catch {
    return null
  }
}

/** Absolute document position of a row's start. */
export function tableRowStart(table: ProseMirrorNode, tableStart: number, row: number): number {
  let offset = 0
  for (let index = 0; index < row && index < table.childCount; index++) offset += table.child(index).nodeSize
  return tableStart + offset
}

type TableCommandFn = (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean

const runTableCommand = (editor: Editor, command: TableCommandFn): boolean => {
  try {
    return command(editor.state, (transaction) => editor.view.dispatch(transaction))
  } catch {
    return false
  }
}

const dispatchScroll = (editor: Editor, transaction: Transaction): void => {
  editor.view.dispatch(transaction.scrollIntoView())
}

/** Select the full row (handle tap: single gesture, no hover needed). */
export function selectTableRow(editor: Editor, row: number): boolean {
  const context = getTableSelectionContext(editor)
  if (!context) return false
  const clamped = Math.min(Math.max(0, row), context.rows - 1)
  try {
    // CellSelection endpoints point *at* the cell (directly inside the row),
    // not inside the cell: node(-1) must resolve to the table.
    const absolute = context.tableStart + context.map.positionAt(clamped, 0, context.table)
    const $cell = editor.state.doc.resolve(absolute)
    const selection = CellSelection.rowSelection($cell)
    dispatchScroll(editor, editor.state.tr.setSelection(selection).scrollIntoView())
    return true
  } catch {
    return false
  }
}

/** Select the full column (handle tap: single gesture, no hover needed). */
export function selectTableColumn(editor: Editor, col: number): boolean {
  const context = getTableSelectionContext(editor)
  if (!context) return false
  const clamped = Math.min(Math.max(0, col), context.cols - 1)
  try {
    // See selectTableRow: endpoints point at the cell, not inside it.
    const absolute = context.tableStart + context.map.positionAt(0, clamped, context.table)
    const $cell = editor.state.doc.resolve(absolute)
    dispatchScroll(editor, editor.state.tr.setSelection(CellSelection.colSelection($cell)).scrollIntoView())
    return true
  } catch {
    return false
  }
}

export const addTableRowAbove = (editor: Editor): boolean => runTableCommand(editor, addRowBefore)
export const addTableRowBelow = (editor: Editor): boolean => runTableCommand(editor, addRowAfter)
export const addTableColumnLeft = (editor: Editor): boolean => runTableCommand(editor, addColumnBefore)
export const addTableColumnRight = (editor: Editor): boolean => runTableCommand(editor, addColumnAfter)
export const deleteTableRows = (editor: Editor): boolean => runTableCommand(editor, deleteRow)
export const deleteTableColumns = (editor: Editor): boolean => runTableCommand(editor, deleteColumn)
export const toggleTableHeaderRow = (editor: Editor): boolean =>
  runTableCommand(editor, (state, dispatch) => toggleHeader('row')(state, dispatch))
export const toggleTableHeaderColumn = (editor: Editor): boolean =>
  runTableCommand(editor, (state, dispatch) => toggleHeader('column')(state, dispatch))

/**
 * Strip stable IDs from a cloned subtree so IncantlyNodeIds assigns fresh
 * ones on dispatch. Citation IDs are references, not node IDs — keep them.
 * Row clones additionally clamp rowspan to 1: a rowspan reaching below the
 * duplicated block would overlap existing cells and invalidate the table.
 */
function stripCloneIds(node: JSONContent, clampRowspan: boolean): JSONContent {
  const attrs = { ...((node.attrs ?? {}) as Record<string, unknown>) }
  delete attrs.id
  if (clampRowspan && (node.type === 'tableCell' || node.type === 'tableHeaderCell')
    && typeof attrs.rowspan === 'number' && attrs.rowspan !== 1) {
    attrs.rowspan = 1
  }
  return {
    ...node,
    attrs,
    ...(Array.isArray(node.content) ? { content: node.content.map((child) => stripCloneIds(child, clampRowspan)) } : {}),
  }
}

/** Duplicate every selected row directly below the selection. */
export function duplicateTableRows(editor: Editor): boolean {
  let rect: ReturnType<typeof selectedRect>
  try {
    rect = selectedRect(editor.state)
  } catch {
    return false
  }
  const { state } = editor
  const { table, tableStart } = rect
  try {
    const clones: ProseMirrorNode[] = []
    let offset = 0
    let insertPos = tableStart
    for (let index = 0; index < table.childCount; index++) {
      const row = table.child(index)
      if (index >= rect.top && index < rect.bottom) {
        clones.push(state.schema.nodeFromJSON(stripCloneIds(row.toJSON() as JSONContent, true)))
      }
      if (index <= rect.bottom - 1) insertPos = tableStart + offset + row.nodeSize
      offset += row.nodeSize
    }
    if (!clones.length) return false
    dispatchScroll(editor, state.tr.insert(insertPos, Fragment.from(clones)).scrollIntoView())
    // Land on the first duplicate so repeated duplicates march downward.
    // Clones occupy [rect.bottom, rect.bottom + count): the insert lands at
    // the end of row (rect.bottom - 1), pushing later rows down.
    selectTableRow(editor, rect.bottom)
    return true
  } catch {
    return false
  }
}

/** Duplicate every selected column directly right of the selection. */
export function duplicateTableColumns(editor: Editor): boolean {
  let rect: ReturnType<typeof selectedRect>
  try {
    rect = selectedRect(editor.state)
  } catch {
    return false
  }
  const { state } = editor
  const { table, tableStart, map } = rect
  const { width, height } = map
  const left = rect.left
  const right = rect.right
  try {
    const tr = state.tr
    // Bottom-up: earlier-row positions stay valid as lower rows grow.
    for (let row = height - 1; row >= 0; row--) {
      const owned: ProseMirrorNode[] = []
      const seen = new Set<number>()
      for (let col = left; col < right; col++) {
        const cellOffset = map.map[row * width + col]
        if (seen.has(cellOffset)) continue
        seen.add(cellOffset)
        // Rowspan cells belong to their home row; that row's clone carries
        // the span, so covered rows below contribute nothing here.
        let home = row
        while (home > 0 && map.map[(home - 1) * width + col] === cellOffset) home--
        if (home !== row) continue
        const cell = table.nodeAt(cellOffset)
        if (cell) owned.push(state.schema.nodeFromJSON(stripCloneIds(cell.toJSON() as JSONContent, false)))
      }
      if (!owned.length) continue
      const lastOffset = map.map[row * width + (right - 1)]
      const lastCell = table.nodeAt(lastOffset)
      if (!lastCell) continue
      tr.insert(tr.mapping.map(tableStart + lastOffset + lastCell.nodeSize), Fragment.from(owned))
    }
    if (!tr.docChanged) return false
    dispatchScroll(editor, tr.scrollIntoView())
    return true
  } catch {
    return false
  }
}

function clearCells(editor: Editor, ranges: Array<{ from: number; to: number }>): boolean {
  if (!ranges.length) return false
  try {
    const { state } = editor
    const tr = state.tr
    // Descending: earlier positions stay valid as later content shrinks.
    for (const range of [...ranges].sort((a, b) => b.from - a.from)) {
      tr.replaceWith(
        tr.mapping.map(range.from),
        tr.mapping.map(range.to),
        state.schema.nodes.paragraph.create(),
      )
    }
    if (!tr.docChanged) return false
    dispatchScroll(editor, tr.scrollIntoView())
    return true
  } catch {
    return false
  }
}

/** Empty every selected row's cells, keeping the cells (and their IDs). */
export function clearTableRows(editor: Editor): boolean {
  let rect: ReturnType<typeof selectedRect>
  try {
    rect = selectedRect(editor.state)
  } catch {
    return false
  }
  const ranges: Array<{ from: number; to: number }> = []
  let offset = 0
  for (let index = 0; index < rect.table.childCount; index++) {
    const row = rect.table.child(index)
    const rowStart = rect.tableStart + offset
    if (index >= rect.top && index < rect.bottom) {
      row.forEach((cell, cellOffset) => {
        const start = rowStart + cellOffset
        ranges.push({ from: start + 1, to: start + cell.nodeSize - 1 })
      })
    }
    offset += row.nodeSize
  }
  return clearCells(editor, ranges)
}

/** Empty every selected column's cells, keeping the cells (and their IDs). */
export function clearTableColumns(editor: Editor): boolean {
  let rect: ReturnType<typeof selectedRect>
  try {
    rect = selectedRect(editor.state)
  } catch {
    return false
  }
  const { table, tableStart, map } = rect
  const ranges: Array<{ from: number; to: number }> = []
  const seen = new Set<number>()
  for (let row = 0; row < map.height; row++) {
    for (let col = rect.left; col < rect.right; col++) {
      const cellOffset = map.map[row * map.width + col]
      if (seen.has(cellOffset)) continue
      seen.add(cellOffset)
      const cell = table.nodeAt(cellOffset)
      if (!cell) continue
      const start = tableStart + cellOffset
      ranges.push({ from: start + 1, to: start + cell.nodeSize - 1 })
    }
  }
  return clearCells(editor, ranges)
}
