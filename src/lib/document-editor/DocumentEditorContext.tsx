import { createContext, useContext, type ReactNode } from 'react'
import type { Editor } from '@tiptap/core'

const DocumentEditorContext = createContext<Editor | null>(null)

export interface DocumentEditorProviderProps {
  editor: Editor | null
  children: ReactNode
}

export function DocumentEditorProvider({ editor, children }: DocumentEditorProviderProps) {
  return <DocumentEditorContext.Provider value={editor}>{children}</DocumentEditorContext.Provider>
}

export function useDocumentEditor(): Editor | null {
  return useContext(DocumentEditorContext)
}
