'use client'

import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createFeatureContext, useFeatureContext } from '@/components/product/features/createFeatureContext'
import type { ListStatus } from '@/components/product/workspace/views'
import { useLibrary } from '@/hooks/use-library'
import { useNavigation } from '@/hooks/use-navigation'
import { useNotes } from '@/hooks/use-notes'
import { useOnlineStatus } from '@/hooks/use-sharing'
import { useSpaces } from '@/hooks/use-spaces'
import {
  ARTIFACT_GENERATION_POLL_MS,
  ARTIFACT_REGEN_MAX,
  DEFAULT_QUIZ_PREFERENCES,
  artifactListCursor,
  artifactOpenView,
  artifactScopeSelectionError,
  buildArtifactScope,
  buildQuizPreferences,
  generationFailureCode,
  generationOutcome,
  generationProgressLine,
  generationVersionId,
  isCurrentVersion,
  selectVersionId,
  type ArtifactScopeSelection,
  type QuizPreferencesForm,
} from '@/components/product/workspace/artifactModel'
import { isUsableSource, type SourceRecord } from '@/components/product/workspace/model'
import { ApiError, isApiError } from '@/lib/api/errors'
import {
  artifactsApi,
  streamArtifactGeneration,
  type Artifact,
  type ArtifactGeneration,
  type ArtifactType,
  type ArtifactVersion,
  type GenerationScope,
  type QuizPreferencesInput,
  type QuizQuestionType,
  type VersionContent,
} from '@/lib/api/artifacts'
import { newIdempotencyKey } from '@/lib/api/idempotency'

export const artifactsListKey = (typeFilter: ArtifactTypeFilter, includeArchived: boolean) => ['artifacts-list', typeFilter, includeArchived] as const
export const artifactKey = (artifactId: string) => ['artifact', artifactId] as const
export const artifactVersionsKey = (artifactId: string) => ['artifact-versions', artifactId] as const
export const artifactVersionKey = (artifactId: string, versionId: string) => ['artifact-version', artifactId, versionId] as const
export const artifactGenerationKey = (jobId: string) => ['artifact-generation', jobId] as const

export type ArtifactTypeFilter = 'ALL' | ArtifactType

/** A quiz generation or question replacement being followed, so leaving the screen does not lose it. Memory only. */
export type PendingArtifactGeneration = { jobId: string; artifactId: string; mode: 'CREATE' | 'REGENERATE' }

export type ArtifactsValue = {
  online: boolean
  pending: PendingArtifactGeneration | null
  trackGeneration: (pending: PendingArtifactGeneration) => void
  clearGeneration: () => void
}

export const ArtifactsContext = createFeatureContext<ArtifactsValue>('Artifacts')

/** Connection state plus the generation being followed. Runs once, in `ArtifactsProvider`. */
export function useArtifactsState(): ArtifactsValue {
  const online = useOnlineStatus()
  const [pending, setPending] = useState<PendingArtifactGeneration | null>(null)
  const trackGeneration = useCallback((next: PendingArtifactGeneration) => setPending(next), [])
  const clearGeneration = useCallback(() => setPending(null), [])
  return useMemo<ArtifactsValue>(() => ({ online, pending, trackGeneration, clearGeneration }), [online, pending, trackGeneration, clearGeneration])
}

/** The shared artifacts state. Must be used inside `WorkspaceProviders`. */
export function useArtifacts(): ArtifactsValue {
  return useFeatureContext(ArtifactsContext)
}

type FollowedGeneration = {
  generation: ArtifactGeneration | null
  status: ListStatus
  /** Live "N questions ready…" copy while the generation runs, else the state copy. */
  progress: string | null
  /** A friendly failure once the generation stops failed, for the view to render with a retry. */
  failure: unknown
  /** True when the learner canceled this generation (CANCELED carries no failure code). */
  canceled: boolean
  cancel: () => Promise<void>
  cancelling: boolean
  cancelError: unknown
  clearCancelError: () => void
}

