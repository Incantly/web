import type { Editor } from '@tiptap/core'
import type { SlashMenuItem } from '../../lib/document-editor'
import { documentRichCommands } from '../../lib/document-editor/richCommands'
import { AppIcon, type IconName } from './AppIcon'

type Command = (editor: Editor) => boolean

const setParagraph: Command = (editor) => editor.chain().focus().setNode('paragraph').run()
const setHeading = (level: 1 | 2): Command => (editor) => editor.chain().focus().setNode('heading', { level }).run()
const toggleBulletList: Command = (editor) => editor.chain().focus().toggleList('bulletList', 'listItem').run()
const toggleOrderedList: Command = (editor) => editor.chain().focus().toggleList('orderedList', 'listItem').run()
const toggleBlockquote: Command = (editor) => editor.chain().focus().toggleWrap('blockquote').run()
const setCodeBlock: Command = (editor) => editor.chain().focus().setNode('codeBlock').run()
const insertDivider: Command = (editor) => editor.chain().focus().insertContent({ type: 'horizontalRule' }).run()
const insertDetails: Command = (editor) => editor.chain().focus().setDetails().run()
const setQuestionHeading: Command = (editor) =>
  editor.chain().focus().setNode('heading', { level: 2 }).insertContent('What do you want to find out?').run()

/**
 * Product-flavored slash actions first, then the structural blocks. Every
 * item maps to an existing schema node through canonical-backed commands —
 * no new node or mark types, so no canonical-model mapping, fixture, or
 * migration is required for these.
 *
 * Keywords cover the words people actually type (plurals, h1/h2, "number
 * list", "check list", "ordered list"): an unmatched query silently closes
 * the menu, so a missing alias reads as "Enter does nothing".
 */
export const incantlySlashMenuItems: readonly SlashMenuItem[] = [
  { id: 'question', label: 'Question', description: 'Start from what you want to find out', keywords: ['ask', 'research', 'question', 'questions'], command: setQuestionHeading },
  { id: 'checklist', label: 'Checklist', description: 'Track small steps toward an answer', keywords: ['todo', 'todos', 'tasks', 'checklist', 'checklists', 'check list', 'plan'], command: (editor) => documentRichCommands.insertChecklist(editor) },
  { id: 'math', label: 'Math block', description: 'Write a formula or equation', keywords: ['math', 'maths', 'formula', 'formulas', 'equation', 'equations', 'latex'], command: (editor) => documentRichCommands.insertMathBlock(editor, '') },
  { id: 'table', label: 'Table', description: 'Organize observations in rows and columns', keywords: ['table', 'tables', 'grid', 'columns'], command: (editor) => documentRichCommands.insertTable(editor, { rows: 3, columns: 3 }) },
  { id: 'paragraph', label: 'Paragraph', description: 'Plain text', keywords: ['text', 'para', 'paragraph', 'plain text'], command: setParagraph },
  { id: 'heading-1', label: 'Heading 1', description: 'Big title', keywords: ['title', 'h1', 'heading', 'headings', 'header'], command: setHeading(1) },
  { id: 'heading-2', label: 'Heading 2', description: 'Section subtitle', keywords: ['subtitle', 'h2', 'heading', 'headings', 'subheading', 'header'], command: setHeading(2) },
  { id: 'bullet-list', label: 'Bullet list', description: 'Unordered dots', keywords: ['unordered', 'bullet', 'bullets', 'bullet list', 'dot points'], command: toggleBulletList },
  { id: 'numbered-list', label: 'Numbered list', description: 'Ordered 1, 2, 3', keywords: ['ordered', 'ordered list', 'numbered', 'number list', 'number lists', 'numbers'], command: toggleOrderedList },
  { id: 'blockquote', label: 'Blockquote', description: 'Pull a passage aside', keywords: ['quote', 'quotes', 'citation', 'blockquote'], command: toggleBlockquote },
  { id: 'details', label: 'Details', description: 'Collapsible section with a summary', keywords: ['details', 'detail', 'disclosure', 'collapsible', 'collapse', 'toggle', 'summary', 'fold', 'accordion'], command: insertDetails },
  { id: 'code-block', label: 'Code block', description: 'Monospace snippet', keywords: ['code', 'codeblock', 'code block', 'snippet'], command: setCodeBlock },
  { id: 'divider', label: 'Divider', description: 'A rule across the page', keywords: ['rule', 'line', 'divider', 'horizontal rule', 'separator'], command: insertDivider },
]

const itemIcons: Record<string, IconName> = {
  question: 'search',
  checklist: 'check',
  math: 'math',
  table: 'table',
  paragraph: 'document',
  'heading-1': 'paper',
  'heading-2': 'paper',
  'bullet-list': 'menu',
  'numbered-list': 'menu',
  blockquote: 'quote',
  details: 'chevron',
  'code-block': 'code',
  divider: 'minus',
}

/** Compact icon + text row. The label utilities beat inherited package
 *  styles because they target the element directly; the description keeps
 *  the package default (muted, small). */
export function renderSlashItem(item: SlashMenuItem) {
  return (
    <span className="flex items-center gap-2.5">
      <AppIcon name={itemIcons[item.id] ?? 'document'} className="size-4 shrink-0 text-muted" />
      <span>
        <strong className="block text-[0.8125rem] font-semibold text-foreground">{item.label}</strong>
        {item.description ? <span>{item.description}</span> : null}
      </span>
    </span>
  )
}
