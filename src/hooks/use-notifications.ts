'use client'

import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { useCallback, useMemo, useState } from 'react'
import { createFeatureContext, useFeatureContext } from '@/components/product/features/createFeatureContext'
import { useCurrentUser } from '@/components/product/SessionGate'
import {
  NOTIFICATION_PAGE_SIZE,
  NOTIFICATION_POLL_MS,
  allMarkedRead,
  applyMuteState,
  combinedUnread,
  isGoneNotification,
  isNoteMuted,
  isThreadMuted,
  markedRead,
  notificationAction,
  notificationActorId,
  notificationTarget,
  unreadCount,
  withoutNotification,
} from '@/components/product/workspace/notificationsModel'
import { liveApi } from '@/lib/api/live'
import { notificationsApi, type InboxNotificationDto, type InboxPageDto, type NotificationPreferencesDto } from '@/lib/api/notifications'
import { useNavigation } from '@/hooks/use-navigation'
import { useNotes } from '@/hooks/use-notes'
import { useSharedNotes } from '@/hooks/use-shared-notes'
import { useOnlineStatus } from '@/hooks/use-sharing'

export const inboxKey = (userId: string) => ['notifications-inbox', userId] as const
export const preferencesKey = (userId: string) => ['notification-preferences', userId] as const

type InboxPages = InfiniteData<InboxPageDto, string | null>

/** One inbox row, ready to draw: actor and note names are resolved text, links are IDs. */
export type NotificationRow = {
  id: string
  /** "{actor} {action}" for person rows, the system text otherwise. */
  title: string
  /** The note title (or "Thread on {title}") when the row points at a note. */
  detail: string | null
  noteId: string | null
  threadId: string | null
  createdAt: string
  unread: boolean
  marking: boolean
}

export type NotificationsValue = {
  rows: NotificationRow[]
  /** The bell count: the Incantly unread rows (the Liveblocks half merges here later). */
  unread: number
  online: boolean
  inboxLoading: boolean
  inboxError: unknown
  retryInbox: () => void
  hasMore: boolean
  loadMore: () => void
  loadingMore: boolean
  /** The row with a mark-read in flight, if any. */
  markingId: string | null
  readingAll: boolean
  actionError: string | null
  clearActionError: () => void
  /** Marks one row read. Gone rows drop out instead of erroring. */
  markRead: (row: NotificationRow) => void
  readAll: () => void
  /** Marks the row read (when unread) and navigates: threads deep-link into the comments panel. */
  openRow: (row: NotificationRow) => void
  preferences: NotificationPreferencesDto | null
  prefsLoading: boolean
  prefsError: unknown
  retryPrefs: () => void
  emailEnabledAll: boolean | null
  savingAll: boolean
  setEmailEnabledAll: (enabled: boolean) => void
  noteMuted: (noteId: string) => boolean
  threadMuted: (threadId: string) => boolean
  /** True while any mute toggle is saving. */
  muting: boolean
  toggleNoteMute: (noteId: string) => void
  toggleThreadMute: (noteId: string, threadId: string) => void
  /** Note titles resolved through the cached authorized lists. */
  noteTitle: (noteId: string) => string | null
}

export const NotificationsContext = createFeatureContext<NotificationsValue>('Notifications')

function nowIso() {
  return new Date().toISOString()
}

/**
 * The Incantly notification inbox, email preferences and mutes. Runs once, in
 * `NotificationsProvider`.
 *
 * - The inbox polls on window focus plus a 45 s visible-only interval; the
 *   bell count is the Incantly unread rows until the Liveblocks inbox merges.
 * - Payloads hold IDs only: titles resolve through the cached note lists,
 *   actor names through `POST /v1/liveblocks/users`. Nothing from a payload
 *   ever renders as a title or body.
 */