/**
 * Follows one pending generation: the live SSE stream first, polling when the
 * stream can't be used or closes early. Stream events merge into the cached
 * generation (states replace, batches append by id); a `done` event or a
 * terminal poll refreshes the artifact, its versions, and the lists. The
 * stream aborts on unmount or when the pending job changes (no leaks).
 */
function useFollowedGeneration(pending: PendingArtifactGeneration | null): FollowedGeneration {
  const client = useQueryClient()
  const { online } = useArtifacts()
  const jobId = pending?.jobId ?? null
  const artifactId = pending?.artifactId ?? null
  /** Jobs whose stream handed over to polling (timeout, error, or no EventSource). */
  const [polledJobs, setPolledJobs] = useState<readonly string[]>([])
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState<unknown>(null)

  const polling = jobId !== null && (typeof EventSource === 'undefined' || polledJobs.includes(jobId))
  const query = useQuery({
    queryKey: jobId ? artifactGenerationKey(jobId) : ['artifact-generation', 'idle'],
    queryFn: ({ signal }) => artifactsApi.generation(jobId ?? '', signal),
    enabled: jobId !== null,
    refetchInterval: (item) => (item.state.data && polling && generationOutcome(item.state.data.state) === 'pending' ? ARTIFACT_GENERATION_POLL_MS : false),
    meta: { silentErrors: true },
  })
  const generation = jobId ? query.data ?? null : null

  useEffect(() => {
    if (!jobId || !artifactId || !online || polling) return
    const controller = new AbortController()
    void streamArtifactGeneration(jobId, (event) => {
      if (event.type === 'state') {
        client.setQueryData<ArtifactGeneration>(artifactGenerationKey(jobId), (current) => (current ? { ...current, state: event.state, progress: event.progress } : current))
      } else if (event.type === 'batch') {
        client.setQueryData<ArtifactGeneration>(artifactGenerationKey(jobId), (current) => {
          if (!current || current.preview.some((entry) => entry.batch === event.batch.batch)) return current
          return { ...current, preview: [...current.preview, event.batch] }
        })
      } else if (event.type === 'done') {
        client.setQueryData<ArtifactGeneration>(artifactGenerationKey(jobId), (current) => (current ? { ...current, state: event.state } : current))
        void client.invalidateQueries({ queryKey: artifactGenerationKey(jobId) })
        void client.invalidateQueries({ queryKey: artifactKey(artifactId) })
        void client.invalidateQueries({ queryKey: artifactVersionsKey(artifactId) })
        void client.invalidateQueries({ queryKey: ['artifacts-list'] })
      }
    }, controller.signal).then((result) => {
      if (result === 'fallback') setPolledJobs((current) => (current.includes(jobId) ? current : [...current, jobId]))
    })
    return () => controller.abort()
    // The queries refresh on their own once the stream hands over or delivers `done`.
  }, [jobId, artifactId, online, polling, client])

  // A terminal poll refreshes the same reads the `done` event does.
  const terminal = generation && generationOutcome(generation.state) !== 'pending'
  useEffect(() => {
    if (!terminal || !jobId || !artifactId) return
    void client.invalidateQueries({ queryKey: artifactKey(artifactId) })
    void client.invalidateQueries({ queryKey: artifactVersionsKey(artifactId) })
    void client.invalidateQueries({ queryKey: ['artifacts-list'] })
  }, [terminal, jobId, artifactId, client])

  const cancel = useCallback(async () => {
    if (!jobId || cancelling) return
    setCancelling(true)
    setCancelError(null)
    try {
      const stopped = await artifactsApi.cancel(jobId)
      client.setQueryData<ArtifactGeneration>(artifactGenerationKey(jobId), stopped)
      if (artifactId) {
        void client.invalidateQueries({ queryKey: artifactKey(artifactId) })
        void client.invalidateQueries({ queryKey: ['artifacts-list'] })
      }
    } catch (failure) {
      setCancelError(failure)
    } finally {
      setCancelling(false)
    }
  }, [jobId, artifactId, cancelling, client])

  const clearCancelError = useCallback(() => setCancelError(null), [])

  return useMemo<FollowedGeneration>(() => {
    const outcome = generation ? generationOutcome(generation.state) : null
    const code = generation && outcome === 'failed' ? generationFailureCode(generation) : null
    return {
      generation,
      status: { loading: query.isPending, error: query.isError ? query.error : null, retry: () => void query.refetch() },
      progress: generation && outcome === 'pending' ? generationProgressLine(generation) : null,
      failure: code ? new ApiError(500, code, null, null) : null,
      canceled: generation?.state === 'CANCELED',
      cancel,
      cancelling,
      cancelError,
      clearCancelError,
    }
  }, [generation, query, cancel, cancelling, cancelError, clearCancelError])
}

