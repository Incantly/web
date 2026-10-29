import { useCallback, useEffect, useMemo, useRef, useState, type HTMLAttributes, type MouseEvent, type ReactNode } from 'react'
import type { Editor } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'
import { NodeSelection } from '@tiptap/pm/state'
import { useImageAlign } from '@/components/tiptap-ui/image-align-button'
import { useSlashCommandTrigger } from '@/components/tiptap-ui/slash-command-trigger-button'
import { SlashDropdownMenu } from '@/components/tiptap-ui/slash-dropdown-menu'
import { TableGridSelector } from '@/components/tiptap-node/table-node/ui/table-trigger-button/table-grid-selector'
import { Card, CardBody } from '@/components/tiptap-ui-primitive/card'
import { Button } from '@/components/tiptap-ui-primitive/button'
import { Toolbar, ToolbarGroup, ToolbarSeparator } from '@/components/tiptap-ui-primitive/toolbar'
import { TypeIcon } from '@/components/tiptap-icons/type-icon'
import { ListTodoIcon } from '@/components/tiptap-icons/list-todo-icon'
import { TableIcon } from '@/components/tiptap-icons/table-icon'
import { HeadingOneIcon } from '@/components/tiptap-icons/heading-one-icon'
import { HeadingTwoIcon } from '@/components/tiptap-icons/heading-two-icon'
import { ListIcon } from '@/components/tiptap-icons/list-icon'
import { ListOrderedIcon } from '@/components/tiptap-icons/list-ordered-icon'
import { BlockquoteIcon } from '@/components/tiptap-icons/blockquote-icon'
import { ChevronRightIcon } from '@/components/tiptap-icons/chevron-right-icon'
import { CodeBlockIcon } from '@/components/tiptap-icons/code-block-icon'
import { MinusIcon } from '@/components/tiptap-icons/minus-icon'
import { ImageIcon } from '@/components/tiptap-icons/image-icon'
import { PaperclipIcon } from '@/components/tiptap-icons/paperclip-icon'
import { BubbleMenu } from '@tiptap/react/menus'
import { useDocumentEditor } from '../DocumentEditorContext'
import { CODE_BLOCK_LANGUAGES } from '../schema/codeHighlight'
import { documentRichCommands } from '../richCommands'
import { matchFontFamilyKey, parseFontSizeToPt } from '../schema/fonts'

type Command = (editor: Editor) => boolean

export interface DollarMathCandidate {
  from: number
  to: number
  latex: string
}

/**
 * Finds a `$latex$` span around a collapsed caret. Code blocks are excluded
 * (a dollar there is literal), and so are existing math atoms (the caret can
 * never sit inside one). Positions are document positions for deleteRange.
 *
 * The caret may sit right after the closing dollar (the natural moment just
 * after typing it). To keep plain currency quiet, collapsed-caret offers
 * require a math-ish character in the span; an explicit text selection of
 * `$...$` always qualifies as deliberate intent.
 */
const MATHY = /[\\^_{}=+]/

export function findDollarMathCandidate(state: Editor['state']): DollarMathCandidate | null {
  const { selection } = state
  if (!selection.empty) {
    const text = state.doc.textBetween(selection.from, selection.to, undefined, '￼')
    const selected = /^\$([^$\n￼]{1,200})\$$/.exec(text)
    if (selected) return { from: selection.from, to: selection.to, latex: selected[1] }
    return null
  }
  const $from = selection.$from
  const parent = $from.parent
  if (!parent.isTextblock || parent.type.name === 'codeBlock') return null
  const text = parent.textBetween(0, parent.content.size, undefined, '￼')
  const pattern = /\$([^$\n￼]{1,200})\$/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    const start = match.index
    const end = start + match[0].length
    if ($from.parentOffset > start && $from.parentOffset <= end && MATHY.test(match[1])) {
      const from = $from.start() + start
      return { from, to: from + match[0].length, latex: match[1] }
    }
  }
  return null
}

interface FormatButtonProps {
  label: string
  shortcut?: string
  active?: boolean
  disabled?: boolean
  command: Command
  editor: Editor
  children: ReactNode
}

