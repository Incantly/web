import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type AriaAttributes,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { Editor, type FocusPosition } from '@tiptap/core'
import { EditorContent, useEditor } from '@tiptap/react'
import { isChangeOrigin } from '@tiptap/extension-collaboration'
import { flushFigures } from '@incantly/tiptap'
import { EditorState, type Transaction } from '@tiptap/pm/state'
import {
  createDocument,
  recoverDocument,
  validateDocument,
  type DocumentValidationIssue,
  type IncantlyDocument,
} from '@incantly/canvas-core/document'
import { incantlyDocumentToProseMirror, type DocumentAdapterIssue } from './conversion'
import { hydrateFigures } from './figures'
import type { YjsNoteBinding } from './yjsBinding'
import { createIncantlyDocumentExtensions } from './schema/index'
import { DocumentEditorProvider } from './DocumentEditorContext'
import { DocumentBubbleToolbar, DocumentSlashMenu, DocumentToolbar } from './components/FormattingUI'
import '@/components/tiptap-node/table-node/styles/prosemirror-table.scss'
import '@/components/tiptap-node/table-node/styles/table-node.scss'
import {
  DocumentCheckpointTracker,
  mapProseMirrorTransaction,
  setIncantlyTransactionMeta,
  type CanonicalDocumentChangeEvent,
  type DocumentHistoryAction,
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
  /**
   * Yjs realtime binding (migration Phase 1). Present only on `yjs`-flagged
   * notes; the legacy path passes nothing and behaves exactly as before.
   * Fixed per mount: the host remounts when the binding appears or drops.
   */
  collaboration?: YjsNoteBinding
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

/** A Tiptap raw command: keyboard, chain, direct, and can() calls all funnel through these. */
type RawEditorCommand = (...args: unknown[]) => (props: unknown) => boolean

/** Marks wrapped raw commands so the ready effect never double-wraps. */
const YJS_HISTORY_WRAPPED = 'incantlyYjsHistoryWrapped'

/**
 * Flags local Yjs undo/redo so onTransaction persists it. The Collaboration
 * extension owns history on bound editors: its undo/redo commands mutate
 * Y.Doc and the change converges back as a Y-origin transaction,
 * indistinguishable from a peer's remote change. Without the flag the
 * onChange gate skips it and the undo is silently never persisted — nobody
 * submits it — while the canonical ref advances past the saved document.
 *
 * `editor.commands` is a getter returning fresh objects per access (and
 * `chain()` resolves separately), so wrapping it would be a silent no-op;
 * the wrap lives on the command manager's raw commands instead, which every
 * path derives from. The Yjs observer dispatch is fully synchronous, so the
 * try/finally flag covers the resulting transaction. `commandManager` is
 * private in the Tiptap types, hence the structural read (verified against
 * the pinned 3.32.0 dists).
 */
function wrapYjsHistoryCommands(editor: Editor, flag: { current: DocumentHistoryAction | null }): void {
  const rawCommands = (editor as unknown as { commandManager?: { rawCommands?: Record<string, unknown> } | null })
    .commandManager?.rawCommands
  if (!rawCommands) return
  for (const [name, action] of [['undo', 'undo'], ['redo', 'redo']] as const) {
    const original = rawCommands[name]
    if (typeof original !== 'function' || (original as unknown as Record<string, unknown>)[YJS_HISTORY_WRAPPED]) continue
    const wrapped = (...args: unknown[]) => (props: unknown) => {
      const previous = flag.current
      flag.current = action
      try {
        return (original as RawEditorCommand)(...args)(props)
      } finally {
        flag.current = previous
      }
    }
    const marked = wrapped as RawEditorCommand & Record<string, unknown>
    marked[YJS_HISTORY_WRAPPED] = true
    rawCommands[name] = marked
  }
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
  // Local Yjs history in flight (set only while bound; legacy editors never flag).
  const yjsHistoryActionRef = useRef<DocumentHistoryAction | null>(null)
  const checkpointTrackerRef = useRef(new DocumentCheckpointTracker())
  const apiRef = useRef<DocumentEditorRef | null>(null)
  const readyEditorRef = useRef<Editor | null>(null)
  const placeholderRef = useRef(props.placeholder ?? 'Start writing…')
  placeholderRef.current = props.placeholder ?? 'Start writing…'
  const collaborationRef = useRef(props.collaboration ?? null)
  collaborationRef.current = props.collaboration ?? null
  // Pre-seed typing hold: a bound editor renders room state the seed has not
  // converged yet, so keystrokes would map against the checkpoint ref from a
  // diverged base. Releases when the first seed settles; legacy editors never hold.
  const [seedHold, setSeedHold] = useState(props.collaboration != null)
  const extensionsRef = useRef(createIncantlyDocumentExtensions({
    placeholder: () => placeholderRef.current,
    collaboration: props.collaboration ? { document: props.collaboration.doc, field: props.collaboration.field } : undefined,
  }))

  const editable = props.readonly === true || seedHold ? false : props.editable ?? true
  const initialEditableRef = useRef(editable)
  const initialAutofocusRef = useRef(props.autofocus ?? false)

  const editor = useEditor({
    extensions: extensionsRef.current,
    // A Yjs-bound editor renders the shared fragment (seeded from the
    // checkpoint on ready); initial content would fight the binding.
    content: props.collaboration ? undefined : incantlyDocumentToProseMirror(initialRef.current.document).value,
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
        // Local Yjs undo/redo converges through Y.Doc like a remote change but
        // must persist through noteSync: nobody else submits it. Stamp history
        // meta before mapping so the checkpoint policy treats it as history.
        const yjsHistoryAction = collaborationRef.current != null ? yjsHistoryActionRef.current : null
        if (yjsHistoryAction) setIncantlyTransactionMeta(transaction, { origin: 'user', historyAction: yjsHistoryAction })
        const event = mapProseMirrorTransaction({
          document: currentDocumentRef.current,
          transaction,
          checkpointTracker: checkpointTrackerRef.current,
        })
        if (event.mode !== 'none') currentDocumentRef.current = event.document
        callbacksRef.current.onTransaction?.(event, transaction, activeEditor)
        if (event.adapterReport?.issues.length)
          callbacksRef.current.onValidationIssue?.(event.adapterReport.issues, activeEditor)
        // Yjs-originated transactions already converged from a peer who
        // submitted them through their own noteSync: they advance the canonical
        // document but never record, or every keystroke would save twice.
        // Local history (flagged above) is the exception: it only exists here.
        const yjsRemote = collaborationRef.current != null && isChangeOrigin(transaction) && yjsHistoryAction == null
        if (event.mode !== 'none' && !yjsRemote) callbacksRef.current.onChange?.(event.document, event, activeEditor)
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
      getDocument() {
        const activeEditor = liveEditor()
        // The SDK contract: learner values and teaching position pending in figure node views
        // are written to the nodes before the document is read.
        if (activeEditor) flushFigures(activeEditor)
        return activeEditor ? cloneDocument(currentDocumentRef.current) : null
      },
      replaceDocument(document: IncantlyDocument, options: ReplaceDocumentOptions = {}) {
        const activeEditor = liveEditor()
        if (!activeEditor) return false
        try {
          const prepared = prepareDocument(document)
          suppressTransactionsRef.current = true
          // A Yjs-bound editor replaces through the shared fragment (the
          // binding renders it back); recreating EditorState would orphan it.
          const binding = collaborationRef.current
          if (binding) binding.reseed(prepared.document)
          else replaceEditorDocument(activeEditor, prepared.document)
          currentDocumentRef.current = prepared.document
          checkpointTrackerRef.current.markCheckpoint()
          void hydrateFigures(activeEditor).catch(() => undefined)
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
    const binding = collaborationRef.current
    if (binding) {
      binding.setCurrentDocumentSource(() => (!editor.isDestroyed ? currentDocumentRef.current : null))
      // Flag local undo/redo so the onChange gate records it (without this it
      // converges like a remote change and is silently never persisted).
      wrapYjsHistoryCommands(editor, yjsHistoryActionRef)
      // Seed from the server checkpoint the loader already gated (joiners with
      // room state keep it; mounts over a stale fragment re-converge to it).
      // The typing hold releases on settle either way: a failed seed reports
      // through onError and editing continues against the checkpoint ref.
      const controller = new AbortController()
      void binding.seedWhenSynced(editor.schema, currentDocumentRef.current, { signal: controller.signal }).then(
        () => { setSeedHold(false) },
        (error: unknown) => { setSeedHold(false); if (!(error instanceof DOMException && error.name === 'AbortError')) reportError(error, 'initialization') },
      )
      callbacksRef.current.onReady?.(editor, apiRef.current)
      void hydrateFigures(editor).catch(() => undefined)
      return () => controller.abort()
    }
    callbacksRef.current.onReady?.(editor, apiRef.current)
    void hydrateFigures(editor).catch(() => undefined)
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
      const binding = collaborationRef.current
      if (binding) binding.reseed(prepared.document)
      else replaceEditorDocument(editor, prepared.document)
      currentDocumentRef.current = prepared.document
      checkpointTrackerRef.current.markCheckpoint()
      void hydrateFigures(editor).catch(() => undefined)
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
