'use client'

import type { HeaderFooterContent, HeaderFooterFieldType, TextAlignment } from '@incantly/canvas-core/document'
import { Node, mergeAttributes } from '@tiptap/core'
import Bold from '@tiptap/extension-bold'
import Document from '@tiptap/extension-document'
import Italic from '@tiptap/extension-italic'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import Underline from '@tiptap/extension-underline'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import type { MouseEvent } from 'react'
import { FIELD_NODE, headerFooterToProseMirror, proseMirrorToHeaderFooter } from '../headerFooterConversion'
import { AlignIcon } from './FormattingUI'

export const HEADER_FOOTER_FIELD_LABELS: Record<HeaderFooterFieldType, string> = {
  pageNumber: 'Page #',
  pageCount: 'Total pages',
  documentTitle: 'Title',
  currentDate: 'Date',
}

/** One header/footer line: alignment is per line, like the canonical paragraph's `alignment`. */
const Line = Paragraph.extend({
  addAttributes: () => ({
    id: { default: null, rendered: false },
    alignment: {
      default: null,
      parseHTML: (element: HTMLElement) => element.style.textAlign || null,
      renderHTML: (attributes: Record<string, unknown>) => (attributes.alignment ? { style: `text-align:${String(attributes.alignment)}` } : {}),
    },
  }),
})

/** A page number, page count, title or date: an atom the cursor steps over, filled in when printed. */
const Field = Node.create({
  name: FIELD_NODE,
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes: () => ({ field: { default: 'pageNumber', rendered: false }, format: { default: null, rendered: false } }),
  parseHTML: () => [{ tag: 'span[data-hf-field]', getAttrs: (element) => ({ field: (element as HTMLElement).dataset.hfField, format: (element as HTMLElement).dataset.format || null }) }],
  renderHTML: ({ node, HTMLAttributes }) => ['span', mergeAttributes(HTMLAttributes, {
    'data-hf-field': node.attrs.field,
    ...(node.attrs.format ? { 'data-format': node.attrs.format } : {}),
    class: 'incantly-hf-field',
    contenteditable: 'false',
  }), HEADER_FOOTER_FIELD_LABELS[node.attrs.field as HeaderFooterFieldType] ?? 'Field'],
})

const extensions = [Document, Line, Text, Bold, Italic, Underline, Field]

const alignments: { value: 'left' | 'center' | 'right'; label: string }[] = [
  { value: 'left', label: 'Align left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Align right' },
]

export type HeaderFooterTextEditorProps = {
  /** Initial content. Remount (change `key`) to load different content, e.g. after a preset. */
  value: readonly HeaderFooterContent[] | undefined
  onChange: (content: ReturnType<typeof proseMirrorToHeaderFooter>) => void
  /** Accessible name, e.g. "Footer, all pages". */
  label: string
  placeholder?: string
  disabled?: boolean
}

/**
 * A small editor for one header or footer: lines of text with bold, italic and underline, an
 * alignment per line, and page fields inserted from its toolbar. It keeps its own editing state;
 * the caller saves what `onChange` reports.
 */
export function HeaderFooterTextEditor({ value, onChange, label, placeholder = 'Empty', disabled = false }: HeaderFooterTextEditorProps) {
  const editor = useEditor({
    extensions,
    content: headerFooterToProseMirror(value),
    editable: !disabled,
    immediatelyRender: false,
    editorProps: { attributes: { 'aria-label': label, 'aria-multiline': 'true', role: 'textbox', class: 'incantly-hf-editor', 'data-placeholder': placeholder } },
    onUpdate: ({ editor: current }) => onChange(proseMirrorToHeaderFooter(current.getJSON())),
  })
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => current ? {
      alignment: (current.state.selection.$from.parent.attrs.alignment as TextAlignment | null) ?? 'left',
      // One line with nothing on it (Tiptap's isEmpty also compares line attributes).
      empty: current.state.doc.childCount === 1 && current.state.doc.firstChild?.content.size === 0,
    } : null,
  })
  // Toolbar buttons act on mousedown so the editor keeps its selection.
  const run = (event: MouseEvent, action: () => void) => { event.preventDefault(); if (!disabled) action() }

  return <div className={`incantly-hf${state?.empty ? ' is-empty' : ''}`}>
    <div className="incantly-hf-toolbar" role="toolbar" aria-label={`${label} tools`}>
      {alignments.map((alignment) => <button key={alignment.value} type="button" disabled={disabled} aria-label={alignment.label} title={alignment.label} aria-pressed={state?.alignment === alignment.value}
        onMouseDown={(event) => run(event, () => editor?.chain().focus().updateAttributes('paragraph', { alignment: alignment.value === 'left' ? null : alignment.value }).run())}><AlignIcon alignment={alignment.value} /></button>)}
    </div>
    <EditorContent editor={editor} />
    <div className="incantly-hf-insert" role="group" aria-label={`Insert into ${label.toLowerCase()}`}>
      <span className="incantly-hf-insert-label" aria-hidden="true">Insert</span>
      {(Object.keys(HEADER_FOOTER_FIELD_LABELS) as HeaderFooterFieldType[]).map((field) => <button key={field} type="button" disabled={disabled} aria-label={`Insert ${HEADER_FOOTER_FIELD_LABELS[field].toLowerCase()}`}
        onMouseDown={(event) => run(event, () => editor?.chain().focus().insertContent({ type: FIELD_NODE, attrs: { field } }).run())}><span>{HEADER_FOOTER_FIELD_LABELS[field]}</span></button>)}
    </div>
  </div>
}
