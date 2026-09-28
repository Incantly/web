import { useEffect, useId, useRef, useState, type CSSProperties, type HTMLAttributes, type MouseEvent, type ReactNode } from 'react'
import type { Editor } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import { useDocumentEditor } from '../DocumentEditorContext'
import { CODE_BLOCK_LANGUAGES } from '../schema/codeHighlight'
import { documentRichCommands } from '../richCommands'

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

/** Line-spacing glyph: text lines with a vertical double arrow. */
function SpacingIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="2" y1="4" x2="11" y2="4" />
      <line x1="2" y1="8.5" x2="11" y2="8.5" />
      <line x1="2" y1="13" x2="13" y2="13" />
      <line x1="15" y1="2.5" x2="15" y2="15.5" />
      <polyline points="13,4.5 15,2.5 17,4.5" />
      <polyline points="13,13.5 15,15.5 17,13.5" />
    </svg>
  )
}

function FormatButton({ label, shortcut, active = false, disabled = false, command, editor, children }: FormatButtonProps) {
  const run = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    if (!disabled) command(editor)
  }
  return (
    <button type="button" className="incantly-format-button" aria-label={label} aria-pressed={active}
      disabled={disabled} title={shortcut ? `${label} (${shortcut})` : label} onMouseDown={run}>
      {children}
    </button>
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
      inlineMath: current.isActive('inlineMath'),
      textColor: (current.getAttributes('textStyle').color as string | undefined) ?? null,
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

const LINE_SPACING_PRESETS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 1, label: 'Single' },
  { value: 1.15, label: '1.15' },
  { value: 1.5, label: '1.5' },
  { value: 2, label: 'Double' },
]

const toggleMark = (name: string): Command => (editor) => editor.chain().focus().toggleMark(name).run()
const setParagraph: Command = (editor) => editor.chain().focus().setNode('paragraph').run()
const setHeading = (level: 1 | 2): Command => (editor) => editor.chain().focus().setNode('heading', { level }).run()
const toggleBulletList: Command = (editor) => editor.chain().focus().toggleList('bulletList', 'listItem').run()
const toggleOrderedList: Command = (editor) => editor.chain().focus().toggleList('orderedList', 'listItem').run()
const toggleBlockquote: Command = (editor) => editor.chain().focus().toggleWrap('blockquote').run()

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
    <div {...props} className={['incantly-document-toolbar', className].filter(Boolean).join(' ')}
      role="toolbar" aria-label={props['aria-label'] ?? 'Document formatting'}>
      <FormatButton editor={editor} label="Undo" shortcut="Mod-Z" disabled={disabled || !state.canUndo}
        command={(current) => current.chain().focus().undo().run()}>↶</FormatButton>
      <FormatButton editor={editor} label="Redo" shortcut="Mod-Shift-Z" disabled={disabled || !state.canRedo}
        command={(current) => current.chain().focus().redo().run()}>↷</FormatButton>
      <span className="incantly-toolbar-separator" aria-hidden="true" />
      <FormatButton editor={editor} label="Paragraph" active={state.paragraph} disabled={disabled} command={setParagraph}>P</FormatButton>
      <FormatButton editor={editor} label="Heading 1" active={state.heading1} disabled={disabled} command={setHeading(1)}>H1</FormatButton>
      <FormatButton editor={editor} label="Heading 2" active={state.heading2} disabled={disabled} command={setHeading(2)}>H2</FormatButton>
      <span className="incantly-toolbar-separator" aria-hidden="true" />
      <FormatButton editor={editor} label="Bold" shortcut="Mod-B" active={state.bold} disabled={disabled} command={toggleMark('bold')}><strong>B</strong></FormatButton>
      <FormatButton editor={editor} label="Italic" shortcut="Mod-I" active={state.italic} disabled={disabled} command={toggleMark('italic')}><em>I</em></FormatButton>
      <FormatButton editor={editor} label="Underline" shortcut="Mod-U" active={state.underline} disabled={disabled} command={toggleMark('underline')}><u>U</u></FormatButton>
      <FormatButton editor={editor} label="Strikethrough" shortcut="Mod-Shift-S" active={state.strike} disabled={disabled} command={toggleMark('strike')}><s>S</s></FormatButton>
      <FormatButton editor={editor} label="Inline code" shortcut="Mod-E" active={state.code} disabled={disabled} command={toggleMark('code')}>&lt;/&gt;</FormatButton>
      <span className="incantly-toolbar-separator" aria-hidden="true" />
      <FormatButton editor={editor} label="Bullet list" active={state.bulletList} disabled={disabled} command={toggleBulletList}>• List</FormatButton>
      <FormatButton editor={editor} label="Numbered list" active={state.orderedList} disabled={disabled} command={toggleOrderedList}>1. List</FormatButton>
      <FormatButton editor={editor} label="Blockquote" active={state.blockquote} disabled={disabled} command={toggleBlockquote}>“”</FormatButton>
    </div>
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
      <div {...props} className={['incantly-document-bubble-toolbar', className].filter(Boolean).join(' ')}
        role="toolbar" aria-label={props['aria-label'] ?? 'Selection formatting'}>
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
        ) : (
          <>
            <FormatButton editor={editor} label="Bold" shortcut="Mod-B" active={state.bold} command={toggleMark('bold')}><strong>B</strong></FormatButton>
            <FormatButton editor={editor} label="Italic" shortcut="Mod-I" active={state.italic} command={toggleMark('italic')}><em>I</em></FormatButton>
            <FormatButton editor={editor} label="Underline" shortcut="Mod-U" active={state.underline} command={toggleMark('underline')}><u>U</u></FormatButton>
            <FormatButton editor={editor} label="Inline code" shortcut="Mod-E" active={state.code} command={toggleMark('code')}>&lt;/&gt;</FormatButton>
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
            {state.paragraph && !state.inCodeBlock ? (
              <label className="incantly-format-spacing" title="Line spacing">
                <SpacingIcon />
                <span className="sr-only">Line spacing</span>
                <select
                  aria-label="Line spacing"
                  value={state.lineHeight === null ? '' : String(state.lineHeight)}
                  onChange={(event) => {
                    const raw = event.target.value
                    if (!raw) {
                      documentRichCommands.unsetParagraphLineHeight(editor)
                    } else {
                      documentRichCommands.setParagraphLineHeight(editor, Number(raw))
                    }
                  }}
                >
                  <option value="">Default</option>
                  {LINE_SPACING_PRESETS.map((preset) => (
                    <option key={preset.value} value={String(preset.value)}>{preset.label}</option>
                  ))}
                  {state.lineHeight !== null
                    && !LINE_SPACING_PRESETS.some((preset) => preset.value === state.lineHeight) ? (
                    <option value={String(state.lineHeight)}>{String(state.lineHeight)}</option>
                  ) : null}
                </select>
              </label>
            ) : null}
          </>
        )}
        {state.inTable && !convertOnly && !mathEditing && !state.inCodeBlock ? (
          <span className="incantly-format-table-controls" role="group" aria-label="Table structure">
            <FormatButton editor={editor} label="Add row below" command={documentRichCommands.addTableRow}>+Row</FormatButton>
            <FormatButton editor={editor} label="Add column to the right" command={documentRichCommands.addTableColumn}>+Col</FormatButton>
            <FormatButton editor={editor} label="Delete current row" command={documentRichCommands.deleteTableRow}>−Row</FormatButton>
            <FormatButton editor={editor} label="Delete current column" command={documentRichCommands.deleteTableColumn}>−Col</FormatButton>
          </span>
        ) : null}
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
      </div>
    </BubbleMenu>
  )
}

