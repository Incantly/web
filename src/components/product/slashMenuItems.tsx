import type { Editor } from '@tiptap/core'
import type { SlashMenuItem } from '../../lib/document-editor'
import { documentRichCommands } from '../../lib/document-editor/richCommands'

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

const inTable = (editor: Editor): boolean => {
  const { $from } = editor.state.selection
  for (let depth = $from.depth; depth > 0; depth--) {
    if ($from.node(depth).type.name === 'table') return true
  }
  return false
}

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
  { id: 'paragraph', label: 'Paragraph', description: 'Plain text', keywords: ['text', 'para', 'paragraph', 'plain text'], group: 'Style', command: setParagraph },
  { id: 'heading-1', label: 'Heading 1', description: 'Big title', keywords: ['title', 'h1', 'heading', 'headings', 'header'], group: 'Style', command: setHeading(1) },
  { id: 'heading-2', label: 'Heading 2', description: 'Section subtitle', keywords: ['subtitle', 'h2', 'heading', 'headings', 'subheading', 'header'], group: 'Style', command: setHeading(2) },
  { id: 'blockquote', label: 'Blockquote', description: 'Pull a passage aside', keywords: ['quote', 'quotes', 'citation', 'blockquote'], group: 'Style', command: toggleBlockquote },
  { id: 'checklist', label: 'Checklist', description: 'Track small steps toward an answer', keywords: ['todo', 'todos', 'tasks', 'checklist', 'checklists', 'check list', 'plan'], group: 'Lists', command: (editor) => documentRichCommands.insertChecklist(editor) },
  { id: 'bullet-list', label: 'Bullet list', description: 'Unordered dots', keywords: ['unordered', 'bullet', 'bullets', 'bullet list', 'dot points'], group: 'Lists', command: toggleBulletList },
  { id: 'numbered-list', label: 'Numbered list', description: 'Ordered 1, 2, 3', keywords: ['ordered', 'ordered list', 'numbered', 'number list', 'number lists', 'numbers'], group: 'Lists', command: toggleOrderedList },
  { id: 'question', label: 'Question', description: 'Start from what you want to find out', keywords: ['ask', 'research', 'question', 'questions'], group: 'Blocks', command: setQuestionHeading },
  { id: 'math', label: 'Math block', description: 'Write a formula or equation', keywords: ['math', 'maths', 'formula', 'formulas', 'equation', 'equations', 'latex'], group: 'Blocks', command: (editor) => documentRichCommands.insertMathBlock(editor, '') },
  { id: 'details', label: 'Details', description: 'Collapsible section with a summary', keywords: ['details', 'detail', 'disclosure', 'collapsible', 'collapse', 'toggle', 'summary', 'fold', 'accordion'], group: 'Blocks', command: insertDetails },
  { id: 'code-block', label: 'Code block', description: 'Monospace snippet', keywords: ['code', 'codeblock', 'code block', 'snippet'], group: 'Blocks', command: setCodeBlock },
  { id: 'divider', label: 'Divider', description: 'A rule across the page', keywords: ['rule', 'line', 'divider', 'horizontal rule', 'separator'], group: 'Blocks', command: insertDivider },
  { id: 'table', label: 'Table', description: 'Organize observations in rows and columns', keywords: ['table', 'tables', 'grid', 'columns'], group: 'Insert', command: () => false, isAvailable: (editor) => !inTable(editor), grid: { maxRows: 6, maxCols: 6, defaultRows: 3, defaultCols: 3, command: (editor, rows, columns) => documentRichCommands.insertTable(editor, { rows, columns }) } },
]
