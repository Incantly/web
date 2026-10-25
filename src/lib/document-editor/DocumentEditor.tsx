import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  type AriaAttributes,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { Editor, type FocusPosition } from '@tiptap/core'
import { EditorContent, useEditor } from '@tiptap/react'
import { EditorState, type Transaction } from '@tiptap/pm/state'
import {
  createDocument,
  recoverDocument,
  validateDocument,
  type DocumentValidationIssue,
  type IncantlyDocument,
} from '@incantly/canvas-core/document'
import { incantlyDocumentToProseMirror, type DocumentAdapterIssue } from './conversion'
import { createIncantlyDocumentExtensions } from './schema/index'
import { DocumentEditorProvider } from './DocumentEditorContext'
import { DocumentBubbleToolbar, DocumentSlashMenu, DocumentToolbar } from './components/FormattingUI'
import '@/components/tiptap-node/table-node/styles/prosemirror-table.scss'
import '@/components/tiptap-node/table-node/styles/table-node.scss'
import {
  DocumentCheckpointTracker,
  mapProseMirrorTransaction,
  type CanonicalDocumentChangeEvent,
} from './transactionMapping'

export interface DocumentEditorSelection {
  from: number
  to: number
  anchor: number
  head: number
  empty: boolean
}

export type DocumentEditorValidationIssue = DocumentValidationIssue | DocumentAdapterIssue
export type DocumentEditorErrorPhase =
  | 'initialization' | 'transaction' | 'controlled-update' | 'command' | 'query' | 'replace'

export interface DocumentEditorError {
  error: unknown
  phase: DocumentEditorErrorPhase
}

export type DocumentEditorCommand<TResult = boolean> = (editor: Editor) => TResult
export type DocumentEditorStateQuery<TResult> = (editor: Editor) => TResult
export type DocumentEditorTheme = 'light' | 'dark'

export interface ReplaceDocumentOptions {
  /** Defaults to false. Host-driven replacement is not reported as a user edit. */
  emitChange?: boolean
}

export interface DocumentEditorRef {
  readonly editor: Editor | null
  focus(position?: FocusPosition): boolean
  blur(): boolean
  executeCommand<TResult = boolean>(command: DocumentEditorCommand<TResult>): TResult | false
  queryState<TResult>(query: DocumentEditorStateQuery<TResult>): TResult | undefined
  getDocument(): IncantlyDocument | null
  replaceDocument(document: IncantlyDocument, options?: ReplaceDocumentOptions): boolean
  /** Safe to call repeatedly; all other methods become inert after destruction. */
  destroy(): void
}

export interface DocumentEditorProps extends Pick<AriaAttributes,
  'aria-label' | 'aria-labelledby' | 'aria-describedby' | 'aria-details' | 'aria-roledescription'> {
  /** Controlled document. Changes replace editor state without recreating the Editor instance. */
  document?: IncantlyDocument
  /** Used only once when the component is uncontrolled. */
  initialDocument?: IncantlyDocument
  readonly?: boolean
  /** Overrides the default editable state unless readonly is true. */
  editable?: boolean
  /** Initial focus behavior. Later changes do not recreate or refocus the editor. */
  autofocus?: FocusPosition
  /** Visual document theme. This is independent from the Canvas theme. */
  theme?: DocumentEditorTheme
  /** Transient empty-block hint. It is never written to canonical document JSON. */
  placeholder?: string
  id?: string
  role?: string
  className?: string
  style?: CSSProperties
  /** Optional built-in formatting UI. Omit it and compose the exported UI primitives for custom layouts. */
  ui?: 'none' | 'formatting'
  /** Custom UI rendered in the editor context without becoming document content. */
  children?: ReactNode
  onReady?: (editor: Editor, ref: DocumentEditorRef) => void
  onChange?: (document: IncantlyDocument, event: CanonicalDocumentChangeEvent, editor: Editor) => void
  onTransaction?: (event: CanonicalDocumentChangeEvent, transaction: Transaction, editor: Editor) => void
  onSelectionChange?: (selection: DocumentEditorSelection, editor: Editor) => void
  onValidationIssue?: (issues: readonly DocumentEditorValidationIssue[], editor: Editor) => void
  onError?: (error: DocumentEditorError, editor: Editor | null) => void
}

interface CallbackBag {
  onReady?: DocumentEditorProps['onReady']
  onChange?: DocumentEditorProps['onChange']
  onTransaction?: DocumentEditorProps['onTransaction']
  onSelectionChange?: DocumentEditorProps['onSelectionChange']
  onValidationIssue?: DocumentEditorProps['onValidationIssue']
  onError?: DocumentEditorProps['onError']
}

