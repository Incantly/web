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
  moveTableColumn,
  moveTableRow,
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
    // Fall through to the caret-based fallback below.
  }
  try {
    // Degraded selections (mapped through structural ops or undo): anchor
    // on the caret's enclosing cell instead of trusting the selection type.
    const $from = editor.state.selection.$from
    for (let depth = $from.depth; depth > 0; depth--) {
      if ($from.node(depth).type.spec.tableRole !== 'table') continue
      const table = $from.node(depth)
      const tableStart = $from.start(depth)
      for (let cellDepth = $from.depth; cellDepth > depth; cellDepth--) {
        const role = $from.node(cellDepth).type.spec.tableRole
        if (role !== 'cell' && role !== 'header_cell') continue
        const map = TableMap.get(table)
        const cell = map.findCell($from.before(cellDepth) - tableStart)
        return { row: cell.top, col: cell.left, rows: map.height, cols: map.width, tableStart, table, map }
      }
      return null
    }
    return null
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

/** Locate the table enclosing the selection without trusting the selection type. */
function tableFromSelection(editor: Editor): { table: ProseMirrorNode; tableStart: number } | null {
  const $from = editor.state.selection.$from
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth)
    if (node.type.spec.tableRole === 'table') return { table: node, tableStart: $from.start(depth) }
  }
  return null
}

/** Select the full row (handle tap: single gesture, no hover needed). */
export function selectTableRow(editor: Editor, row: number): boolean {
  const found = tableFromSelection(editor)
  if (!found) return false
  try {
    const map = TableMap.get(found.table)
    const clamped = Math.min(Math.max(0, row), map.height - 1)
    // CellSelection endpoints point *at* the cell (directly inside the row),
    // not inside the cell: node(-1) must resolve to the table.
    const absolute = found.tableStart + map.positionAt(clamped, 0, found.table)
    const $cell = editor.state.doc.resolve(absolute)
    dispatchScroll(editor, editor.state.tr.setSelection(CellSelection.rowSelection($cell)).scrollIntoView())
    return true
  } catch {
    return false
  }
}

