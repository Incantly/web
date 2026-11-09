import type { QueryClient } from '@tanstack/react-query'
import { liveApi, type LiveStatusDto } from '../api/live'
import { notesApi, type NoteCheckpoint, type NoteDto } from '../api/notes'

/**
 * One cache for the reads that open a note: its metadata, its head checkpoint and (shared
 * notes) its live-status. A note open, the remount when its write path is decided, hover
 * prefetch and list preloading all go through here, so each open sends each request once.
 * Keys carry the user ID, so another account in the same page never reads these bodies.
 * Cached checkpoints are untrusted: every reader still runs them through the load gate.
 */
export const noteOpenKey = (userId: string, noteId: string) => ['note-open', userId, noteId] as const
export const noteMetadataKey = (userId: string, noteId: string) => [...noteOpenKey(userId, noteId), 'metadata'] as const
export const noteCheckpointKey = (userId: string, noteId: string) => [...noteOpenKey(userId, noteId), 'checkpoint'] as const
export const noteLiveStatusKey = (userId: string, noteId: string) => [...noteOpenKey(userId, noteId), 'live-status'] as const

/** An open adopts a read made this recently (a hover prefetch, or the other mount of the same open) instead of sending it again. */
export const NOTE_OPEN_REUSE_MS = 5_000
/** A prefetch is not repeated while its result is this fresh; older results are still shown instantly, then re-read. */
export const NOTE_PREFETCH_FRESH_MS = 30_000
/** Note bodies leave memory this long after no screen or prefetch uses them. */
export const NOTE_OPEN_GC_MS = 5 * 60_000
/** A join adopts a live-status this recent (from hover); pause rechecks always read it fresh. */
export const LIVE_STATUS_REUSE_MS = 10_000

export type CachedCheckpoint = NoteCheckpoint & { etag: string | null }

const metadataQuery = (userId: string, noteId: string) => ({
  queryKey: noteMetadataKey(userId, noteId),
  queryFn: ({ signal }: { signal: AbortSignal }) => notesApi.get(noteId, signal),
  gcTime: NOTE_OPEN_GC_MS,
  retry: false,
  meta: { silentErrors: true },
})

const checkpointQuery = (userId: string, noteId: string) => ({
  queryKey: noteCheckpointKey(userId, noteId),
  queryFn: ({ signal }: { signal: AbortSignal }): Promise<CachedCheckpoint> => notesApi.checkpoint(noteId, signal),
  gcTime: NOTE_OPEN_GC_MS,
  retry: false,
  meta: { silentErrors: true },
})

const liveStatusQuery = (userId: string, noteId: string) => ({
  queryKey: noteLiveStatusKey(userId, noteId),
  queryFn: ({ signal }: { signal: AbortSignal }) => liveApi.liveStatus(noteId, signal),
  gcTime: NOTE_OPEN_GC_MS,
  retry: false,
  meta: { silentErrors: true },
})

/**
 * The highest revision this tab saw acknowledged per note (`userId:noteId`). A cached
 * checkpoint below it is never shown or reused: it predates this tab's own saved edits.
 */
const ackedFloor = new Map<string, number>()
const floorKey = (userId: string, noteId: string) => `${userId}:${noteId}`

/** This tab's edits reached `revision` (a legacy ack, a live save-now): older cached reads of the note go. */
export function acknowledgeNoteRevision(client: QueryClient, userId: string, noteId: string, revision: number) {
  const key = floorKey(userId, noteId)
  ackedFloor.set(key, Math.max(ackedFloor.get(key) ?? 0, revision))
  const cached = client.getQueryData<CachedCheckpoint>(noteCheckpointKey(userId, noteId))
  if (cached && cached.revision.revisionNumber < revision) forgetNoteOpen(client, userId, noteId)
}

/** Drops every cached open read of a note (after this tab wrote to it, or the server sent a document that failed the gate). */
export function forgetNoteOpen(client: QueryClient, userId: string, noteId: string) {
  client.removeQueries({ queryKey: noteOpenKey(userId, noteId) })
}

/** True when a cached checkpoint is older than what this tab already saw acknowledged. */
function belowFloor(userId: string, noteId: string, checkpoint: CachedCheckpoint): boolean {
  return checkpoint.revision.revisionNumber < (ackedFloor.get(floorKey(userId, noteId)) ?? 0)
}

