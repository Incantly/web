import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import type { Editor } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'
import { useDocumentEditor } from '../DocumentEditorContext'
import {
  addTableColumnLeft,
  addTableColumnRight,
  addTableRowAbove,
  addTableRowBelow,
  canSortTableColumn,
  clearTableColumns,
  clearTableRows,
  deleteTableColumns,
  deleteTableRows,
  duplicateTableColumns,
  duplicateTableRows,
  extendTableColumns,
  extendTableRows,
  getTableSelectionContext,
  moveTableColumnLeft,
  moveTableColumnRight,
  moveTableRowDown,
  moveTableRowUp,
  selectTableColumn,
  selectTableRow,
  sortTableColumn,
  tableRowStart,
  toggleTableHeaderColumn,
  toggleTableHeaderRow,
} from '../tableCommands'

type MenuOrientation = 'row' | 'col'

interface HandleGeometry {
  row: number
  col: number
  rows: number
  cols: number
  canSort: boolean
  tableKey: number
  /** All coordinates below are relative to the editor wrapper. */
  rowTop: number
  tableTop: number
  tableLeft: number
  tableBottom: number
  tableRight: number
  colLeft: number
  hostWidth: number
}

function readGeometry(editor: Editor): HandleGeometry | null {
  if (!editor.isEditable || editor.isDestroyed) return null
  const context = getTableSelectionContext(editor)
  if (!context) return null
  const host = editor.view.dom.closest<HTMLElement>('[data-incantly-document-editor]')
  if (!host) return null
  const hostRect = host.getBoundingClientRect()
  try {
    const rowCoords = editor.view.coordsAtPos(tableRowStart(context.table, context.tableStart, context.row))
    const tableCoords = editor.view.coordsAtPos(context.tableStart - 1)
    const colCell = context.tableStart + context.map.positionAt(0, context.col, context.table)
    const colCoords = editor.view.coordsAtPos(colCell)
    const tableElement = editor.view.domAtPos(context.tableStart)?.node as HTMLElement | null
    const tableBox = tableElement?.closest?.('table')?.getBoundingClientRect() ?? null
    return {
      row: context.row,
      col: context.col,
      rows: context.rows,
      cols: context.cols,
      canSort: canSortTableColumn(editor),
      tableKey: context.tableStart,
      rowTop: rowCoords.top - hostRect.top,
      tableTop: tableCoords.top - hostRect.top,
      tableLeft: tableCoords.left - hostRect.left,
      tableBottom: (tableBox ? tableBox.bottom : tableCoords.bottom) - hostRect.top,
      tableRight: (tableBox ? tableBox.right : tableCoords.right) - hostRect.left,
      colLeft: colCoords.left - hostRect.left,
      hostWidth: hostRect.width,
    }
  } catch {
    // Layout-less hosts (tests, SSR) have no caret rectangles.
    return null
  }
}

interface MenuItem {
  id: string
  label: string
  separatorBefore?: boolean
  disabled?: boolean
  command: (editor: Editor) => boolean
}

interface MenuContext {
  row: number
  col: number
  rows: number
  cols: number
  canSort: boolean
}

function rowMenuItems(context: MenuContext): MenuItem[] {
  const items: MenuItem[] = [
    { id: 'add-above', label: 'Add row above', command: addTableRowAbove },
    { id: 'add-below', label: 'Add row below', command: addTableRowBelow },
    { id: 'move-up', label: 'Move row up', separatorBefore: true, disabled: context.row === 0, command: moveTableRowUp },
    { id: 'move-down', label: 'Move row down', disabled: context.row >= context.rows - 1, command: moveTableRowDown },
    { id: 'duplicate', label: 'Duplicate row', separatorBefore: true, command: duplicateTableRows },
    { id: 'clear', label: 'Clear row contents', command: clearTableRows },
  ]
  if (context.row === 0) items.push({ id: 'header', label: 'Toggle header row', command: toggleTableHeaderRow })
  items.push({ id: 'delete', label: 'Delete row', separatorBefore: true, command: deleteTableRows })
  return items
}

function columnMenuItems(context: MenuContext): MenuItem[] {
  const items: MenuItem[] = [
    { id: 'add-left', label: 'Add column left', command: addTableColumnLeft },
    { id: 'add-right', label: 'Add column right', command: addTableColumnRight },
    { id: 'move-left', label: 'Move column left', separatorBefore: true, disabled: context.col === 0, command: moveTableColumnLeft },
    { id: 'move-right', label: 'Move column right', disabled: context.col >= context.cols - 1, command: moveTableColumnRight },
    { id: 'sort-asc', label: 'Sort column A–Z', separatorBefore: true, disabled: !context.canSort, command: (editor) => sortTableColumn(editor, 'asc') },
    { id: 'sort-desc', label: 'Sort column Z–A', disabled: !context.canSort, command: (editor) => sortTableColumn(editor, 'desc') },
    { id: 'duplicate', label: 'Duplicate column', separatorBefore: true, command: duplicateTableColumns },
    { id: 'clear', label: 'Clear column contents', command: clearTableColumns },
  ]
  if (context.col === 0) items.push({ id: 'header', label: 'Toggle header column', command: toggleTableHeaderColumn })
  items.push({ id: 'delete', label: 'Delete column', separatorBefore: true, command: deleteTableColumns })
  return items
}