const ALIGN_ICON_LINES: Record<'left' | 'center' | 'right', Array<[number, number, number, number]>> = {
  left: [[3, 4, 15, 4], [3, 8, 11, 8], [3, 12, 15, 12], [3, 16, 11, 16]],
  center: [[5, 4, 13, 4], [3, 8, 15, 8], [5, 12, 13, 12], [3, 16, 15, 16]],
  right: [[3, 4, 15, 4], [7, 8, 15, 8], [3, 12, 15, 12], [7, 16, 15, 16]],
}

/** Word-style alignment glyph: icon plus an accessible name via the button label. */
function AlignIcon({ alignment }: { alignment: 'left' | 'center' | 'right' }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      {ALIGN_ICON_LINES[alignment].map(([x1, y1, x2, y2]) => (
        <line key={`${x1}-${y1}-${x2}-${y2}`} x1={x1} y1={y1} x2={x2} y2={y2} />
      ))}
    </svg>
  )
}


function FormatButton({ label, shortcut, active = false, disabled = false, command, editor, children }: FormatButtonProps) {
  const run = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    if (!disabled) command(editor)
  }
  return (
    <Button type="button" variant="ghost" className="incantly-format-button" aria-label={label} aria-pressed={active}
      disabled={disabled} tooltip={shortcut ? `${label} (${shortcut})` : label} onMouseDown={run}>
      {children}
    </Button>
  )
}

function useFormattingState(editor: Editor | null) {
  return useEditorState({
    editor,
    selector: ({ editor: current }) => current ? ({
      editable: current.isEditable,
      bold: current.isActive('bold'), italic: current.isActive('italic'), underline: current.isActive('underline'),
      strike: current.isActive('strike'), code: current.isActive('code'), paragraph: current.isActive('paragraph'),
      heading1: current.isActive('heading', { level: 1 }), heading2: current.isActive('heading', { level: 2 }),
      bulletList: current.isActive('bulletList'), orderedList: current.isActive('orderedList'),
      blockquote: current.isActive('blockquote'), codeBlock: current.isActive('codeBlock'),
      // isActive is range-sensitive and drops when a selection spans out of
      // the block; either selection end inside a code block means the user
      // is working with code (boundary positions resolve to the neighbor).
      inCodeBlock: [current.state.selection.$from, current.state.selection.$to]
        .some((pos) => pos.parent.type.name === 'codeBlock'),
      mathBlock: current.isActive('blockMath'),
      mathLatex: (current.getAttributes('blockMath').latex as string | undefined) ?? '',
      // Image-card alignment (official ImageAlignButton behavior): only when
      // an image node itself is selected; marks never apply to the atom.
      imageSelected: current.state.selection instanceof NodeSelection
        && current.state.selection.node.type.name === 'image',
      imageAlignment: current.state.selection instanceof NodeSelection
        && current.state.selection.node.type.name === 'image'
        ? ((current.getAttributes('image').alignment as string | undefined) ?? null)
        : null,
      inlineMath: current.isActive('inlineMath'),
      textColor: (current.getAttributes('textStyle').color as string | undefined) ?? null,
      fontFamily: matchFontFamilyKey((current.getAttributes('textStyle').fontFamily as string | undefined) ?? ''),
      fontSize: parseFontSizeToPt((current.getAttributes('textStyle').fontSize as string | undefined) ?? ''),
      // Word-style paragraph spacing; headings never carry it (canonical). 
      lineHeight: (current.getAttributes('paragraph').lineHeight as number | undefined) ?? null,
      // textAlign lives on the block (paragraph or heading); either may hold it.
      textAlign: ((current.getAttributes('paragraph').textAlign ?? current.getAttributes('heading').textAlign) as string | undefined) ?? null,
      inlineMathLatex: (current.getAttributes('inlineMath').latex as string | undefined) ?? '',
      dollarMath: findDollarMathCandidate(current.state),
      // Ancestor walk, not isActive: a selection starting on a block
      // boundary resolves outside the table and would read inactive.
      inTable: [current.state.selection.$from, current.state.selection.$to].some((pos) => {
        for (let depth = pos.depth; depth > 0; depth--) {
          if (pos.node(depth).type.name === 'table') return true
        }
        return false
      }),
      codeLanguage: (current.getAttributes('codeBlock').language as string | undefined) ?? '',
      canUndo: current.can().chain().focus().undo().run(),
      canRedo: current.can().chain().focus().redo().run(),
    }) : null,
  })
}

