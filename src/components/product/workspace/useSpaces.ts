'use client'

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { newIdempotencyKey } from '../../../lib/api/idempotency'
import { spacesApi, type CreateSpace, type SpaceDto, type UpdateSpace, type UpdateSpaceSource } from '../../../lib/api/spaces'
import type { Page } from '../../../lib/api/types'
import { toSpaceRecord } from './model'

export const spacesKey = (userId: string) => ['spaces', userId] as const
export const spaceNotesKey = (spaceId: string) => ['space-notes', spaceId] as const
export const spaceSourcesKey = (spaceId: string) => ['space-sources', spaceId] as const

/** Every page of a cursor list, for bounded collections the UI shows in full (sidebar, pickers). */
export async function readAllPages<T>(read: (cursor: string | null) => Promise<Page<T>>, maxPages = 20) {
  const items: T[] = []
  let cursor: string | null = null
  for (let page = 0; page < maxPages; page++) {
    const result = await read(cursor)
    items.push(...result.items)
    if (!result.nextCursor) break
    cursor = result.nextCursor
  }
  return items
}

/** All Spaces, active and archived, newest first. */
export function useSpaces(userId: string) {
  const query = useQuery({
    queryKey: spacesKey(userId),
    queryFn: ({ signal }) => readAllPages((cursor) => spacesApi.list({ cursor, limit: 100 }, signal)),
    meta: { silentErrors: true },
  })
  const spaces = useMemo(() => (query.data ?? []).filter((space) => space.status !== 'DELETED').map(toSpaceRecord), [query.data])
  return { ...query, spaces }
}

export function useSpaceNotes(spaceId: string) {
  const query = useInfiniteQuery({
    queryKey: spaceNotesKey(spaceId),
    queryFn: ({ pageParam, signal }) => spacesApi.notes(spaceId, { cursor: pageParam, limit: 50 }, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    meta: { silentErrors: true },
  })
  const notes = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data])
  return { ...query, notes }
}

export function useSpaceSources(spaceId: string, enabled = true) {
  return useQuery({ queryKey: spaceSourcesKey(spaceId), queryFn: ({ signal }) => spacesApi.sources(spaceId, signal), enabled, meta: { silentErrors: true } })
}

/** Space mutations. Each refreshes exactly the lists it can change. */
export function useSpaceActions(userId: string) {
  const client = useQueryClient()
  const setSpace = (space: SpaceDto) => client.setQueryData<SpaceDto[]>(spacesKey(userId), (items) => items?.map((item) => (item.id === space.id ? space : item)))
  const refreshSpaces = () => client.invalidateQueries({ queryKey: spacesKey(userId) })
  const refreshNotes = (spaceId: string) => client.invalidateQueries({ queryKey: spaceNotesKey(spaceId) })
  const refreshSources = (spaceId: string) => Promise.all([client.invalidateQueries({ queryKey: spaceSourcesKey(spaceId) }), client.invalidateQueries({ queryKey: ['library', userId] })])

  const create = useMutation({
    mutationFn: ({ body, key }: { body: CreateSpace; key: string }) => spacesApi.create(body, key),
    meta: { silentErrors: true },
    onSuccess: (space) => { client.setQueryData<SpaceDto[]>(spacesKey(userId), (items) => (items ? [space, ...items.filter((item) => item.id !== space.id)] : [space])); void refreshSpaces() },
  })
  const update = useMutation({
    mutationFn: ({ spaceId, body }: { spaceId: string; body: UpdateSpace }) => spacesApi.update(spaceId, body),
    meta: { silentErrors: true },
    onSuccess: setSpace,
  })
  const archive = useMutation({ mutationFn: spacesApi.archive, onSuccess: setSpace })
  const restore = useMutation({ mutationFn: spacesApi.restore, onSuccess: setSpace })
  const remove = useMutation({
    mutationFn: spacesApi.remove,
    onSuccess: (_result, spaceId) => {
      client.setQueryData<SpaceDto[]>(spacesKey(userId), (items) => items?.filter((item) => item.id !== spaceId))
      client.removeQueries({ queryKey: spaceNotesKey(spaceId) })
      client.removeQueries({ queryKey: spaceSourcesKey(spaceId) })
    },
  })
  const addNote = useMutation({
    mutationFn: ({ spaceId, noteId }: { spaceId: string; noteId: string }) => spacesApi.addNote(spaceId, noteId),
    // A move takes the note out of its old Space (and clears that Space's home pointer): refresh them all.
    onSuccess: () => Promise.all([client.invalidateQueries({ queryKey: ['space-notes'] }), refreshSpaces()]),
  })
  const removeNote = useMutation({
    mutationFn: ({ spaceId, noteId }: { spaceId: string; noteId: string }) => spacesApi.removeNote(spaceId, noteId),
    onSuccess: (_result, { spaceId }) => Promise.all([refreshNotes(spaceId), refreshSpaces()]),
  })
  const setHome = useMutation({
    mutationFn: ({ spaceId, noteId }: { spaceId: string; noteId: string }) => spacesApi.setHomeNote(spaceId, noteId),
    onSuccess: (result) => { client.setQueryData<SpaceDto[]>(spacesKey(userId), (items) => items?.map((item) => (item.id === result.spaceId ? { ...item, homeNoteId: result.homeNoteId } : item))) },
  })
  const clearHome = useMutation({
    mutationFn: (spaceId: string) => spacesApi.clearHomeNote(spaceId),
    onSuccess: (_result, spaceId) => { client.setQueryData<SpaceDto[]>(spacesKey(userId), (items) => items?.map((item) => (item.id === spaceId ? { ...item, homeNoteId: null } : item))) },
  })
  const link = useMutation({
    mutationFn: ({ spaceId, sourceId }: { spaceId: string; sourceId: string }) => spacesApi.linkSource(spaceId, sourceId),
    onSuccess: (_result, { spaceId }) => refreshSources(spaceId),
  })
  const updateLink = useMutation({
    mutationFn: ({ spaceId, sourceId, body }: { spaceId: string; sourceId: string; body: UpdateSpaceSource }) => spacesApi.updateLink(spaceId, sourceId, body),
    onSuccess: (_result, { spaceId }) => refreshSources(spaceId),
  })
  const unlink = useMutation({
    mutationFn: ({ spaceId, sourceId }: { spaceId: string; sourceId: string }) => spacesApi.unlinkSource(spaceId, sourceId),
    onSuccess: (_result, { spaceId }) => refreshSources(spaceId),
  })
  return { create, update, archive, restore, remove, addNote, removeNote, setHome, clearHome, link, updateLink, unlink }
}

/** One key per "Create Space" attempt; a retry of the same request reuses it inside apiFetch. */
export function createSpaceVariables(draft: { name: string; description: string; icon: string }) {
  const body: CreateSpace = { name: draft.name.trim() }
  if (draft.description.trim()) body.description = draft.description.trim()
  if (draft.icon.trim()) body.icon = draft.icon.trim()
  return { body, key: newIdempotencyKey() }
}

/** PATCH body: unchanged fields are left out; a cleared description or icon is sent as '' to clear it. */
export function updateSpaceBody(initial: { name: string; description: string | null; icon: string | null }, draft: { name: string; description: string; icon: string }): UpdateSpace {
  const body: UpdateSpace = {}
  if (draft.name.trim() !== initial.name) body.name = draft.name.trim()
  if (draft.description.trim() !== (initial.description ?? '')) body.description = draft.description.trim()
  if (draft.icon.trim() !== (initial.icon ?? '')) body.icon = draft.icon.trim()
  return body
}
