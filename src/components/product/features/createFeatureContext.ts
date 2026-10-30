import { createContext, useContext, type Context } from 'react'

/**
 * One context per feature, named for React DevTools (`Notes.Provider`, …). The provider lives in
 * `features/<feature>/`; its hook lives in `src/hooks/use-<feature>.ts` and reads it with
 * `useFeatureContext`.
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