export type ArtifactsListValue = {
  online: boolean
  typeFilter: ArtifactTypeFilter
  setTypeFilter: (filter: ArtifactTypeFilter) => void
  includeArchived: boolean
  setIncludeArchived: (include: boolean) => void
  items: Artifact[]
  listStatus: ListStatus
}

/** The quizzes-and-decks list: type filter, archived toggle, and cursor paging. The view only draws this state. */
export function useArtifactsList(): ArtifactsListValue {
  const { online } = useArtifacts()
  const [typeFilter, setTypeFilter] = useState<ArtifactTypeFilter>('ALL')
  const [includeArchived, setIncludeArchived] = useState(false)
  const query = useInfiniteQuery({
    queryKey: artifactsListKey(typeFilter, includeArchived),
    queryFn: ({ signal, pageParam }) => artifactsApi.list({
      ...(typeFilter === 'ALL' ? {} : { type: typeFilter }),
      ...(includeArchived ? { includeArchived: true } : {}),
      ...(pageParam ? { cursor: pageParam } : {}),
    }, signal),
    initialPageParam: '',
    getNextPageParam: (last) => artifactListCursor(last) ?? undefined,
    meta: { silentErrors: true },
  })
  const items = useMemo(() => (query.data?.pages ?? []).flatMap((page) => page.items), [query.data])
  return useMemo<ArtifactsListValue>(() => ({
    online,
    typeFilter,
    setTypeFilter,
    includeArchived,
    setIncludeArchived,
    items,
    listStatus: {
      loading: query.isPending,
      error: query.isError ? query.error : null,
      retry: () => void query.refetch(),
      hasMore: query.hasNextPage,
      loadMore: () => void query.fetchNextPage(),
      loadingMore: query.isFetchingNextPage,
    },
  }), [online, typeFilter, includeArchived, items, query])
}

export type ArtifactDetailValue = {
  online: boolean
  artifact: Artifact | null
  artifactStatus: ListStatus
  /** Where the Take/Review button opens: the existing quiz or deck view. Null until the artifact loads. */
  openView: `quiz:${string}` | `deck:${string}` | null
  versions: ArtifactVersion[]
  versionsStatus: ListStatus
  selectedVersionId: string | null
  selectVersion: (versionId: string) => void
  /** True when the shown version is the artifact's current one. */
  showingCurrent: boolean
  versionContent: VersionContent | null
  versionStatus: ListStatus
  /** Replacing questions (quizzes with a current version only): pick 1–8, confirm, then follow the progress. */
  regenState: 'idle' | 'confirming' | 'working' | 'failed'
  pickedQuestionIds: readonly string[]
  toggleQuestionId: (questionId: string) => void
  canRegen: boolean
  requestRegen: () => void
  cancelRegen: () => void
  confirmRegen: () => Promise<void>
  regenError: unknown
  regenProgress: string | null
  regenCanceled: boolean
  cancelRegenGeneration: () => Promise<void>
  cancellingRegen: boolean
  archiveState: 'idle' | 'confirming' | 'working'
  archiveError: unknown
  clearArchiveError: () => void
  requestArchive: () => void
  cancelArchive: () => void
  confirmArchive: () => Promise<void>
  deleteState: 'idle' | 'confirming' | 'working'
  requestDelete: () => void
  cancelDelete: () => void
  confirmDelete: () => Promise<void>
  deleteError: unknown
  backToList: () => void
}

/**
 * One artifact: metadata, versions with public content, question replacement,
 * archive, and delete. Generated text is rendered as text by the view; this
 * only fetches it and runs the actions.
 */