export function useNotificationsState(): NotificationsValue {
  const user = useCurrentUser()
  const client = useQueryClient()
  const { openNote, openThread, noteSpaceId } = useNavigation()
  const { notes } = useNotes()
  const { shared } = useSharedNotes()
  const online = useOnlineStatus()
  const [actionError, setActionError] = useState<string | null>(null)

  const inbox = useInfiniteQuery({
    queryKey: inboxKey(user.id),
    queryFn: ({ pageParam, signal }) => notificationsApi.inbox({ cursor: pageParam ?? undefined, limit: NOTIFICATION_PAGE_SIZE }, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    // Visible tabs only: the interval pauses in the background, focus refetches.
    refetchInterval: NOTIFICATION_POLL_MS,
    meta: { silentErrors: true },
  })
  const items = useMemo(() => inbox.data?.pages.flatMap((page) => page.items) ?? [], [inbox.data])

  const actorIds = useMemo(() => [...new Set(items.map((item) => notificationActorId(item.payload)).filter((value): value is string => value != null))], [items])
  const actors = useQuery({
    queryKey: ['notification-actors', user.id, ...actorIds] as const,
    queryFn: ({ signal }) => liveApi.resolveUsers(actorIds, signal),
    enabled: actorIds.length > 0,
    staleTime: 5 * 60_000,
    meta: { silentErrors: true },
  })
  const actorNames = useMemo(() => new Map((actors.data ?? []).map((author) => [author.id, author.name] as const)), [actors.data])

  const titles = useMemo(() => {
    const map = new Map<string, string>()
    for (const note of notes) map.set(note.id, note.title || 'Untitled note')
    for (const entry of shared) map.set(entry.note.id, entry.note.title || 'Untitled note')
    return map
  }, [notes, shared])
  const noteTitle = useCallback((noteId: string) => titles.get(noteId) ?? null, [titles])

  const updatePages = useCallback((next: (items: InboxNotificationDto[]) => InboxNotificationDto[]) => {
    client.setQueryData<InboxPages>(inboxKey(user.id), (data) => data && {
      ...data,
      pages: data.pages.map((page) => ({ ...page, items: next(page.items) })),
    })
  }, [client, user.id])

  const markReadMutation = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onMutate: (id) => {
      setActionError(null)
      updatePages((rows) => markedRead(rows, id, nowIso()))
    },
    onError: (error, id) => {
      if (isGoneNotification(error)) updatePages((rows) => withoutNotification(rows, id))
      else {
        updatePages((rows) => rows.map((row) => (row.id === id ? { ...row, readAt: null } : row)))
        setActionError('That notification couldn’t be marked read. Try again.')
      }
    },
    meta: { silentErrors: true },
  })
  const readAllMutation = useMutation({
    mutationFn: () => notificationsApi.readAll(),
    onMutate: () => {
      setActionError(null)
      updatePages((rows) => allMarkedRead(rows, nowIso()))
    },
    onError: () => {
      setActionError('Notifications couldn’t be marked read. Try again.')
      void inbox.refetch()
    },
    onSuccess: () => void inbox.refetch(),
    meta: { silentErrors: true },
  })

  const markRead = useCallback((row: NotificationRow) => {
    if (!row.unread || markReadMutation.isPending) return
    markReadMutation.mutate(row.id)
  }, [markReadMutation])
  const readAll = useCallback(() => {
    if (readAllMutation.isPending) return
    readAllMutation.mutate()
  }, [readAllMutation])
  const openRow = useCallback((row: NotificationRow) => {
    if (row.unread) markRead(row)
    if (row.noteId && row.threadId) openThread(row.noteId, row.threadId, noteSpaceId(row.noteId) ?? undefined)
    else if (row.noteId) openNote(row.noteId, noteSpaceId(row.noteId) ?? undefined)
  }, [markRead, openNote, openThread, noteSpaceId])
  const clearActionError = useCallback(() => setActionError(null), [])

  const prefs = useQuery({
    queryKey: preferencesKey(user.id),
    queryFn: ({ signal }) => notificationsApi.preferences(signal),
    staleTime: NOTIFICATION_POLL_MS,
    meta: { silentErrors: true },
  })

  const masterMutation = useMutation({
    mutationFn: (enabled: boolean) => notificationsApi.updatePreferences({ emailEnabled: enabled }),
    onMutate: (enabled) => {
      setActionError(null)
      client.setQueryData<NotificationPreferencesDto>(preferencesKey(user.id), (data) => data && { ...data, emailEnabledAll: enabled })
    },
    onSuccess: (next) => client.setQueryData(preferencesKey(user.id), next),
    onError: () => {
      setActionError('Email preferences couldn’t be saved. Try again.')
      void prefs.refetch()
    },
    meta: { silentErrors: true },
  })
  const muteMutation = useMutation({
    mutationFn: ({ scope, muted }: { scope: { noteId: string; threadId?: string }; muted: boolean }) =>
      scope.threadId
        ? muted ? notificationsApi.muteThread(scope.noteId, scope.threadId) : notificationsApi.unmuteThread(scope.noteId, scope.threadId)
        : muted ? notificationsApi.muteNote(scope.noteId) : notificationsApi.unmuteNote(scope.noteId),
    onMutate: ({ scope, muted }) => {
      setActionError(null)
      client.setQueryData<NotificationPreferencesDto>(preferencesKey(user.id), (data) =>
        data ? applyMuteState(data, { noteId: scope.noteId, threadId: scope.threadId ?? null, muted }) : data)
    },
    onSuccess: (state) => client.setQueryData<NotificationPreferencesDto>(preferencesKey(user.id), (data) => data ? applyMuteState(data, state) : data),
    onError: () => {
      setActionError('That mute couldn’t be saved. Try again.')
      void prefs.refetch()
    },
    meta: { silentErrors: true },
  })

  const setEmailEnabledAll = useCallback((enabled: boolean) => {
    if (masterMutation.isPending) return
    masterMutation.mutate(enabled)
  }, [masterMutation])
  const toggleNoteMute = useCallback((noteId: string) => {
    if (muteMutation.isPending) return
    muteMutation.mutate({ scope: { noteId }, muted: !isNoteMuted(prefs.data, noteId) })
  }, [muteMutation, prefs.data])
  const toggleThreadMute = useCallback((noteId: string, threadId: string) => {
    if (muteMutation.isPending) return
    muteMutation.mutate({ scope: { noteId, threadId }, muted: !isThreadMuted(prefs.data, threadId) })
  }, [muteMutation, prefs.data])

  return useMemo<NotificationsValue>(() => {
    const markingId = markReadMutation.isPending ? (markReadMutation.variables ?? null) : null
    const rows: NotificationRow[] = items.map((item) => {
      const action = notificationAction(item.type)
      const { noteId, threadId } = notificationTarget(item.payload)
      const title = titles.get(noteId ?? '') ?? (noteId ? 'Untitled note' : null)
      const actor = action.actor === 'person'
        ? (actorNames.get(notificationActorId(item.payload) ?? '')?.trim() || 'Someone')
        : null
      return {
        id: item.id,
        title: actor ? `${actor} ${action.text}` : action.text,
        detail: title ? (threadId ? `Thread on ${title}` : title) : null,
        noteId,
        threadId,
        createdAt: item.createdAt,
        unread: item.readAt == null,
        marking: markingId === item.id,
      }
    })
    return {
      rows,
      unread: combinedUnread(unreadCount(items)),
      online,
      inboxLoading: inbox.isPending,
      inboxError: inbox.isError ? inbox.error : null,
      retryInbox: () => void inbox.refetch(),
      hasMore: inbox.hasNextPage,
      loadMore: () => void inbox.fetchNextPage(),
      loadingMore: inbox.isFetchingNextPage,
      markingId,
      readingAll: readAllMutation.isPending,
      actionError,
      clearActionError,
      markRead,
      readAll,
      openRow,
      preferences: prefs.data ?? null,
      prefsLoading: prefs.isPending,
      prefsError: prefs.isError ? prefs.error : null,
      retryPrefs: () => void prefs.refetch(),
      emailEnabledAll: prefs.data ? prefs.data.emailEnabledAll : null,
      savingAll: masterMutation.isPending,
      setEmailEnabledAll,
      noteMuted: (noteId) => isNoteMuted(prefs.data, noteId),
      threadMuted: (threadId) => isThreadMuted(prefs.data, threadId),
      muting: muteMutation.isPending,
      toggleNoteMute,
      toggleThreadMute,
      noteTitle,
    }
  }, [items, titles, actorNames, online, inbox, markReadMutation, readAllMutation, actionError, clearActionError, markRead, readAll, openRow, prefs, masterMutation, setEmailEnabledAll, muteMutation, toggleNoteMute, toggleThreadMute, noteTitle])
}

/** The notification inbox, preferences and mutes. Must be used inside `WorkspaceProviders`. */
export function useNotifications(): NotificationsValue {
  return useFeatureContext(NotificationsContext)
}