export interface SlashMenuItem {
  id: string
  label: string
  description?: string
  keywords?: readonly string[]
  command: Command
  /**
   * Contextual availability. The menu hides items that return false instead
   * of showing an action that would do nothing (or harm, like nesting a
   * table inside a table cell and blowing out the page width).
   */
  isAvailable?: (editor: Editor) => boolean
  /**
   * Optional size picker. Enter (or clicking the row) runs `command` for the
   * default size; ArrowRight (or hovering the row) opens the grid, where
   * arrows size, Enter confirms, and Escape returns to the list.
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

export const defaultSlashMenuItems: readonly SlashMenuItem[] = [
  { id: 'paragraph', label: 'Paragraph', keywords: ['text'], command: setParagraph },
  { id: 'heading-1', label: 'Heading 1', keywords: ['title'], command: setHeading(1) },
  { id: 'heading-2', label: 'Heading 2', keywords: ['subtitle'], command: setHeading(2) },
  { id: 'bullet-list', label: 'Bullet list', keywords: ['unordered'], command: toggleBulletList },
  { id: 'numbered-list', label: 'Numbered list', keywords: ['ordered'], command: toggleOrderedList },
  { id: 'blockquote', label: 'Blockquote', keywords: ['quote'], command: toggleBlockquote },
  { id: 'code-block', label: 'Code block', keywords: ['code'], command: (editor) => editor.chain().focus().setNode('codeBlock').run() },
  { id: 'divider', label: 'Divider', keywords: ['rule', 'line'], command: (editor) => editor.chain().focus().insertContent({ type: 'horizontalRule' }).run() },
]

export interface DocumentSlashMenuProps extends HTMLAttributes<HTMLDivElement> {
  editor?: Editor | null
  items?: readonly SlashMenuItem[]
  renderItem?: (item: SlashMenuItem) => ReactNode
  onOpenChange?: (open: boolean) => void
}

export function DocumentSlashMenu({ editor: suppliedEditor, items = defaultSlashMenuItems, renderItem,
  onOpenChange, className, ...props }: DocumentSlashMenuProps) {
  const contextualEditor = useDocumentEditor()
  const editor = suppliedEditor ?? contextualEditor
  const menuId = useId()
  const menuRef = useRef<HTMLDivElement>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [gridSel, setGridSel] = useState<{ rows: number; cols: number } | null>(null)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])
  const [position, setPosition] = useState<CSSProperties | null>(null)
  const match = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      if (!current || !current.isEditable || !current.state.selection.empty) return null
      const { $from } = current.state.selection
      // Multi-word queries allowed ("number lists", "check list"): match to caret, trim for matching.
      const text = $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc')
      const found = text.match(/(?:^|\s)\/([^/]*)$/)
      if (!found) return null
      return { query: found[1].toLowerCase().trim(), from: $from.pos - found[0].trimStart().length, to: $from.pos }
    },
  })
  const filtered = match && editor ? items.filter((item) => {
    if (item.isAvailable && !item.isAvailable(editor)) return false
    const haystack = [item.label, ...(item.keywords ?? [])].join(' ').toLowerCase()
    return haystack.includes(match.query)
  }) : []
  const open = Boolean(match && filtered.length)
  useEffect(() => { onOpenChange?.(open) }, [onOpenChange, open])
  useEffect(() => { setActiveIndex(0); setGridSel(null) }, [match?.query, items])
  // Arrow-key navigation follows the highlight: the menu list scrolls so the
  // active item stays visible instead of running past the edge.
  useEffect(() => {
    if (open) itemRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, open])
  useEffect(() => {
    if (!editor || !open || !match) { setPosition(null); return }
    const updatePosition = () => {
      const host = editor.view.dom.closest<HTMLElement>('[data-incantly-document-editor]')
      if (!host) return
      let caret: { top: number; bottom: number; left: number }
      try {
        caret = editor.view.coordsAtPos(match.to)
      } catch {
        // Layout-less hosts (SSR test runners) have no caret rectangles. The
        // browser will calculate the anchored position on its next layout pass.
        setPosition({ top: 8, left: 8 })
        return
      }
      const hostRect = host.getBoundingClientRect()
      const menuHeight = menuRef.current?.offsetHeight ?? 0
      const fitsBelow = caret.bottom + menuHeight + 8 <= window.innerHeight
      const top = (fitsBelow ? caret.bottom + 6 : caret.top - menuHeight - 6) - hostRect.top
      const maxLeft = Math.max(8, hostRect.width - (menuRef.current?.offsetWidth ?? 0) - 8)
      setPosition({ top: Math.max(8, top), left: Math.max(8, Math.min(caret.left - hostRect.left, maxLeft)) })
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    return () => window.removeEventListener('resize', updatePosition)
  }, [editor, match?.to, open])
  useEffect(() => {
    if (!editor || !open || !match) return
    // Capture phase: this must run before ProseMirror's own Enter/Arrow
    // handling on the same element, otherwise the paragraph splits (or the
    // cursor moves) before the menu can commit the chosen block.
    const activeItem = filtered[activeIndex]
    const grid: { item: SlashMenuItem; grid: SlashMenuGrid; sel: { rows: number; cols: number } } | null = gridSel && activeItem?.grid ? { item: activeItem, grid: activeItem.grid, sel: gridSel } : null
    const commitGrid = (rows: number, cols: number): void => {
      if (!grid) return
      editor.chain().focus().deleteRange({ from: match.from, to: match.to }).run()
      grid.grid.command(editor, rows, cols)
      setGridSel(null)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (grid) {
        if (event.key === 'ArrowRight' || event.key === 'ArrowLeft' || event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault()
          event.stopPropagation()
          setGridSel((sel) => {
            if (!sel) return sel
            const dCols = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
            const dRows = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
            return {
              rows: Math.min(grid.grid.maxRows, Math.max(1, sel.rows + dRows)),
              cols: Math.min(grid.grid.maxCols, Math.max(1, sel.cols + dCols)),
            }
          })
        } else if (event.key === 'Enter') {
          event.preventDefault()
          event.stopPropagation()
          commitGrid(grid.sel.rows, grid.sel.cols)
        } else if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          setGridSel(null)
        }
        return
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        event.stopPropagation()
        setActiveIndex((index) => {
          const direction = event.key === 'ArrowDown' ? 1 : -1
          return (index + direction + filtered.length) % filtered.length
        })
      } else if (event.key === 'ArrowRight') {
        if (!activeItem?.grid) return
        event.preventDefault()
        event.stopPropagation()
        setGridSel({ rows: activeItem.grid.defaultRows, cols: activeItem.grid.defaultCols })
      } else if (event.key === 'Enter') {
        event.preventDefault()
        // Stop ProseMirror's own Enter (splitBlock / splitListItem) from
        // firing after the slash command converts the block. Without this
        // the new heading/list is immediately split and the caret lands in
        // a fresh paragraph, which reads as "Enter did nothing".
        event.stopPropagation()
        const item = filtered[activeIndex]
        if (!item) return
        // Grid items open their size picker on Enter instead of inserting;
        // a second Enter confirms the highlighted size.
        if (item.grid) {
          setGridSel({ rows: item.grid.defaultRows, cols: item.grid.defaultCols })
          return
        }
        editor.chain().focus().deleteRange({ from: match.from, to: match.to }).run()
        item.command(editor)
      } else if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        editor.commands.deleteRange({ from: match.from, to: match.to })
      }
    }
    const element = editor.view.dom
    element.addEventListener('keydown', handleKeyDown, true)
    return () => element.removeEventListener('keydown', handleKeyDown, true)
  }, [activeIndex, editor, filtered, gridSel, match, open])
  if (!editor || !match || !filtered.length) return null
  const choose = (item: SlashMenuItem, index: number) => (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    // Grid rows open their picker on click, mirroring Enter; sizing is
    // preserved when re-entering the already-open row.
    if (item.grid) {
      openGrid(item, index)()
      return
    }
    editor.chain().focus().deleteRange({ from: match.from, to: match.to }).run()
    item.command(editor)
  }
  const activeGridItem = gridSel ? filtered[activeIndex] : undefined
  const grid: { item: SlashMenuItem; grid: SlashMenuGrid; sel: { rows: number; cols: number } } | null = activeGridItem?.grid && gridSel ? { item: activeGridItem, grid: activeGridItem.grid, sel: gridSel } : null
  const confirmGrid = (rows: number, cols: number) => (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    if (!grid) return
    editor.chain().focus().deleteRange({ from: match.from, to: match.to }).run()
    grid.grid.command(editor, rows, cols)
    setGridSel(null)
  }
  const openGrid = (item: SlashMenuItem, index: number) => () => {
    const alreadyOpen = gridSel !== null && filtered[activeIndex]?.id === item.id
    setActiveIndex(index)
    if (!item.grid) {
      setGridSel(null)
      return
    }
    if (!alreadyOpen) setGridSel({ rows: item.grid.defaultRows, cols: item.grid.defaultCols })
  }
  return (
    <div {...props} ref={menuRef} id={menuId} style={{ ...props.style, ...position }}
      className={['incantly-document-slash-menu', className].filter(Boolean).join(' ')}
      role="menu" aria-label={props['aria-label'] ?? 'Insert block'}>
      {filtered.map((item, index) => (
        <span key={item.id}>
          <button type="button" role="menuitem" aria-current={index === activeIndex ? 'true' : undefined}
            ref={(element) => { itemRefs.current[index] = element }}
            onMouseEnter={openGrid(item, index)} onMouseDown={choose(item, index)}>
            {renderItem ? renderItem(item) : <><strong>{item.label}</strong>{item.description ? <span>{item.description}</span> : null}</>}
          </button>
          {grid && grid.item.id === item.id ? (
            <span className="incantly-slash-grid" role="group" aria-label={`${item.label} size`}>
              <span className="incantly-slash-grid-size" role="status">{grid.sel.rows} × {grid.sel.cols}</span>
              <span className="incantly-slash-grid-cells" style={{ gridTemplateColumns: `repeat(${grid.grid.maxCols}, 2.75rem)` }}>
                {Array.from({ length: grid.grid.maxRows }, (_, row) => Array.from({ length: grid.grid.maxCols }, (_, col) => {
                  const rows = row + 1
                  const cols = col + 1
                  const highlighted = rows <= grid.sel.rows && cols <= grid.sel.cols
                  return (
                    <button key={`${rows}x${cols}`} type="button" className="incantly-slash-grid-cell"
                      data-active={highlighted ? 'true' : undefined}
                      aria-label={`${rows} rows by ${cols} columns`}
                      onMouseEnter={() => setGridSel({ rows, cols })} onMouseDown={confirmGrid(rows, cols)} />
                  )
                }))}
              </span>
              <span className="incantly-slash-grid-hint">Arrows to size · Enter to insert · Esc for list</span>
            </span>
          ) : null}
        </span>
      ))}
    </div>
  )
}