const cloneDocument = (document: IncantlyDocument): IncantlyDocument =>
  JSON.parse(JSON.stringify(document)) as IncantlyDocument

function prepareDocument(value: IncantlyDocument): {
  document: IncantlyDocument
  issues: DocumentValidationIssue[]
} {
  const validation = validateDocument(value)
  if (validation.valid) return { document: value, issues: [] }
  const recovered = recoverDocument(value)
  return { document: recovered.document, issues: recovered.issues }
}

function replaceEditorDocument(editor: Editor, document: IncantlyDocument): void {
  const json = incantlyDocumentToProseMirror(document).value
  const doc = editor.schema.nodeFromJSON(json)
  // A replacement is an external checkpoint. Recreating only EditorState clears
  // transient history while preserving the Editor instance and React bindings.
  editor.view.updateState(EditorState.create({ schema: editor.schema, doc, plugins: editor.state.plugins }))
}

export const DocumentEditor = forwardRef<DocumentEditorRef, DocumentEditorProps>(function DocumentEditor(
  props,
  forwardedRef,
) {
  const callbacksRef = useRef<CallbackBag>({})
  callbacksRef.current = {
    onReady: props.onReady,
    onChange: props.onChange,
    onTransaction: props.onTransaction,
    onSelectionChange: props.onSelectionChange,
    onValidationIssue: props.onValidationIssue,
    onError: props.onError,
  }
  const initialRef = useRef<ReturnType<typeof prepareDocument> | null>(null)
  if (!initialRef.current) initialRef.current = prepareDocument(props.document ?? props.initialDocument ?? createDocument())
  const currentDocumentRef = useRef(initialRef.current.document)
  const suppressTransactionsRef = useRef(false)
  const checkpointTrackerRef = useRef(new DocumentCheckpointTracker())
  const apiRef = useRef<DocumentEditorRef | null>(null)
  const readyEditorRef = useRef<Editor | null>(null)
  const placeholderRef = useRef(props.placeholder ?? 'Start writing…')
  placeholderRef.current = props.placeholder ?? 'Start writing…'
  const extensionsRef = useRef(createIncantlyDocumentExtensions({
    placeholder: () => placeholderRef.current,
  }))

  const editable = props.readonly === true ? false : props.editable ?? true
  const initialEditableRef = useRef(editable)
  const initialAutofocusRef = useRef(props.autofocus ?? false)

  const editor = useEditor({
    extensions: extensionsRef.current,
    content: incantlyDocumentToProseMirror(initialRef.current.document).value,
    editable: initialEditableRef.current,
    autofocus: initialAutofocusRef.current,
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    enableContentCheck: true,
    onContentError: ({ editor: activeEditor, error }) => {
      callbacksRef.current.onError?.({ error, phase: 'transaction' }, activeEditor)
    },
    onTransaction: ({ editor: activeEditor, transaction }) => {
      if (suppressTransactionsRef.current) return
      try {
        const event = mapProseMirrorTransaction({
          document: currentDocumentRef.current,
          transaction,
          checkpointTracker: checkpointTrackerRef.current,
        })
        if (event.mode !== 'none') currentDocumentRef.current = event.document
        callbacksRef.current.onTransaction?.(event, transaction, activeEditor)
        if (event.adapterReport?.issues.length)
          callbacksRef.current.onValidationIssue?.(event.adapterReport.issues, activeEditor)
        if (event.mode !== 'none') callbacksRef.current.onChange?.(event.document, event, activeEditor)
      } catch (error) {
        callbacksRef.current.onError?.({ error, phase: 'transaction' }, activeEditor)
      }
    },
    onSelectionUpdate: ({ editor: activeEditor }) => {
      const selection = activeEditor.state.selection
      callbacksRef.current.onSelectionChange?.({
        from: selection.from,
        to: selection.to,
        anchor: selection.anchor,
        head: selection.head,
        empty: selection.empty,
      }, activeEditor)
    },
  }, [])

  const reportError = (error: unknown, phase: DocumentEditorErrorPhase): void =>
    callbacksRef.current.onError?.({ error, phase }, editor && !editor.isDestroyed ? editor : null)

  // Built outside useImperativeHandle so onReady still gets the API when no ref is passed.
  const editorApi = useMemo((): DocumentEditorRef => {
    const liveEditor = (): Editor | null => editor && !editor.isDestroyed ? editor : null
    const api: DocumentEditorRef = {
      get editor() { return liveEditor() },
      focus(position = null) { return liveEditor()?.commands.focus(position) ?? false },
      blur() { return liveEditor()?.commands.blur() ?? false },
      executeCommand<TResult = boolean>(command: DocumentEditorCommand<TResult>): TResult | false {
        const activeEditor = liveEditor()
        if (!activeEditor) return false
        try { return command(activeEditor) } catch (error) { reportError(error, 'command'); return false }
      },
      queryState<TResult>(query: DocumentEditorStateQuery<TResult>): TResult | undefined {
        const activeEditor = liveEditor()
        if (!activeEditor) return undefined
        try { return query(activeEditor) } catch (error) { reportError(error, 'query'); return undefined }
      },
      getDocument() { return liveEditor() ? cloneDocument(currentDocumentRef.current) : null },
      replaceDocument(document: IncantlyDocument, options: ReplaceDocumentOptions = {}) {
        const activeEditor = liveEditor()
        if (!activeEditor) return false
        try {
          const prepared = prepareDocument(document)
          suppressTransactionsRef.current = true
          replaceEditorDocument(activeEditor, prepared.document)
          currentDocumentRef.current = prepared.document
          checkpointTrackerRef.current.markCheckpoint()
          if (prepared.issues.length) callbacksRef.current.onValidationIssue?.(prepared.issues, activeEditor)
          if (options.emitChange) {
            const event: CanonicalDocumentChangeEvent = {
              origin: 'system', mode: 'checkpoint', operations: [], changedNodeIds: [],
              document: prepared.document, checkpointReason: 'forced',
            }
            callbacksRef.current.onChange?.(prepared.document, event, activeEditor)
          }
          return true
        } catch (error) {
          reportError(error, 'replace')
          return false
        } finally {
          suppressTransactionsRef.current = false
        }
      },
      destroy() { liveEditor()?.destroy() },
    }
    return api
  }, [editor])
  apiRef.current = editorApi
  useImperativeHandle(forwardedRef, () => editorApi, [editorApi])

  useEffect(() => {
    if (!editor || editor.isDestroyed || readyEditorRef.current === editor || !apiRef.current) return
    readyEditorRef.current = editor
    if (initialRef.current?.issues.length)
      callbacksRef.current.onValidationIssue?.(initialRef.current.issues, editor)
    callbacksRef.current.onReady?.(editor, apiRef.current)
  }, [editor])

  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    editor.setEditable(editable, false)
    const attributes: Record<string, string> = {
      role: props.role ?? 'textbox',
      'aria-multiline': 'true',
      'aria-readonly': String(!editable),
    }
    if (props['aria-label']) attributes['aria-label'] = props['aria-label']
    if (props['aria-labelledby']) attributes['aria-labelledby'] = props['aria-labelledby']
    if (props['aria-describedby']) attributes['aria-describedby'] = props['aria-describedby']
    if (props['aria-details']) attributes['aria-details'] = props['aria-details']
    if (props['aria-roledescription']) attributes['aria-roledescription'] = props['aria-roledescription']
    editor.setOptions({ editorProps: { ...editor.options.editorProps, attributes } })
  }, [editor, editable, props.role, props['aria-label'], props['aria-labelledby'], props['aria-describedby'], props['aria-details'], props['aria-roledescription']])

  useEffect(() => {
    if (!props.document || !editor || editor.isDestroyed) return
    if (JSON.stringify(props.document) === JSON.stringify(currentDocumentRef.current)) return
    try {
      const prepared = prepareDocument(props.document)
      suppressTransactionsRef.current = true
      replaceEditorDocument(editor, prepared.document)
      currentDocumentRef.current = prepared.document
      checkpointTrackerRef.current.markCheckpoint()
      if (prepared.issues.length) callbacksRef.current.onValidationIssue?.(prepared.issues, editor)
    } catch (error) {
      reportError(error, 'controlled-update')
    } finally {
      suppressTransactionsRef.current = false
    }
  }, [editor, props.document])

  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    // Placeholder decorations are derived UI. An empty transaction asks the
    // plugin to redraw after a host changes the text without touching content.
    editor.view.dispatch(editor.state.tr.setMeta('incantly:placeholder-change', true))
  }, [editor, props.placeholder])

  const wrapperProps = useMemo(() => ({
    id: props.id,
    className: ['incantly-document-editor', props.className].filter(Boolean).join(' '),
    style: props.style,
    'data-incantly-document-editor': '',
    'data-theme': props.theme ?? 'light',
    'data-readonly': !editable ? 'true' : 'false',
  }), [props.id, props.className, props.style, props.theme, editable])

  return (
    <DocumentEditorProvider editor={editor}>
      <div {...wrapperProps}>
        {props.ui === 'formatting' ? <DocumentToolbar /> : null}
        <EditorContent className="incantly-document-editor__content tiptap" editor={editor} />
        {props.ui === 'formatting' ? <><DocumentBubbleToolbar /><DocumentSlashMenu /></> : null}
        {props.children}
      </div>
    </DocumentEditorProvider>
  )
})