export function useArtifactDetail(artifactId: string): ArtifactDetailValue {
  const client = useQueryClient()
  const { navigate } = useNavigation()
  const { online, pending, trackGeneration, clearGeneration } = useArtifacts()

  const artifactQuery = useQuery({
    queryKey: artifactKey(artifactId),
    queryFn: ({ signal }) => artifactsApi.get(artifactId, signal),
    meta: { silentErrors: true },
  })
  const artifact = artifactQuery.data ?? null

  const versionsQuery = useQuery({
    queryKey: artifactVersionsKey(artifactId),
    queryFn: ({ signal }) => artifactsApi.versions(artifactId, signal),
    meta: { silentErrors: true },
  })
  const versions = useMemo(() => versionsQuery.data?.items ?? [], [versionsQuery.data])

  const [pickedVersionId, setPickedVersionId] = useState<string | null>(null)
  const [droppedVersionId, setDroppedVersionId] = useState<string | null>(null)
  const selectedVersionId = selectVersionId(versions, pickedVersionId === droppedVersionId ? null : pickedVersionId)
  const versionQuery = useQuery({
    queryKey: selectedVersionId ? artifactVersionKey(artifactId, selectedVersionId) : ['artifact-version', 'idle'],
    queryFn: ({ signal }) => artifactsApi.version(artifactId, selectedVersionId ?? '', signal),
    enabled: selectedVersionId !== null,
    meta: { silentErrors: true },
  })
  // A version read that 404s (superseded mid-read) drops the pick, so the newest listed version shows.
  // Adjusted during render from the failed version id, so no effect is needed.
  if (isApiError(versionQuery.error, 'ARTIFACT_VERSION_NOT_FOUND') && selectedVersionId !== null && droppedVersionId !== selectedVersionId) {
    setDroppedVersionId(selectedVersionId)
  }

  const selectVersion = useCallback((versionId: string) => setPickedVersionId(versionId), [])

  const regenPending = pending?.mode === 'REGENERATE' && pending.artifactId === artifactId ? pending : null
  const followed = useFollowedGeneration(regenPending)
  const [regenState, setRegenState] = useState<ArtifactDetailValue['regenState']>('idle')
  const [pickedQuestionIds, setPickedQuestionIds] = useState<readonly string[]>([])
  const [regenError, setRegenError] = useState<unknown>(null)

  // A finished replacement publishes a new version: follow it with fresh reads.
  const regenOutcome = followed.generation ? generationOutcome(followed.generation.state) : null
  useEffect(() => {
    if (!regenPending || regenOutcome === 'pending' || regenOutcome === null) return
    if (regenOutcome === 'ready') {
      clearGeneration()
      // eslint-disable-next-line react-hooks/set-state-in-effect -- settle regen state when the followed replacement finishes
      setRegenState('idle')
      setRegenError(null)
      setPickedQuestionIds([])
      setPickedVersionId(generationVersionId(followed.generation as ArtifactGeneration) ?? null)
      void client.invalidateQueries({ queryKey: artifactVersionsKey(artifactId) })
    } else {
      setRegenState('failed')
    }
  }, [regenPending, regenOutcome, followed.generation, clearGeneration, client, artifactId])

  const toggleQuestionId = useCallback((questionId: string) => {
    setPickedQuestionIds((current) => {
      if (current.includes(questionId)) return current.filter((entry) => entry !== questionId)
      if (current.length >= ARTIFACT_REGEN_MAX) return current
      return [...current, questionId]
    })
  }, [])
  const requestRegen = useCallback(() => { setRegenError(null); setRegenState('confirming') }, [])
  const cancelRegen = useCallback(() => setRegenState((current) => (current === 'working' ? current : 'idle')), [])
  const confirmRegen = useCallback(async () => {
    if (pickedQuestionIds.length === 0 || regenState === 'working') return
    setRegenState('working')
    setRegenError(null)
    try {
      // One key per Replace press; a same-key retry replays the same replacement.
      const accepted = await artifactsApi.regenerate(artifactId, [...pickedQuestionIds], newIdempotencyKey())
      trackGeneration({ jobId: accepted.generation.id, artifactId, mode: 'REGENERATE' })
    } catch (failure) {
      if (isApiError(failure, 'ARTIFACT_NOT_READY') || isApiError(failure, 'ARTIFACT_QUESTIONS_INVALID')) {
        void client.invalidateQueries({ queryKey: artifactKey(artifactId) })
        void client.invalidateQueries({ queryKey: artifactVersionsKey(artifactId) })
      }
      setRegenError(failure)
      setRegenState('failed')
    }
  }, [pickedQuestionIds, regenState, artifactId, trackGeneration, client])

  const [archiveState, setArchiveState] = useState<ArtifactDetailValue['archiveState']>('idle')
  const [archiveError, setArchiveError] = useState<unknown>(null)
  const clearArchiveError = useCallback(() => setArchiveError(null), [])
  const requestArchive = useCallback(() => { setArchiveError(null); setArchiveState('confirming') }, [])
  const cancelArchive = useCallback(() => setArchiveState('idle'), [])
  const confirmArchive = useCallback(async () => {
    if (archiveState === 'working') return
    setArchiveState('working')
    setArchiveError(null)
    try {
      const archived = await artifactsApi.archive(artifactId)
      client.setQueryData<Artifact>(artifactKey(artifactId), archived)
      void client.invalidateQueries({ queryKey: ['artifacts-list'] })
      setArchiveState('idle')
    } catch (failure) {
      setArchiveError(failure)
      setArchiveState('idle')
    }
  }, [archiveState, artifactId, client])

  const [deleteState, setDeleteState] = useState<ArtifactDetailValue['deleteState']>('idle')
  const [deleteError, setDeleteError] = useState<unknown>(null)
  const requestDelete = useCallback(() => { setDeleteError(null); setDeleteState('confirming') }, [])
  const cancelDelete = useCallback(() => setDeleteState('idle'), [])
  const confirmDelete = useCallback(async () => {
    if (deleteState === 'working') return
    setDeleteState('working')
    setDeleteError(null)
    try {
      await artifactsApi.remove(artifactId)
      if (pending?.artifactId === artifactId) clearGeneration()
      void client.invalidateQueries({ queryKey: ['artifacts-list'] })
      navigate('artifacts')
    } catch (failure) {
      setDeleteError(failure)
      setDeleteState('idle')
    }
  }, [deleteState, artifactId, pending, clearGeneration, client, navigate])

  const backToList = useCallback(() => navigate('artifacts'), [navigate])

  return useMemo<ArtifactDetailValue>(() => ({
    online,
    artifact,
    artifactStatus: { loading: artifactQuery.isPending, error: artifactQuery.isError ? artifactQuery.error : null, retry: () => void artifactQuery.refetch() },
    openView: artifact ? artifactOpenView(artifact) : null,
    versions,
    versionsStatus: { loading: versionsQuery.isPending, error: versionsQuery.isError ? versionsQuery.error : null, retry: () => void versionsQuery.refetch() },
    selectedVersionId,
    selectVersion,
    showingCurrent: artifact !== null && selectedVersionId !== null && isCurrentVersion(artifact, selectedVersionId),
    versionContent: versionQuery.data && selectedVersionId && versionQuery.data.id === selectedVersionId ? versionQuery.data : null,
    versionStatus: { loading: versionQuery.isPending, error: versionQuery.isError ? versionQuery.error : null, retry: () => void versionQuery.refetch() },
    regenState,
    pickedQuestionIds,
    toggleQuestionId,
    canRegen: pickedQuestionIds.length >= 1 && pickedQuestionIds.length <= ARTIFACT_REGEN_MAX,
    requestRegen,
    cancelRegen,
    confirmRegen,
    regenError: regenError ?? followed.failure ?? followed.cancelError ?? (followed.status.error ?? null),
    regenProgress: regenPending ? followed.progress : null,
    regenCanceled: followed.canceled,
    cancelRegenGeneration: followed.cancel,
    cancellingRegen: followed.cancelling,
    archiveState,
    archiveError,
    clearArchiveError,
    requestArchive,
    cancelArchive,
    confirmArchive,
    deleteState,
    requestDelete,
    cancelDelete,
    confirmDelete,
    deleteError,
    backToList,
  }), [online, artifact, artifactQuery, versions, versionsQuery, selectedVersionId, selectVersion, versionQuery, regenState, pickedQuestionIds, toggleQuestionId, requestRegen, cancelRegen, confirmRegen, regenError, followed, regenPending, archiveState, archiveError, clearArchiveError, requestArchive, cancelArchive, confirmArchive, deleteState, requestDelete, cancelDelete, confirmDelete, deleteError, backToList])
}

