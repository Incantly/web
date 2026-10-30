import { createContext, useContext } from 'react'

/**
 * One context per feature. The context is named for React DevTools (`Notes.Provider`, …), and its hook
 * throws when used outside the provider, so a missing provider fails loudly instead of rendering
 * empty state.
 *
 *   const [NotesContext, useNotes] = createFeatureContext<NotesValue>('Notes')
 */
export function createFeatureContext<T>(name: string) {
  const Context = createContext<T | null>(null)
  Context.displayName = name
  function useFeature(): T {
    const value = useContext(Context)
    if (value === null) throw new Error(`use${name}() must be used inside <${name}Provider>`)
    return value
  }
  return [Context, useFeature] as const
}