const toggleMark = (name: string): Command => (editor) => editor.chain().focus().toggleMark(name).run()
const setParagraph: Command = (editor) => editor.chain().focus().setNode('paragraph').run()
const setHeading = (level: 1 | 2): Command => (editor) => editor.chain().focus().setNode('heading', { level }).run()
const toggleBulletList: Command = (editor) => editor.chain().focus().toggleList('bulletList', 'listItem').run()
const toggleOrderedList: Command = (editor) => editor.chain().focus().toggleList('orderedList', 'listItem').run()
const toggleBlockquote: Command = (editor) => editor.chain().focus().toggleWrap('blockquote').run()

export interface DocumentToolbarProps extends HTMLAttributes<HTMLDivElement> {
  editor?: Editor | null
}

/**
 * Official slash-trigger behavior: Cmd/Ctrl+/ inserts "/" (which opens the
 * slash menu), plus a visible "+" button wherever rendered. Mount with
 * `hotkeyOnly` where no button surface exists — the product editor relies
 * on the shortcut plus "/" typing and the placeholder hint for discovery.
 */
export function SlashCommandTrigger({ editor: suppliedEditor, hotkeyOnly = false }: {
  editor?: Editor | null
  hotkeyOnly?: boolean
}) {
  const contextualEditor = useDocumentEditor()
  const editor = suppliedEditor ?? contextualEditor
  const { isVisible, canInsert, handleSlashCommand, label, Icon } = useSlashCommandTrigger({
    editor,
    trigger: '/',
    hideWhenUnavailable: true,
  })
  if (!editor || !isVisible || hotkeyOnly) return null
  return (
    <FormatButton
      editor={editor}
      label={label}
      shortcut="Mod-/"
      disabled={!canInsert}
      command={() => handleSlashCommand()}
    >
      <Icon width={18} height={18} />
    </FormatButton>
  )
}

export interface DocumentToolbarProps extends HTMLAttributes<HTMLDivElement> {
  editor?: Editor | null
}

export function DocumentToolbar({ editor: suppliedEditor, className, ...props }: DocumentToolbarProps) {
  const contextualEditor = useDocumentEditor()
  const editor = suppliedEditor ?? contextualEditor
  const state = useFormattingState(editor)
  if (!editor || !state) return null
  const disabled = !state.editable
  return (
    <Toolbar {...props} variant="fixed" className={['incantly-document-toolbar', className].filter(Boolean).join(' ')}
      aria-label={props['aria-label'] ?? 'Document formatting'}>
      <ToolbarGroup>
      <FormatButton editor={editor} label="Undo" shortcut="Mod-Z" disabled={disabled || !state.canUndo}
        command={(current) => current.chain().focus().undo().run()}>↶</FormatButton>
      <FormatButton editor={editor} label="Redo" shortcut="Mod-Shift-Z" disabled={disabled || !state.canRedo}
        command={(current) => current.chain().focus().redo().run()}>↷</FormatButton>
      </ToolbarGroup>
      <ToolbarSeparator />
      <ToolbarGroup>
      <FormatButton editor={editor} label="Paragraph" active={state.paragraph} disabled={disabled} command={setParagraph}>P</FormatButton>
      <FormatButton editor={editor} label="Heading 1" active={state.heading1} disabled={disabled} command={setHeading(1)}>H1</FormatButton>
      <FormatButton editor={editor} label="Heading 2" active={state.heading2} disabled={disabled} command={setHeading(2)}>H2</FormatButton>
      </ToolbarGroup>
      <ToolbarSeparator />
      <ToolbarGroup>
      <FormatButton editor={editor} label="Bold" shortcut="Mod-B" active={state.bold} disabled={disabled} command={toggleMark('bold')}><strong>B</strong></FormatButton>
      <FormatButton editor={editor} label="Italic" shortcut="Mod-I" active={state.italic} disabled={disabled} command={toggleMark('italic')}><em>I</em></FormatButton>
      <FormatButton editor={editor} label="Underline" shortcut="Mod-U" active={state.underline} disabled={disabled} command={toggleMark('underline')}><u>U</u></FormatButton>
      <FormatButton editor={editor} label="Strikethrough" shortcut="Mod-Shift-S" active={state.strike} disabled={disabled} command={toggleMark('strike')}><s>S</s></FormatButton>
      <FormatButton editor={editor} label="Inline code" shortcut="Mod-E" active={state.code} disabled={disabled} command={toggleMark('code')}>&lt;/&gt;</FormatButton>
      </ToolbarGroup>
      <ToolbarSeparator />
      <ToolbarGroup>
      <FormatButton editor={editor} label="Bullet list" active={state.bulletList} disabled={disabled} command={toggleBulletList}>• List</FormatButton>
      <FormatButton editor={editor} label="Numbered list" active={state.orderedList} disabled={disabled} command={toggleOrderedList}>1. List</FormatButton>
      <FormatButton editor={editor} label="Blockquote" active={state.blockquote} disabled={disabled} command={toggleBlockquote}>“”</FormatButton>
      </ToolbarGroup>
    </Toolbar>
  )
}

