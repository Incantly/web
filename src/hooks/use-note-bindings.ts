'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, useState } from 'react'
import { createFeatureContext, useFeatureContext } from '@/components/product/features/createFeatureContext'
import { bindingBody, defaultBinding, type BindingChange } from '@/components/product/workspace/bindingModel'
import type { ListStatus } from '@/components/product/workspace/views'
import { bindingsApi, type ContextBindingDto, type ContextBindingList, type UpsertContextBinding } from '@/lib/api/bindings'
import { apiErrorMessage } from '@/lib/api/errors'
import { useNavigation } from '@/hooks/use-navigation'

export type NoteBindingsValue = {
  /** The open note the bindings belong to. */
  noteId: string | null
  bindings: ContextBindingDto[]
  /** Most bindings a note can have (50). */
  limit: number
  status: ListStatus
  /** Attach a Library source: used when relevant, following its latest version. */
  bind: (sourceId: string) => void
  /** Change how a bound source is used or which version it keeps. */
  change: (binding: ContextBindingDto, change: BindingChange) => void
  unbind: (sourceId: string) => void
  /** The source a change is being saved for, if any. */
  savingSourceId: string | null
  /** Why the last change failed, in plain words. */
  error: string | null
  clearError: () => void
}

export const NoteBindingsContext = createFeatureContext<NoteBindingsValue>('NoteBindings')

export const noteBindingsKey = (noteId: string) => ['note-bindings', noteId] as const

/**
 * `/v1/notes/:noteId/context-bindings`: the Library sources the open note relies on. Runs once, in
 * `NoteBindingsProvider`.
 */
export function useNoteBindingsState(): NoteBindingsValue {
  const client = useQueryClient()
  const { activeNoteId: noteId } = useNavigation()
  const [error, setError] = useState<string | null>(null)
  const query = useQuery({
    queryKey: noteBindingsKey(noteId ?? ''),
    queryFn: ({ signal }) => bindingsApi.list(noteId!, signal),
    enabled: Boolean(noteId),
    meta: { silentErrors: true },
  })
  const { data, isPending, isError, error: loadError, refetch } = query

  const setList = (target: string, update: (items: ContextBindingDto[]) => ContextBindingDto[]) =>
    client.setQueryData<ContextBindingList>(noteBindingsKey(target), (list) => (list ? { ...list, items: update(list.items) } : list))

  const put = useMutation({
    mutationFn: ({ target, sourceId, body }: { target: string; sourceId: string; body: UpsertContextBinding }) => bindingsApi.put(target, sourceId, body),
    meta: { silentErrors: true },
    onMutate: () => setError(null),
    onSuccess: ({ binding }, { target }) => setList(target, (items) => (items.some((item) => item.sourceId === binding.sourceId) ? items.map((item) => (item.sourceId === binding.sourceId ? binding : item)) : [...items, binding])),
    onError: (failure) => setError(apiErrorMessage(failure)),
  })
  const remove = useMutation({
    mutationFn: ({ target, sourceId }: { target: string; sourceId: string }) => bindingsApi.remove(target, sourceId),
    meta: { silentErrors: true },
    onMutate: () => setError(null),
    onSuccess: (_result, { target, sourceId }) => setList(target, (items) => items.filter((item) => item.sourceId !== sourceId)),
    onError: (failure) => setError(apiErrorMessage(failure)),
  })
  const { mutate: save } = put
  const { mutate: drop } = remove

  const bind = useCallback((sourceId: string) => { if (noteId) save({ target: noteId, sourceId, body: defaultBinding }) }, [noteId, save])
  const change = useCallback((binding: ContextBindingDto, next: BindingChange) => {
    const body = bindingBody(binding, next)
    if ('error' in body) { setError(body.error); return }
    save({ target: binding.noteId, sourceId: binding.sourceId, body })
  }, [save])
  const unbind = useCallback((sourceId: string) => { if (noteId) drop({ target: noteId, sourceId }) }, [noteId, drop])

  const savingSourceId = put.isPending ? put.variables.sourceId : remove.isPending ? remove.variables.sourceId : null

  return useMemo<NoteBindingsValue>(() => ({
    noteId,
    bindings: data?.items ?? [],
    limit: data?.limit ?? 50,
    status: { loading: Boolean(noteId) && isPending, error: isError ? loadError : null, retry: () => void refetch() },
    bind,
    change,
    unbind,
    savingSourceId,
    error,
    clearError: () => setError(null),
  }), [noteId, data, isPending, isError, loadError, refetch, bind, change, unbind, savingSourceId, error])
}

/** The open note's attached Library sources, and attaching, changing and removing them. Must be used inside `WorkspaceProviders`. */
export function useNoteBindings(): NoteBindingsValue {
  return useFeatureContext(NoteBindingsContext)
}