/** The generation request as posted, kept so "Try again" resends the same body with a new key. */
type PostedGeneration = { scope: GenerationScope; preferences: QuizPreferencesInput }

export type ArtifactGenerateValue = {
  online: boolean
  scopeKind: ArtifactScopeSelection['kind']
  setScopeKind: (kind: ArtifactScopeSelection['kind']) => void
  scope: ArtifactScopeSelection
  setNoteId: (noteId: string) => void
  setSpaceId: (spaceId: string) => void
  toggleSourceId: (sourceId: string) => void
  preferences: QuizPreferencesForm
  setPreferences: (patch: Partial<QuizPreferencesForm>) => void
  toggleQuestionType: (type: QuizQuestionType) => void
  /** Notes, Spaces, and usable sources the picker draws. */
  noteOptions: { id: string; title: string }[]
  spaceOptions: { id: string; name: string }[]
  sourceOptions: SourceRecord[]
  optionsStatus: ListStatus
  scopeError: string | null
  /** Starts the generation and follows it. Stays on errors for the view to render. */
  generate: () => Promise<void>
  generating: boolean
  generateError: unknown
  clearGenerateError: () => void
  /** Tries the same request again with a fresh idempotency key (retries need a new key). */
  retryGenerate: () => Promise<void>
  generation: ArtifactGeneration | null
  generationStatus: ListStatus
  /** Live progress copy while the generation runs. */
  generationProgress: string | null
  /** A friendly failure once the generation stops, for the view to render with a retry. */
  generationFailure: unknown
  /** True when the learner canceled this generation. */
  generationCanceled: boolean
  cancelGeneration: () => Promise<void>
  cancelling: boolean
  /** The completed quiz id once the generation publishes it. */
  readyArtifactId: string | null
  backToForm: () => void
}

