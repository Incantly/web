'use client'

import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { useMemo } from 'react'
import { notesApi, type NoteDto, type TrashNoteDto } from '../../../lib/api/notes'
import { newIdempotencyKey } from '../../../lib/api/idempotency'
import type { Page } from '../../../lib/api/types'

export const notesKey = (userId: string) => ['notes', userId] as const
export const revisionsKey = (noteId: string) => ['note-revisions', noteId] as const
export const trashKey = (userId: string) => ['notes-trash', userId] as const
export const sharedWithMeKey = (userId: string) => ['notes-shared-with-me', userId] as const

type NotesPages = InfiniteData<Page<NoteDto>, string | null>
type TrashPages = InfiniteData<Page<TrashNoteDto>, string | null>

/** All notes, newest first, with cursor paging (`GET /v1/notes`). */
export function useNotesList(userId: string) {
  const query = useInfiniteQuery({
    queryKey: notesKey(userId),
    queryFn: ({ pageParam, signal }) => notesApi.list({ cursor: pageParam, limit: 25 }, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    meta: { silentErrors: true },
  })
  const notes = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data])
  return { ...query, notes }
}

/** Updates or removes one note in the cached list without refetching every page. */
export function useNotesCache(userId: string) {
  const client = useQueryClient()
  return useMemo(() => ({
    upsert(note: Partial<NoteDto> & { id: string }) {
      client.setQueryData<NotesPages>(notesKey(userId), (data) => {
        if (!data) return data
        const exists = data.pages.some((page) => page.items.some((item) => item.id === note.id))
        if (!exists) return { ...data, pages: data.pages.map((page, index) => (index === 0 ? { ...page, items: [note as NoteDto, ...page.items] } : page)) }
        return { ...data, pages: data.pages.map((page) => ({ ...page, items: page.items.map((item) => (item.id === note.id ? { ...item, ...note } : item)) })) }
      })
    },
    remove(noteId: string) {
      client.setQueryData<NotesPages>(notesKey(userId), (data) => data && { ...data, pages: data.pages.map((page) => ({ ...page, items: page.items.filter((item) => item.id !== noteId) })) })
    },
  }), [client, userId])
}

/** `POST /v1/notes` with one idempotency key per click, reused if the request is retried. */
export function useCreateNote(userId: string) {
  const cache = useNotesCache(userId)
  return useMutation({
    mutationFn: ({ title, key }: { title: string; key: string }) => notesApi.create(title, key),
    onSuccess: (note) => cache.upsert(note),
  })
}

export function createNoteVariables(title = 'Untitled note') {
  return { title: title.trim().slice(0, 300) || 'Untitled note', key: newIdempotencyKey() }
}

export function useDeleteNote(userId: string) {
  const cache = useNotesCache(userId)
  return useMutation({
    mutationFn: (noteId: string) => notesApi.remove(noteId),
    onSuccess: (_result, noteId) => cache.remove(noteId),
  })
}

export function useRevisions(noteId: string, enabled: boolean) {
  return useQuery({ queryKey: revisionsKey(noteId), queryFn: ({ signal }) => notesApi.revisions(noteId, signal), enabled, meta: { silentErrors: true } })
}

/** The owner's trash, newest first (`GET /v1/notes/trash`). */
export function useTrashList(userId: string) {
  const query = useInfiniteQuery({
    queryKey: trashKey(userId),
    queryFn: ({ pageParam, signal }) => notesApi.trash({ cursor: pageParam, limit: 25 }, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    meta: { silentErrors: true },
  })
  const trashed = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data])
  return { ...query, trashed }
}

/** Removes one note from the cached trash without refetching every page. */
export function useTrashCache(userId: string) {
  const client = useQueryClient()
  return useMemo(() => ({
    remove(noteId: string) {
      client.setQueryData<TrashPages>(trashKey(userId), (data) => data && { ...data, pages: data.pages.map((page) => ({ ...page, items: page.items.filter((item) => item.id !== noteId) })) })
    },
  }), [client, userId])
}

/**
 * Bodyless trash restore (`POST /v1/notes/{id}/restore`). On success the note is back in the
 * notes cache and out of the trash cache; list queries refetch so counts and Spaces catch up.
 * Errors stay local (the Trash view renders them) instead of toasting.
 */
export function useRestoreTrashNote(userId: string) {
  const client = useQueryClient()
  const notes = useNotesCache(userId)
  const trash = useTrashCache(userId)
  return useMutation({
    mutationFn: (noteId: string) => notesApi.restoreTrash(noteId),
    onSuccess: (note, noteId) => {
      notes.upsert(note)
      trash.remove(noteId)
      void client.invalidateQueries({ queryKey: notesKey(userId) })
      void client.invalidateQueries({ queryKey: trashKey(userId) })
      void client.invalidateQueries({ queryKey: ['space-notes'] })
    },
    meta: { silentErrors: true },
  })
}

/** Notes others shared with the caller, newest first (`GET /v1/notes/shared-with-me`). */
export function useSharedWithMeList(userId: string) {
  const query = useInfiniteQuery({
    queryKey: sharedWithMeKey(userId),
    queryFn: ({ pageParam, signal }) => notesApi.sharedWithMe({ cursor: pageParam, limit: 25 }, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    meta: { silentErrors: true },
  })
  const shared = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data])
  return { ...query, shared }
}