/**
 * Official image-alignment behavior (`useImageAlign` against our `image`
 * node and `alignment` attribute) rendered with our bubble buttons, so the
 * controls keep our tokens, touch targets, and mousedown selection handling.
 */
function ImageAlignButtons({ editor }: { editor: Editor }) {
  const left = useImageAlign({ editor, align: 'left', extensionName: 'image', attributeName: 'alignment', hideWhenUnavailable: true })
  const center = useImageAlign({ editor, align: 'center', extensionName: 'image', attributeName: 'alignment', hideWhenUnavailable: true })
  const right = useImageAlign({ editor, align: 'right', extensionName: 'image', attributeName: 'alignment', hideWhenUnavailable: true })
  const items = [
    { align: 'left', ...left },
    { align: 'center', ...center },
    { align: 'right', ...right },
  ] as const
  return (
    <span className="incantly-format-align" role="group" aria-label="Image alignment">
      {items.map((item) => {
        const Icon = item.Icon as React.FC<{ width?: number | string; height?: number | string }>
        return (
          <FormatButton
            key={item.align}
            editor={editor}
            label={item.label}
            active={item.isActive}
            disabled={!item.canAlign}
            command={() => { item.handleImageAlign(); return true }}
          >
            <Icon width={18} height={18} />
            <span className="sr-only">{item.label}</span>
          </FormatButton>
        )
      })}
    </span>
  )
}

export interface DocumentBubbleToolbarProps extends Omit<DocumentToolbarProps, 'children'> {
  editor?: Editor | null
}