/**
 * The new-quiz screen: scope picker plus preferences, then the generation's
 * live progress until the quiz is ready to take. The form only draws this state.
 */
export function useArtifactGenerate(): ArtifactGenerateValue {
  const { online, pending, trackGeneration, clearGeneration } = useArtifacts()
  const { notes, status: notesStatus } = useNotes()
  const { spaces, status: spacesStatus } = useSpaces()
  const { sources, status: sourcesStatus } = useLibrary()

  const [scopeKind, setScopeKind] = useState<ArtifactScopeSelection['kind']>('LIBRARY')
  const [noteId, setNoteId] = useState('')
  const [spaceId, setSpaceId] = useState('')
  const [sourceIds, setSourceIds] = useState<string[]>([])
  const [preferences, setPreferencesState] = useState<QuizPreferencesForm>(DEFAULT_QUIZ_PREFERENCES)
  const [posted, setPosted] = useState<PostedGeneration | null>(null)
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<unknown>(null)

  const scope: ArtifactScopeSelection = useMemo<ArtifactScopeSelection>(() => scopeKind === 'NOTE'
    ? { kind: 'NOTE', noteId }
    : scopeKind === 'SPACE'
      ? { kind: 'SPACE', spaceId }
      : scopeKind === 'SELECTED_SOURCES'
        ? { kind: 'SELECTED_SOURCES', sourceIds }
        : { kind: 'LIBRARY' }, [scopeKind, noteId, spaceId, sourceIds])

  const createPending = pending?.mode === 'CREATE' ? pending : null
  const followed = useFollowedGeneration(createPending)
  const generation = createPending ? followed.generation : null
  const readyArtifactId = createPending && generation && generationOutcome(generation.state) === 'ready' ? createPending.artifactId : null

  const post = useCallback(async (scope: GenerationScope, preferences: QuizPreferencesInput) => {
    // One key per Generate press, retried unchanged only by the transport itself.
    const accepted = await artifactsApi.generate(scope, preferences, newIdempotencyKey())
    trackGeneration({ jobId: accepted.generation.id, artifactId: accepted.generation.artifactId, mode: 'CREATE' })
  }, [trackGeneration])

  const buildSelection = useCallback(() => scopeKind === 'NOTE'
    ? { kind: 'NOTE', noteId } as const
    : scopeKind === 'SPACE'
      ? { kind: 'SPACE', spaceId } as const
      : scopeKind === 'SELECTED_SOURCES'
        ? { kind: 'SELECTED_SOURCES', sourceIds } as const
        : { kind: 'LIBRARY' } as const, [scopeKind, noteId, spaceId, sourceIds])

  const generate = useCallback(async () => {
    const scope = buildArtifactScope(buildSelection())
    if (!scope || generating) return
    setGenerating(true)
    setGenerateError(null)
    try {
      const prefs = buildQuizPreferences(preferences)
      setPosted({ scope, preferences: prefs })
      await post(scope, prefs)
    } catch (failure) {
      setGenerateError(failure)
    } finally {
      setGenerating(false)
    }
  }, [buildSelection, preferences, generating, post])

  const retryGenerate = useCallback(async () => {
    if (!posted || generating) return
    setGenerating(true)
    setGenerateError(null)
    try {
      await post(posted.scope, posted.preferences)
    } catch (failure) {
      setGenerateError(failure)
    } finally {
      setGenerating(false)
    }
  }, [posted, generating, post])

  const setPreferences = useCallback((patch: Partial<QuizPreferencesForm>) => setPreferencesState((current) => ({ ...current, ...patch })), [])
  const toggleSourceId = useCallback((sourceId: string) => {
    setSourceIds((current) => (current.includes(sourceId) ? current.filter((entry) => entry !== sourceId) : [...current, sourceId].slice(0, 50)))
  }, [])
  const toggleQuestionType = useCallback((type: QuizQuestionType) => {
    setPreferencesState((current) => ({ ...current, questionTypes: current.questionTypes.includes(type) ? current.questionTypes.filter((entry) => entry !== type) : [...current.questionTypes, type] }))
  }, [])
  const clearGenerateError = useCallback(() => setGenerateError(null), [])
  const backToForm = useCallback(() => { clearGeneration(); setGenerateError(null) }, [clearGeneration])

  return useMemo<ArtifactGenerateValue>(() => {
    const loading = notesStatus.loading || spacesStatus.loading || sourcesStatus.loading
    const error = notesStatus.error ?? spacesStatus.error ?? sourcesStatus.error
    return {
      online,
      scopeKind,
      setScopeKind,
      scope,
      setNoteId,
      setSpaceId,
      toggleSourceId,
      preferences,
      setPreferences,
      toggleQuestionType,
      noteOptions: notes.map((note) => ({ id: note.id, title: note.title || 'Untitled note' })),
      spaceOptions: spaces.filter((space) => space.status === 'ACTIVE').map((space) => ({ id: space.id, name: space.name })),
      sourceOptions: sources.filter(isUsableSource),
      optionsStatus: {
        loading,
        error,
        retry: () => { notesStatus.retry(); spacesStatus.retry(); sourcesStatus.retry() },
      },
      scopeError: artifactScopeSelectionError(scope),
      generate,
      generating,
      generateError,
      clearGenerateError,
      retryGenerate,
      generation,
      generationStatus: followed.status,
      generationProgress: createPending ? followed.progress : null,
      generationFailure: followed.failure ?? followed.cancelError ?? null,
      generationCanceled: followed.canceled,
      cancelGeneration: followed.cancel,
      cancelling: followed.cancelling,
      readyArtifactId,
      backToForm,
    }
  }, [online, scopeKind, scope, notes, spaces, sources, notesStatus, spacesStatus, sourcesStatus, preferences, setPreferences, toggleQuestionType, toggleSourceId, generate, generating, generateError, clearGenerateError, retryGenerate, generation, followed, createPending, readyArtifactId, backToForm])
}
