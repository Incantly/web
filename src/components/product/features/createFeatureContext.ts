import { createContext, useContext, type Context } from 'react'

/**
 * One context per feature, named for React DevTools (`Notes.Provider`, …). It lives in the feature's
 * hook file, `src/hooks/use-<feature>.ts`, beside the logic (`use<Feature>State`) and the reader
 * (`use<Feature>`, via `useFeatureContext`). The provider in `features/<feature>/` shares it.
 *
 *   export const NotesContext = createFeatureContext<NotesValue>('Notes')
 */
export function createFeatureContext<T>(name: string): Context<T | null> {
  const context = createContext<T | null>(null)
  context.displayName = name
  return context
}

/** Reads a feature context, and fails loudly when its provider is missing instead of rendering empty state. */
export function useFeatureContext<T>(context: Context<T | null>): T {
  const value = useContext(context)
  if (value === null) throw new Error(`${context.displayName ?? 'Feature'} hook used outside <${context.displayName ?? 'Feature'}Provider>`)
  return value
}