export function DocumentBubbleToolbar({ editor: suppliedEditor, className, ...props }: DocumentBubbleToolbarProps) {
  const contextualEditor = useDocumentEditor()
  const editor = suppliedEditor ?? contextualEditor
  const state = useFormattingState(editor)
  if (!editor || !state || !state.editable) return null
  // A detected formula gets a single-purpose bubble: just the convert
  // button, no Bold/Italic/Underline/Code noise. One click converts.
  const convertOnly = state.dollarMath !== null && !state.mathBlock && !state.inlineMath && !state.inCodeBlock
  // A selected formula gets only its LaTeX editor for the same reason:
  // text marks cannot apply inside a math atom, so the buttons would lie.
  const mathEditing = !convertOnly && (state.mathBlock || state.inlineMath)
  const imageEditing = !convertOnly && !mathEditing && state.imageSelected
  const convertCommand: Command = (current) => {
    const candidate = findDollarMathCandidate(current.state) ?? state.dollarMath
    if (!candidate) return false
    if (current.state.doc.resolve(candidate.from).parent.type.name === 'codeBlock') return false
    // Two steps: deleteRange collapses the selection, and positions
    // before `from` are untouched by the deletion, so the insert
    // lands exactly where the dollars were.
    if (!current.chain().focus().deleteRange({ from: candidate.from, to: candidate.to }).run()) return false
    return current.chain().focus().insertContentAt(candidate.from, { type: 'inlineMath', attrs: { latex: candidate.latex } }).run()
  }
  return (
    <BubbleMenu editor={editor} shouldShow={({ state: current }) => !current.selection.empty || findDollarMathCandidate(current) !== null}>
      <Toolbar {...props} variant="floating" className={['incantly-document-bubble-toolbar', className].filter(Boolean).join(' ')}
        aria-label={props['aria-label'] ?? 'Selection formatting'}>
        {convertOnly && state.dollarMath ? (
          <FormatButton editor={editor} label={`Convert ${state.dollarMath.latex} to math`} command={convertCommand}>∑</FormatButton>
        ) : mathEditing ? (
          <label className="incantly-format-math">
            <span className="sr-only">Math formula (LaTeX)</span>
            <input
              aria-label="Math formula (LaTeX)"
              type="text"
              placeholder="LaTeX…"
              value={state.mathBlock ? state.mathLatex : state.inlineMathLatex}
              onChange={(event) => {
                // No .focus() here: refocusing the editor on every keystroke
                // would steal the caret out of this input while typing.
                // Re-selecting the atom instead keeps the NodeSelection (and
                // the bubble) alive across the attribute transaction.
                const latex = event.target.value
                const type = state.mathBlock ? 'blockMath' : 'inlineMath'
                const { from } = editor.state.selection
                editor.chain().updateAttributes(type, { latex }).setNodeSelection(from).run()
              }}
            />
          </label>
        ) : imageEditing ? (
          <ImageAlignButtons editor={editor} />
        ) : (
          <>
            <ToolbarGroup>
            <FormatButton editor={editor} label="Bold" shortcut="Mod-B" active={state.bold} command={toggleMark('bold')}><strong>B</strong></FormatButton>
            <FormatButton editor={editor} label="Italic" shortcut="Mod-I" active={state.italic} command={toggleMark('italic')}><em>I</em></FormatButton>
            <FormatButton editor={editor} label="Underline" shortcut="Mod-U" active={state.underline} command={toggleMark('underline')}><u>U</u></FormatButton>
            <FormatButton editor={editor} label="Inline code" shortcut="Mod-E" active={state.code} command={toggleMark('code')}>&lt;/&gt;</FormatButton>
            </ToolbarGroup>
            <ToolbarSeparator />
            <ToolbarGroup>
            {!state.inCodeBlock ? (
              <span className="incantly-format-color" role="group" aria-label="Text color">
                <label title="Text color">
                  <span className="sr-only">Text color</span>
                  <input
                    type="color"
                    aria-label="Text color"
                    value={/^#[0-9a-f]{6}$/i.test(state.textColor ?? '') ? (state.textColor as string) : '#000000'}
                    onChange={(event) => { documentRichCommands.setTextColor(editor, event.target.value) }}
                  />
                </label>
                {state.textColor ? (
                  <FormatButton editor={editor} label="Remove text color" command={(current) => documentRichCommands.unsetTextColor(current)}>✕</FormatButton>
                ) : null}
              </span>
            ) : null}
            </ToolbarGroup>
            <ToolbarSeparator />
            <ToolbarGroup>
            {!state.inCodeBlock ? (
              <span className="incantly-format-align" role="group" aria-label="Text alignment">
                {(['left', 'center', 'right'] as const).map((alignment) => (
                  <FormatButton
                    key={alignment}
                    editor={editor}
                    label={`Align ${alignment}`}
                    active={state.textAlign === alignment}
                    command={(current) => documentRichCommands.toggleTextAlignment(current, alignment)}
                  >
                    <AlignIcon alignment={alignment} />
                    <span className="sr-only">Align {alignment}</span>
                  </FormatButton>
                ))}
              </span>
            ) : null}
            <FormatButton editor={editor} label="Reset formatting" command={(current) => current.chain().focus().unsetAllMarks().clearNodes().run()}><TypeIcon className="tiptap-button-icon" /></FormatButton>
            </ToolbarGroup>
          </>
        )}
        {state.inCodeBlock ? (
          <label className="incantly-format-language">
            <span className="sr-only">Code language</span>
            <select
              aria-label="Code language"
              value={CODE_BLOCK_LANGUAGES.some((option) => option.value === state.codeLanguage) ? state.codeLanguage : ''}
              onChange={(event) => {
                const language = event.target.value
                editor.chain().focus().updateAttributes('codeBlock', { language: language || null }).run()
              }}
            >
              <option value="">Plain text</option>
              {CODE_BLOCK_LANGUAGES.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        ) : null}
      </Toolbar>
    </BubbleMenu>
  )
}

export interface SlashMenuItem {
  id: string
  label: string
  description?: string
  keywords?: readonly string[]
  /** TipTap slash-menu section label. Items retain this grouping while filtered. */
  group?: string
  command: Command
  /**
   * Contextual availability. The menu hides items that return false instead
   * of showing an action that would do nothing (or harm, like nesting a
   * table inside a table cell and blowing out the page width).
   */
  isAvailable?: (editor: Editor) => boolean
  /**
   * Optional size picker. Selecting the menu item opens the grid at its
   * configured default size. Arrows resize, Enter confirms, and Escape closes.
   */
  grid?: SlashMenuGrid
}

export interface SlashMenuGrid {
  maxRows: number
  maxCols: number
  defaultRows: number
  defaultCols: number
  command: (editor: Editor, rows: number, columns: number) => boolean
}

const slashItemIcons = {
  question: TypeIcon,
  checklist: ListTodoIcon,
  math: CodeBlockIcon,
  table: TableIcon,
  paragraph: TypeIcon,
  'heading-1': HeadingOneIcon,
  'heading-2': HeadingTwoIcon,
  'bullet-list': ListIcon,
  'numbered-list': ListOrderedIcon,
  blockquote: BlockquoteIcon,
  details: ChevronRightIcon,
  'code-block': CodeBlockIcon,
  divider: MinusIcon,
  image: ImageIcon,
  upload: PaperclipIcon,
} as const

export const defaultSlashMenuItems: readonly SlashMenuItem[] = [
  { id: 'paragraph', label: 'Paragraph', keywords: ['text'], group: 'Style', command: setParagraph },
  { id: 'heading-1', label: 'Heading 1', keywords: ['title'], group: 'Style', command: setHeading(1) },
  { id: 'heading-2', label: 'Heading 2', keywords: ['subtitle'], group: 'Style', command: setHeading(2) },
  { id: 'bullet-list', label: 'Bullet list', keywords: ['unordered'], group: 'Lists', command: toggleBulletList },
  { id: 'numbered-list', label: 'Numbered list', keywords: ['ordered'], group: 'Lists', command: toggleOrderedList },
  { id: 'blockquote', label: 'Blockquote', keywords: ['quote'], group: 'Style', command: toggleBlockquote },
  { id: 'code-block', label: 'Code block', keywords: ['code'], group: 'Blocks', command: (editor) => editor.chain().focus().setNode('codeBlock').run() },
  { id: 'divider', label: 'Divider', keywords: ['rule', 'line'], group: 'Blocks', command: (editor) => editor.chain().focus().insertContent({ type: 'horizontalRule' }).run() },
]

export interface DocumentSlashMenuProps extends HTMLAttributes<HTMLDivElement> {
  editor?: Editor | null
  items?: readonly SlashMenuItem[]
  renderItem?: (item: SlashMenuItem) => ReactNode
}

interface SlashGridState {
  item: SlashMenuItem
  grid: SlashMenuGrid
  top: number
  left: number
  width: number
}

function SlashTablePicker({ grid, editor, onClose }: {
  grid: SlashGridState
  editor: Editor
  onClose: () => void
}) {
  const [hoveredCell, setHoveredCell] = useState({
    row: grid.grid.defaultRows - 1,
    col: grid.grid.defaultCols - 1,
  })
  const pickerRef = useRef<HTMLDivElement>(null)
  const insert = useCallback((row: number, col: number) => {
    if (grid.grid.command(editor, row + 1, col + 1)) onClose()
  }, [editor, grid.grid, onClose])

  // Choosing the menu item with Enter opens the picker mid-event, so that same keydown reaches the
  // listener below. Only keys pressed after the picker appeared count, or Enter would insert the
  // default size before the user sees the grid.
  const [openedAt] = useState(() => performance.now())

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.timeStamp <= openedAt) return
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        editor.commands.focus()
        return
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        insert(hoveredCell.row, hoveredCell.col)
        return
      }
      const deltas: Record<string, readonly [number, number] | undefined> = {
        ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1],
      }
      const delta = deltas[event.key]
      if (!delta) return
      event.preventDefault()
      setHoveredCell((current) => ({
        row: Math.max(0, Math.min(grid.grid.maxRows - 1, current.row + delta[0])),
        col: Math.max(0, Math.min(grid.grid.maxCols - 1, current.col + delta[1])),
      }))
    }
    window.addEventListener('keydown', onKeyDown)
    pickerRef.current?.focus()
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [editor, grid.grid.maxCols, grid.grid.maxRows, hoveredCell, insert, onClose, openedAt])

  return (
    <Card ref={pickerRef} tabIndex={-1} className="tiptap-slash-table-picker" role="dialog" aria-label={`${grid.item.label} size`}
      style={{ top: grid.top, left: grid.left, width: grid.width }}>
      <CardBody>
        <TableGridSelector
          maxRows={grid.grid.maxRows}
          maxCols={grid.grid.maxCols}
          hoveredCell={hoveredCell}
          onCellHover={(row, col) => setHoveredCell({ row, col })}
          onCellClick={insert}
          onMouseLeave={() => undefined}
        />
      </CardBody>
    </Card>
  )
}
/** The stock Tiptap slash menu, with our canonical commands as menu actions. */
export function DocumentSlashMenu({ editor: suppliedEditor, items = defaultSlashMenuItems }: DocumentSlashMenuProps) {
  const contextualEditor = useDocumentEditor()
  const editor = suppliedEditor ?? contextualEditor
  const [grid, setGrid] = useState<SlashGridState | null>(null)
  const openGrid = useCallback((activeEditor: Editor, item: SlashMenuItem) => {
    if (!item.grid || activeEditor.isDestroyed) return
    try {
      const caret = activeEditor.view.coordsAtPos(activeEditor.state.selection.from)
      const editorRect = activeEditor.view.dom.getBoundingClientRect()
      const gutter = 8
      const width = Math.max(
        0,
        Math.min(288, editorRect.width - gutter * 2, window.innerWidth - gutter * 2),
      )
      const left = Math.max(
        editorRect.left + gutter,
        Math.min(caret.left, editorRect.right - width - gutter),
      )
      setGrid({
        item,
        grid: item.grid,
        top: Math.max(gutter, Math.min(caret.bottom + gutter, window.innerHeight - 272)),
        left,
        width,
      })
    } catch {
      setGrid({ item, grid: item.grid, top: 8, left: 8, width: Math.min(288, Math.max(0, window.innerWidth - 16)) })
    }
  }, [])
  const availabilityKey = useEditorState({
    editor,
    selector: ({ editor: activeEditor }) => activeEditor
      ? items.map((item) => item.isAvailable?.(activeEditor) !== false ? '1' : '0').join('')
      : '',
  })
  const customItems = useMemo(() => {
    void availabilityKey
    return items.filter((item) => editor && item.isAvailable?.(editor) !== false).map((item) => ({
      title: item.label,
      subtext: item.description,
      keywords: [...(item.keywords ?? [])],
      badge: slashItemIcons[item.id as keyof typeof slashItemIcons] ?? TypeIcon,
      group: item.group ?? 'Blocks',
      onSelect: ({ editor: activeEditor }: { editor: Editor }) => {
        if (item.grid) openGrid(activeEditor, item)
        else item.command(activeEditor)
      },
    }))
  }, [availabilityKey, editor, items, openGrid])

  if (!editor) return null
  return (
    <>
    <SlashDropdownMenu
      editor={editor}
      config={{ enabledItems: [], customItems, showGroups: true }}
    />
    {grid ? <SlashTablePicker grid={grid} editor={editor} onClose={() => setGrid(null)} /> : null}
    </>
  )
}
