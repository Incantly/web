import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { Editor } from '@tiptap/core'
import { EditorContext } from '@tiptap/react'

const DocumentEditorContext = createContext<Editor | null>(null)

export interface DocumentEditorProviderProps {
  editor: Editor | null
  children: ReactNode
}

/**
 * Shares the editor with app components (`useDocumentEditor`) and with the stock Tiptap UI
 * (`useCurrentEditor`, e.g. the table handles and extend buttons), which reads Tiptap's own context.
 */
export function DocumentEditorProvider({ editor, children }: DocumentEditorProviderProps) {
  // The instance comes from `useEditor` in @tiptap/react; core's type is the shared supertype.
  const tiptap = useMemo(() => ({ editor: editor as React.ContextType<typeof EditorContext>['editor'] }), [editor])
  return <DocumentEditorContext.Provider value={editor}>
    <EditorContext.Provider value={tiptap}>{children}</EditorContext.Provider>
  </DocumentEditorContext.Provider>
}

export function useDocumentEditor(): Editor | null {
  return useContext(DocumentEditorContext)
}