/** Select the full column (handle tap: single gesture, no hover needed). */
export function selectTableColumn(editor: Editor, col: number): boolean {
  const found = tableFromSelection(editor)
  if (!found) return false
  try {
    const map = TableMap.get(found.table)
    const clamped = Math.min(Math.max(0, col), map.width - 1)
    // See selectTableRow: endpoints point at the cell, not inside it.
    const absolute = found.tableStart + map.positionAt(0, clamped, found.table)
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
export function deleteTableRows(editor: Editor): boolean {
  let rect: ReturnType<typeof selectedRect>
  try {
    rect = selectedRect(editor.state)
  } catch {
    return false
  }
  if (!runTableCommand(editor, deleteRow)) return false
  const remaining = rect.map.height - (rect.bottom - rect.top)
  if (remaining > 0) selectTableRow(editor, Math.min(rect.top, remaining - 1))
  return true
}

export function deleteTableColumns(editor: Editor): boolean {
  let rect: ReturnType<typeof selectedRect>
  try {
    rect = selectedRect(editor.state)
  } catch {
    return false
  }
  if (!runTableCommand(editor, deleteColumn)) return false
  const remaining = rect.map.width - (rect.right - rect.left)
  if (remaining > 0) selectTableColumn(editor, Math.min(rect.left, remaining - 1))
  return true
}
export const toggleTableHeaderRow = (editor: Editor): boolean =>
  runTableCommand(editor, (state, dispatch) => toggleHeader('row')(state, dispatch))
export const toggleTableHeaderColumn = (editor: Editor): boolean =>
  runTableCommand(editor, (state, dispatch) => toggleHeader('column')(state, dispatch))

function moveRowBy(editor: Editor, delta: -1 | 1): boolean {
  const context = getTableSelectionContext(editor)
  if (!context) return false
  const to = context.row + delta
  if (to < 0 || to >= context.rows) return false
  // select:true keeps the moved row selected, so repeated moves march on.
  return runTableCommand(editor, moveTableRow({ from: context.row, to }))
}

function moveColumnBy(editor: Editor, delta: -1 | 1): boolean {
  const context = getTableSelectionContext(editor)
  if (!context) return false
  const to = context.col + delta
  if (to < 0 || to >= context.cols) return false
  return runTableCommand(editor, moveTableColumn({ from: context.col, to }))
}

export const moveTableRowUp = (editor: Editor): boolean => moveRowBy(editor, -1)
export const moveTableRowDown = (editor: Editor): boolean => moveRowBy(editor, 1)
export const moveTableColumnLeft = (editor: Editor): boolean => moveColumnBy(editor, -1)
export const moveTableColumnRight = (editor: Editor): boolean => moveColumnBy(editor, 1)

/** Append one row at the table end (extend bar). */
export function extendTableRows(editor: Editor): boolean {
  const context = getTableSelectionContext(editor)
  if (!context) return false
  return selectTableRow(editor, context.rows - 1) && addTableRowBelow(editor)
}

/** Append one column at the table end (extend bar). */
export function extendTableColumns(editor: Editor): boolean {
  const context = getTableSelectionContext(editor)
  if (!context) return false
  return selectTableColumn(editor, context.cols - 1) && addTableColumnRight(editor)
}

/** Whether the selected column can be sorted (rowspans break row order). */
export function canSortTableColumn(editor: Editor): boolean {
  const context = getTableSelectionContext(editor)
  if (!context || context.rows < 2) return false
  let rowspans = false
  context.table.descendants((node) => {
    if ((node.type.name === 'tableCell' || node.type.name === 'tableHeaderCell')
      && (node.attrs.rowspan ?? 1) > 1) rowspans = true
  })
  return !rowspans
}

export type TableSortDirection = 'asc' | 'desc'

/**
 * Sort data rows by the selected column's text. A fully-header first row is
 * pinned (official behavior); empty cells always sink to the end. Rows move
 * as whole nodes, so stable IDs travel with their content.
 */
export function sortTableColumn(editor: Editor, direction: TableSortDirection): boolean {
  const context = getTableSelectionContext(editor)
  if (!context || !canSortTableColumn(editor)) return false
  const { state } = editor
  const { table, tableStart, map } = context
  const col = context.col
  const rows: ProseMirrorNode[] = []
  for (let index = 0; index < table.childCount; index++) rows.push(table.child(index))
  const firstRowHeader = rows.length > 0 && (() => {
    let header = true
    rows[0].forEach((cell) => { if (cell.type.name !== 'tableHeaderCell') header = false })
    return header
  })()
  const dataStart = firstRowHeader ? 1 : 0
  if (map.height - dataStart < 2) return false
  const keyOf = (row: number): string => {
    const cell = table.nodeAt(map.map[row * map.width + col])
    return cell ? cell.textContent.trim() : ''
  }
  const order: number[] = []
  for (let row = dataStart; row < map.height; row++) order.push(row)
  const compare = (a: string, b: string): number =>
    direction === 'asc'
      ? a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
      : b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' })
  order.sort((a, b) => {
    const keyA = keyOf(a)
    const keyB = keyOf(b)
    // Empties sink in both directions.
    if (!keyA && !keyB) return 0
    if (!keyA) return 1
    if (!keyB) return -1
    return compare(keyA, keyB)
  })
  if (order.every((row, index) => row === dataStart + index)) return true
  try {
    const from = tableRowStart(table, tableStart, dataStart)
    const to = tableRowStart(table, tableStart, map.height)
    const tr = state.tr
    tr.delete(from, to)
    tr.insert(tr.mapping.map(from), Fragment.from(order.map((row) => rows[row])))
    if (!tr.docChanged) return false
    dispatchScroll(editor, tr.scrollIntoView())
    try {
      selectTableColumn(editor, col)
    } catch {
      // Selection restore is best-effort; the sort itself succeeded.
    }
    return true
  } catch {
    return false
  }
}

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
    // First duplicate starts where the original block ended.
    selectTableColumn(editor, right)
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
  const cleared = clearCells(editor, ranges)
  if (cleared) {
    try {
      selectTableRow(editor, rect.top)
    } catch {
      // Selection restore is best-effort; the clear itself succeeded.
    }
  }
  return cleared
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
  const cleared = clearCells(editor, ranges)
  if (cleared) {
    try {
      selectTableColumn(editor, rect.left)
    } catch {
      // Selection restore is best-effort; the clear itself succeeded.
    }
  }
  return cleared
}