/** The open's authoritative reads: shared with an in-flight or very recent read of the same note. */
export function loadNoteForOpen(client: QueryClient, userId: string, noteId: string): Promise<[NoteDto, CachedCheckpoint]> {
  const cached = client.getQueryData<CachedCheckpoint>(noteCheckpointKey(userId, noteId))
  if (cached && belowFloor(userId, noteId, cached)) forgetNoteOpen(client, userId, noteId)
  return Promise.all([
    client.fetchQuery({ ...metadataQuery(userId, noteId), staleTime: NOTE_OPEN_REUSE_MS }),
    client.fetchQuery({ ...checkpointQuery(userId, noteId), staleTime: NOTE_OPEN_REUSE_MS }),
  ])
}

/** Warms metadata and checkpoint (preload, hover, focus). Errors stay silent; the open reports its own. */
export function prefetchNoteForOpen(client: QueryClient, userId: string, noteId: string): Promise<void> {
  return Promise.all([
    client.prefetchQuery({ ...metadataQuery(userId, noteId), staleTime: NOTE_PREFETCH_FRESH_MS }),
    client.prefetchQuery({ ...checkpointQuery(userId, noteId), staleTime: NOTE_PREFETCH_FRESH_MS }),
  ]).then(() => undefined)
}

/** The head checkpoint already in memory, if any (any age: it only feeds the instant read-only view). */
export function cachedCheckpoint(client: QueryClient, userId: string, noteId: string): CachedCheckpoint | null {
  const cached = client.getQueryData<CachedCheckpoint>(noteCheckpointKey(userId, noteId)) ?? null
  return cached && !belowFloor(userId, noteId, cached) ? cached : null
}

/** A newer head read elsewhere (server head applied, restore) replaces the cached one. */
export function rememberCheckpoint(client: QueryClient, userId: string, noteId: string, checkpoint: CachedCheckpoint) {
  if (belowFloor(userId, noteId, checkpoint)) return
  const current = cachedCheckpoint(client, userId, noteId)
  if (current && current.revision.revisionNumber > checkpoint.revision.revisionNumber) return
  client.setQueryData(noteCheckpointKey(userId, noteId), checkpoint)
}

/** Live-status for hover or focus: reuses one younger than `LIVE_STATUS_REUSE_MS`, otherwise reads it. */
export function readLiveStatusForIntent(client: QueryClient, userId: string, noteId: string): Promise<LiveStatusDto> {
  return client.fetchQuery({ ...liveStatusQuery(userId, noteId), staleTime: LIVE_STATUS_REUSE_MS })
}

/** Live-status for a join, always read now (sharing a read already in flight); it refreshes the cache. */
export function readFreshLiveStatus(client: QueryClient, userId: string, noteId: string): Promise<LiveStatusDto> {
  return client.fetchQuery({ ...liveStatusQuery(userId, noteId), staleTime: 0 })
}

/** A live-status younger than `LIVE_STATUS_REUSE_MS`, read synchronously (null when absent or older). */
export function freshLiveStatus(client: QueryClient, userId: string, noteId: string): LiveStatusDto | null {
  const state = client.getQueryState<LiveStatusDto>(noteLiveStatusKey(userId, noteId))
  if (!state?.data || Date.now() - state.dataUpdatedAt > LIVE_STATUS_REUSE_MS) return null
  return state.data
}

/** Drops every cached live-status (a retry re-reads it from the server). */
export function forgetLiveStatuses(client: QueryClient) {
  client.removeQueries({ predicate: (query) => query.queryKey[0] === 'note-open' && query.queryKey[3] === 'live-status' })
}

/** The page's query clients (normally one), so sign-out can drop note bodies held in memory. */
const registeredClients = new Set<QueryClient>()

/** Called once by the app's provider; returns the unregister. */
export function registerNoteQueryClient(client: QueryClient): () => void {
  registeredClients.add(client)
  return () => { registeredClients.delete(client) }
}

/** Query roots that hold note bodies, titles or lists. */
const NOTE_QUERY_ROOTS = new Set(['note-open', 'notes', 'note-revisions', 'notes-trash', 'notes-shared-with-me', 'space-notes'])

/** Sign-out: removes every note query (open cache, lists, history) from every registered client. */
export function clearNoteQueryCaches() {
  ackedFloor.clear()
  for (const client of registeredClients) {
    void client.cancelQueries({ predicate: (query) => NOTE_QUERY_ROOTS.has(String(query.queryKey[0])) })
    client.removeQueries({ predicate: (query) => NOTE_QUERY_ROOTS.has(String(query.queryKey[0])) })
  }
}