interface TableMenuProps {
  editor: Editor
  id: string
  orientation: MenuOrientation
  context: MenuContext
  top: number
  left: number
  onClose: () => void
}

function TableMenu({ editor, id, orientation, context, top, left, onClose }: TableMenuProps) {
  const items = orientation === 'row' ? rowMenuItems(context) : columnMenuItems(context)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])

  useEffect(() => {
    itemRefs.current[0]?.focus()
  }, [])

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest?.('[data-table-menu], [data-table-handle]')) return
      onClose()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [onClose])

  const enabledIndexes = items
    .map((item, itemIndex) => (item.disabled ? -1 : itemIndex))
    .filter((itemIndex) => itemIndex >= 0)

  const focusEnabled = (enabledPosition: number): void => {
    if (!enabledIndexes.length) return
    const wrapped = (enabledPosition + enabledIndexes.length) % enabledIndexes.length
    itemRefs.current[enabledIndexes[wrapped]]?.focus()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const current = enabledIndexes.indexOf(itemRefs.current.findIndex((element) => element === document.activeElement))
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      editor.commands.focus()
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      focusEnabled(current + 1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      focusEnabled(current - 1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      focusEnabled(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      focusEnabled(enabledIndexes.length - 1)
    }
  }

  return (
    <div
      data-table-menu
      id={id}
      role="menu"
      aria-label={orientation === 'row' ? 'Row actions' : 'Column actions'}
      className="incantly-table-menu"
      style={{ top, left }}
      onKeyDown={onKeyDown}
    >
      {items.map((item, index) => (
        <span key={item.id} className="incantly-table-menu-row">
          {item.separatorBefore ? <span className="incantly-table-menu-separator" aria-hidden="true" /> : null}
          <button
            type="button"
            role="menuitem"
            disabled={item.disabled}
            ref={(element) => { itemRefs.current[index] = element }}
            onClick={() => { item.command(editor) }}
          >
            {item.label}
          </button>
        </span>
      ))}
    </div>
  )
}

export interface TableHandlesProps {
  editor?: Editor | null
  className?: string
}

/**
 * Row/column handles with action menus for the table under the selection.
 * Tap a handle to select its row/column and open its menu — single gesture,
 * no hover required, so touch and keyboard users get the same path.
 */
export function TableHandles({ editor: suppliedEditor, className }: TableHandlesProps) {
  const contextualEditor = useDocumentEditor()
  const editor = suppliedEditor ?? contextualEditor
  const menuId = useId()
  const geometry = useEditorState({
    editor,
    selector: ({ editor: current }) => (current ? readGeometry(current) : null),
  })
  const [openMenu, setOpenMenu] = useState<MenuOrientation | null>(null)
  // Extend bars stay hidden until the pointer lingers at the table's bottom
  // or right edge. Touch and keyboard users get the same bars through
  // editor focus instead (see the :focus-within rule in document.css).
  const [edge, setEdge] = useState({ rows: false, cols: false })
  const geometryRef = useRef(geometry)
  geometryRef.current = geometry

  const tableActive = geometry ? geometry.tableKey : null
  useEffect(() => {
    if (tableActive === null) setOpenMenu(null)
  }, [tableActive])

  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    const host = editor.view.dom.closest<HTMLElement>('[data-incantly-document-editor]')
    if (!host) return
    const zone = 64
    const onMove = (event: MouseEvent): void => {
      const current = geometryRef.current
      if (!current) return
      const hostRect = host.getBoundingClientRect()
      const x = event.clientX - hostRect.left
      const y = event.clientY - hostRect.top
      const rows = x >= current.tableLeft - 16 && x <= current.tableRight + 16
        && y >= current.tableBottom - 24 && y <= current.tableBottom + zone
      const cols = y >= current.tableTop - 16 && y <= current.tableBottom + 16
        && x >= current.tableRight - 24 && x <= current.tableRight + zone
      setEdge((previous) => (previous.rows === rows && previous.cols === cols ? previous : { rows, cols }))
    }
    const onLeave = (): void => {
      setEdge((previous) => (!previous.rows && !previous.cols ? previous : { rows: false, cols: false }))
    }
    host.addEventListener('mousemove', onMove)
    host.addEventListener('mouseleave', onLeave)
    return () => {
      host.removeEventListener('mousemove', onMove)
      host.removeEventListener('mouseleave', onLeave)
    }
  }, [editor, tableActive])

  if (!editor || !geometry) return null

  // 44px target + 8px gap; when the table reaches the wrapper edge the
  // handle docks inside instead of overflowing the page.
  const gutter = 52
  const rowLeft = geometry.tableLeft - gutter >= 0 ? geometry.tableLeft - gutter : geometry.tableLeft + 4
  const rowTop = Math.max(0, geometry.rowTop + 2)
  const colLeft = geometry.colLeft + 2
  const colTop = geometry.tableTop - gutter >= 0 ? geometry.tableTop - gutter : geometry.tableTop + 4
  const menuWidth = 240
  const menuLeft = (anchorLeft: number): number =>
    Math.min(Math.max(4, anchorLeft), Math.max(4, geometry.hostWidth - menuWidth))

  const openRowMenu = (): void => {
    if (selectTableRow(editor, geometry.row)) setOpenMenu('row')
  }
  const openColumnMenu = (): void => {
    if (selectTableColumn(editor, geometry.col)) setOpenMenu('col')
  }
  const closeMenu = (): void => setOpenMenu(null)

  const menuTop = (openMenu === 'row' ? rowTop : colTop) + 48
  const menuAnchorLeft = openMenu === 'row' ? rowLeft : colLeft

  // Extend bars: full-width "+" below the table appends a row, full-height
  // "+" right of the table appends a column. The column bar docks inside
  // when the table reaches the wrapper edge (same rule as the handles).
  const extendRowsTop = geometry.tableBottom + 6
  const extendRowsWidth = Math.max(44, geometry.tableRight - geometry.tableLeft)
  const extendColsLeft = geometry.tableRight + gutter + 44 <= geometry.hostWidth
    ? geometry.tableRight + 6
    : geometry.tableRight - 44 - 6
  const extendColsHeight = Math.max(44, geometry.tableBottom - geometry.tableTop)

  // The outside-pointerdown closer dismisses any open menu before the
  // click lands, so no explicit close is needed here.
  const extendRows = (): void => {
    extendTableRows(editor)
  }
  const extendColumns = (): void => {
    extendTableColumns(editor)
  }

  return (
    <div className={['incantly-table-handles', className].filter(Boolean).join(' ')}>
      <button
        type="button"
        data-table-handle
        data-orientation="row"
        aria-label="Row actions"
        aria-haspopup="menu"
        aria-expanded={openMenu === 'row'}
        aria-controls={openMenu === 'row' ? menuId : undefined}
        className="incantly-table-handle"
        style={{ top: rowTop, left: rowLeft } as CSSProperties}
        onClick={openRowMenu}
      >
        <span aria-hidden="true">≡</span>
      </button>
      <button
        type="button"
        data-table-handle
        data-orientation="col"
        aria-label="Column actions"
        aria-haspopup="menu"
        aria-expanded={openMenu === 'col'}
        aria-controls={openMenu === 'col' ? menuId : undefined}
        className="incantly-table-handle"
        style={{ top: colTop, left: colLeft } as CSSProperties}
        onClick={openColumnMenu}
      >
        <span aria-hidden="true">⋮</span>
      </button>
      <button
        type="button"
        data-table-extend="rows"
        data-edge={edge.rows ? 'true' : 'false'}
        aria-label="Add row at end"
        className="incantly-table-extend"
        style={{ top: extendRowsTop, left: geometry.tableLeft, width: extendRowsWidth } as CSSProperties}
        onClick={extendRows}
      >
        <span aria-hidden="true" className="incantly-table-extend-pill">+</span>
      </button>
      <button
        type="button"
        data-table-extend="columns"
        data-edge={edge.cols ? 'true' : 'false'}
        aria-label="Add column at end"
        className="incantly-table-extend"
        style={{ top: geometry.tableTop, left: extendColsLeft, height: extendColsHeight } as CSSProperties}
        onClick={extendColumns}
      >
        <span aria-hidden="true" className="incantly-table-extend-pill">+</span>
      </button>
      {openMenu ? (
        <TableMenu
          key={`${openMenu}-${menuId}`}
          id={menuId}
          editor={editor}
          orientation={openMenu}
          context={{
            row: geometry.row,
            col: geometry.col,
            rows: geometry.rows,
            cols: geometry.cols,
            canSort: geometry.canSort,
          }}
          top={menuTop}
          left={menuLeft(menuAnchorLeft)}
          onClose={closeMenu}
        />
      ) : null}
    </div>
  )
}
