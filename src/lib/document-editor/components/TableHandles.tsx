import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import type { Editor } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'
import { useDocumentEditor } from '../DocumentEditorContext'
import {
  addTableColumnLeft,
  addTableColumnRight,
  addTableRowAbove,
  addTableRowBelow,
  clearTableColumns,
  clearTableRows,
  deleteTableColumns,
  deleteTableRows,
  duplicateTableColumns,
  duplicateTableRows,
  getTableSelectionContext,
  selectTableColumn,
  selectTableRow,
  tableRowStart,
  toggleTableHeaderColumn,
  toggleTableHeaderRow,
} from '../tableCommands'

type MenuOrientation = 'row' | 'col'

interface HandleGeometry {
  row: number
  col: number
  tableKey: number
  /** All coordinates below are relative to the editor wrapper. */
  rowTop: number
  tableTop: number
  tableLeft: number
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
    return {
      row: context.row,
      col: context.col,
      tableKey: context.tableStart,
      rowTop: rowCoords.top - hostRect.top,
      tableTop: tableCoords.top - hostRect.top,
      tableLeft: tableCoords.left - hostRect.left,
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
  command: (editor: Editor) => boolean
}

function rowMenuItems(isFirstRow: boolean): MenuItem[] {
  const items: MenuItem[] = [
    { id: 'add-above', label: 'Add row above', command: addTableRowAbove },
    { id: 'add-below', label: 'Add row below', command: addTableRowBelow },
    { id: 'duplicate', label: 'Duplicate row', command: duplicateTableRows },
    { id: 'clear', label: 'Clear row contents', command: clearTableRows },
  ]
  if (isFirstRow) items.push({ id: 'header', label: 'Toggle header row', command: toggleTableHeaderRow })
  items.push({ id: 'delete', label: 'Delete row', separatorBefore: true, command: deleteTableRows })
  return items
}

function columnMenuItems(isFirstColumn: boolean): MenuItem[] {
  const items: MenuItem[] = [
    { id: 'add-left', label: 'Add column left', command: addTableColumnLeft },
    { id: 'add-right', label: 'Add column right', command: addTableColumnRight },
    { id: 'duplicate', label: 'Duplicate column', command: duplicateTableColumns },
    { id: 'clear', label: 'Clear column contents', command: clearTableColumns },
  ]
  if (isFirstColumn) items.push({ id: 'header', label: 'Toggle header column', command: toggleTableHeaderColumn })
  items.push({ id: 'delete', label: 'Delete column', separatorBefore: true, command: deleteTableColumns })
  return items
}

interface TableMenuProps {
  editor: Editor
  id: string
  orientation: MenuOrientation
  isFirst: boolean
  top: number
  left: number
  onClose: () => void
}

function TableMenu({ editor, id, orientation, isFirst, top, left, onClose }: TableMenuProps) {
  const items = orientation === 'row' ? rowMenuItems(isFirst) : columnMenuItems(isFirst)
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

  const focusItem = (index: number): void => {
    itemRefs.current[(index + items.length) % items.length]?.focus()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const index = itemRefs.current.findIndex((element) => element === document.activeElement)
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      editor.commands.focus()
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      focusItem(index + 1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      focusItem(index - 1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      focusItem(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      focusItem(items.length - 1)
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

  const tableActive = geometry ? geometry.tableKey : null
  useEffect(() => {
    if (tableActive === null) setOpenMenu(null)
  }, [tableActive])

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
      {openMenu ? (
        <TableMenu
          key={`${openMenu}-${menuId}`}
          id={menuId}
          editor={editor}
          orientation={openMenu}
          isFirst={openMenu === 'row' ? geometry.row === 0 : geometry.col === 0}
          top={menuTop}
          left={menuLeft(menuAnchorLeft)}
          onClose={closeMenu}
        />
      ) : null}
    </div>
  )
}
