'use client'

import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { newIdempotencyKey } from '../../../lib/api/idempotency'
import { libraryApi, type CreateSource, type SourceDto, type UpdateSource } from '../../../lib/api/library'
import { spacesApi } from '../../../lib/api/spaces'
import { uploadAsset } from '../../../lib/assets/upload'
import { toSourceRecord, type SourceRecord, type SpaceRecord } from './model'
import type { AddSourceInput } from './sourceInput'
import { isProcessing, pollDelay, processingSettled } from './sourceStatus'
import { readAllPages, spaceSourcesKey } from './useSpaces'

export const libraryKey = (userId: string) => ['library', userId] as const
export const sourceKey = (sourceId: string) => ['source', sourceId] as const
export const processingKey = (sourceId: string) => ['source-processing', sourceId] as const

/**
 * The whole Library (cursor-paged, newest first). Filters apply over this list: the API's
 * `status` filter takes one status, while the UI groups two (e.g. Ready + Partly ready).
 * While anything is still processing, the list refreshes with backoff.
 */
export function useLibrarySources(userId: string) {
  const query = useQuery({
    queryKey: libraryKey(userId),
    queryFn: ({ signal }) => readAllPages((cursor) => libraryApi.list({ cursor, limit: 100 }, signal)),
    meta: { silentErrors: true },
    refetchInterval: (state) => (state.state.data?.some((source) => isProcessing(source.status, source.versions[0]?.processingStage)) ? pollDelay(Math.min(state.state.dataUpdateCount, 6)) + 2000 : false),
  })
  const sources = useMemo(() => (query.data ?? []).filter((source) => source.status !== 'DELETED').map(toSourceRecord), [query.data])
  return { ...query, sources }
}

/** One Source with up to 25 versions (for the detail drawer). */
export function useSource(sourceId: string | null) {
  return useQuery({ queryKey: sourceKey(sourceId ?? ''), queryFn: ({ signal }) => libraryApi.get(sourceId!, signal), enabled: Boolean(sourceId), meta: { silentErrors: true } })
}

/** Live processing state, polled 1 s → 5 s until it settles. */
export function useSourceProcessing(sourceId: string | null) {
  return useQuery({
    queryKey: processingKey(sourceId ?? ''),
    queryFn: ({ signal }) => libraryApi.processing(sourceId!, signal),
    enabled: Boolean(sourceId),
    meta: { silentErrors: true },
    refetchInterval: (state) => (state.state.data && !processingSettled(state.state.data) ? pollDelay(state.state.dataUpdateCount) : false),
  })
}

/** Which Spaces link a Source, read from each active Space's link list (bounded to 200 links). */
export function useSourceSpaces(sourceId: string | null, spaces: SpaceRecord[]) {
  const results = useQueries({
    queries: spaces.slice(0, 50).map((space) => ({ queryKey: spaceSourcesKey(space.id), queryFn: ({ signal }: { signal: AbortSignal }) => spacesApi.sources(space.id, signal), enabled: Boolean(sourceId), meta: { silentErrors: true } })),
  })
  return spaces.slice(0, 50).filter((_space, index) => results[index].data?.items.some((link) => link.sourceId === sourceId))
}

export function useLibraryActions(userId: string) {
  const client = useQueryClient()
  const refresh = (sourceId?: string) => Promise.all([
    client.invalidateQueries({ queryKey: libraryKey(userId) }),
    client.invalidateQueries({ queryKey: ['space-sources'] }),
    ...(sourceId ? [client.invalidateQueries({ queryKey: sourceKey(sourceId) }), client.invalidateQueries({ queryKey: processingKey(sourceId) })] : []),
  ])
  const put = (source: SourceDto) => {
    client.setQueryData<SourceDto[]>(libraryKey(userId), (items) => items?.map((item) => (item.id === source.id ? { ...item, ...source, versions: source.versions.length ? source.versions : item.versions } : item)))
    client.setQueryData(sourceKey(source.id), source)
  }
  const update = useMutation({ mutationFn: ({ sourceId, body }: { sourceId: string; body: UpdateSource }) => libraryApi.update(sourceId, body), onSuccess: put })
  const archive = useMutation({ mutationFn: libraryApi.archive, onSuccess: (source) => { put(source); void refresh(source.id) } })
  const restore = useMutation({ mutationFn: libraryApi.restore, onSuccess: (source) => { put(source); void refresh(source.id) } })
  const remove = useMutation({
    mutationFn: libraryApi.remove,
    onSuccess: (_result, sourceId) => {
      client.setQueryData<SourceDto[]>(libraryKey(userId), (items) => items?.filter((item) => item.id !== sourceId))
      void client.invalidateQueries({ queryKey: ['space-sources'] })
    },
  })
  const retry = useMutation({ mutationFn: libraryApi.retry, onSuccess: (state, sourceId) => { client.setQueryData(processingKey(sourceId), state); void refresh(sourceId) } })
  const cancel = useMutation({ mutationFn: libraryApi.cancel, onSuccess: (state, sourceId) => { client.setQueryData(processingKey(sourceId), state); void refresh(sourceId) } })
  return { update, archive, restore, remove, retry, cancel, refresh }
}

export type AddProgress = { phase: 'uploading'; loaded: number; total: number } | { phase: 'adding' }

/**
 * "Add to Library": uploads the file first when the kind needs one (no cookies on the storage
 * request), then creates the Source with one idempotency key. Re-adding the same Asset or note
 * revision returns the existing Source, which counts as success.
 */
export async function addSourceToLibrary(input: AddSourceInput, notes: { id: string; currentRevisionId: string | null }[], options: { signal?: AbortSignal; onProgress?: (progress: AddProgress) => void } = {}): Promise<SourceRecord> {
  const body: CreateSource = { kind: input.kind, title: input.title || 'Untitled source', sensitivity: input.sensitivity }
  if (input.spaceIds.length) body.spaceIds = input.spaceIds
  const upload = input.kind === 'YOUTUBE_TRANSCRIPT' ? input.captions : input.file
  if (input.kind === 'FILE' || input.kind === 'AUDIO_TRANSCRIPT' || input.kind === 'YOUTUBE_TRANSCRIPT') {
    if (!upload) throw new Error('FILE_REQUIRED')
    const asset = await uploadAsset(upload, { signal: options.signal, onProgress: ({ loaded, total }) => options.onProgress?.({ phase: 'uploading', loaded, total }) })
    body.assetId = asset.id
  }
  if (input.kind === 'AUDIO_TRANSCRIPT') body.transcriptionConsent = true
  if (input.kind === 'YOUTUBE_TRANSCRIPT') body.youtubeUrl = input.youtubeUrl
  if (input.kind === 'WEB_PAGE') body.url = input.url
  if (input.kind === 'PASTED_TEXT') body.text = input.text
  if (input.kind === 'NOTE_REVISION') {
    const revision = notes.find((note) => note.id === input.noteId)?.currentRevisionId
    if (!revision) throw new Error('NOTE_HAS_NO_REVISION')
    body.noteRevisionId = revision
  }
  options.onProgress?.({ phase: 'adding' })
  return toSourceRecord(await libraryApi.createSource(body, newIdempotencyKey()))
}
