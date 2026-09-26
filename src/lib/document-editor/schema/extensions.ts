import { Extension, type Extensions } from '@tiptap/core'
import { splitListItem } from '@tiptap/pm/schema-list'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Placeholder from '@tiptap/extension-placeholder'
import { incantlyDocumentMarks } from './marks'
import { IncantlyNodeIds } from './nodeIds'
import { IncantlyTableSchemaRoles, incantlyDocumentNodes } from './nodes'
import { WebPagination, type WebPaginationOptions } from '../paginationExtension'
import { DocumentClipboard, type DocumentClipboardOptions } from '../clipboardExtension'

const restrictedStarterKit = StarterKit.configure({
  document: false,
  text: false,
  paragraph: false,
  heading: false,
  blockquote: false,
  bulletList: false,
  orderedList: false,
  listItem: false,
  horizontalRule: false,
  codeBlock: false,
  underline: false,
  trailingNode: false,
  link: {
    openOnClick: false,
    autolink: false,
    linkOnPaste: false,
    protocols: ['http', 'https', 'mailto', 'tel'],
  },
})

const FormattingShortcuts = Extension.create({
  name: 'incantlyFormattingShortcuts',
  addKeyboardShortcuts() {
    return {
      'Mod-Alt-0': () => this.editor.commands.setNode('paragraph'),
      'Mod-Alt-1': () => this.editor.commands.setNode('heading', { level: 1 }),
      'Mod-Alt-2': () => this.editor.commands.setNode('heading', { level: 2 }),
      'Mod-Shift-7': () => this.editor.commands.toggleList('orderedList', 'listItem'),
      'Mod-Shift-8': () => this.editor.commands.toggleList('bulletList', 'listItem'),
      'Mod-Shift-B': () => this.editor.commands.toggleWrap('blockquote'),
      Enter: () => {
        const listItem = this.editor.state.schema.nodes.listItem
        if (!listItem) return false
        return splitListItem(listItem)(this.editor.state, (transaction) => this.editor.view.dispatch(transaction))
      },
    }
  },
})

/**
 * The complete v1 editing schema. Keep this list explicit: adding an extension is
 * a persisted-format decision and must be paired with core schema support.
 */
export interface IncantlyDocumentExtensionOptions {
  placeholder?: string | (() => string)
  pagination?: false | WebPaginationOptions
  clipboard?: false | DocumentClipboardOptions
}

export function createIncantlyDocumentExtensions(
  options: IncantlyDocumentExtensionOptions = {},
): Extensions {
  const placeholder = options.placeholder
  return [
    restrictedStarterKit,
    Underline,
    Placeholder.configure({
      placeholder: typeof placeholder === 'function' ? () => placeholder() : placeholder ?? 'Start writing…',
      showOnlyCurrent: true,
      showOnlyWhenEditable: true,
      includeChildren: false,
    }),
    ...incantlyDocumentNodes,
    IncantlyTableSchemaRoles,
    ...incantlyDocumentMarks,
    IncantlyNodeIds,
    FormattingShortcuts,
    ...(options.pagination === false ? [] : [WebPagination.configure(options.pagination ?? {})]),
    ...(options.clipboard === false ? [] : [DocumentClipboard.configure(options.clipboard ?? {})]),
  ]
}

export const incantlyDocumentExtensions: Extensions = createIncantlyDocumentExtensions()
