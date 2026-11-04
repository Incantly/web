import { apiFetch } from './client'
import type { Schema } from './types'

export type ArtifactType = Schema<'ArtifactDto'>['type']
export type ArtifactStatus = Schema<'ArtifactDto'>['status']
export type Artifact = Schema<'ArtifactDto'>
export type ArtifactList = Schema<'ArtifactListDto'>
export type ArtifactVersion = Schema<'VersionDto'>
export type VersionList = Schema<'VersionListDto'>
export type VersionContent = Schema<'VersionContentDto'>
export type QuizContent = Schema<'QuizContentDto'>
export type DeckContent = Schema<'DeckContentDto'>
export type ArtifactGeneration = Schema<'GenerationDto'>
export type GenerationAccepted = Schema<'GenerationAcceptedDto'>
export type GenerationState = ArtifactGeneration['state']
export type GenerationMode = ArtifactGeneration['mode']
export type GenerationProgress = Schema<'GenerationProgressDto'>
export type PreviewBatch = Schema<'PreviewBatchDto'>
export type PreviewQuestion = Schema<'PreviewQuestionDto'>
export type PreviewCard = Schema<'PreviewCardDto'>
export type GenerationScope = Schema<'AiScopeDto'>
export type QuizPreferences = Schema<'QuizPreferencesDto'>
/** `language`, `difficulty`, `itemCount`, `questionTypes`, and `optionCount` have server defaults (the generated schema marks them required). */
export type QuizPreferencesInput = Partial<Pick<QuizPreferences, 'language' | 'difficulty' | 'itemCount' | 'questionTypes' | 'optionCount'>> & Pick<QuizPreferences, 'title' | 'topic' | 'durationMinutes'>
export type QuizQuestionType = QuizPreferences['questionTypes'][number]

const id = (value: string) => encodeURIComponent(value)

/** Thin wrappers over the artifact-generation routes (frontend-api-integration.md, "Quizzes API"). The same engine backs quizzes and flashcard decks. */
export const artifactsApi = {
  /** Starts generating a quiz from the user's material. `202 { created, generation }`; follow the generation until COMPLETED. One idempotency key per Generate press. */
  async generate(scope: GenerationScope, preferences: QuizPreferencesInput | undefined, idempotencyKey: string) {
    const body: Schema<'CreateGenerationDto'> = preferences ? { type: 'QUIZ', scope, preferences: preferences as QuizPreferences } : { type: 'QUIZ', scope }
    return (await apiFetch<GenerationAccepted>('/v1/artifacts/generations', { method: 'POST', body, idempotencyKey })).data
  },
  /** Reads one generation (create or regenerate) for its state, progress counts, and validated preview batches so far. Poll about every second, backing off to 3–5 s; stop at COMPLETED, FAILED, CANCELED, or EXPIRED. */
  async generation(jobId: string, signal?: AbortSignal) {
    return (await apiFetch<ArtifactGeneration>(`/v1/artifact-jobs/${id(jobId)}`, { signal })).data
  },
  /** Stops a generation at its next step. Idempotent: cancelling a finished generation returns it unchanged. A new quiz with no version ends FAILED; a regeneration leaves the current version as it is. */
  async cancel(jobId: string) {
    return (await apiFetch<ArtifactGeneration>(`/v1/artifact-jobs/${id(jobId)}/cancel`, { method: 'POST', maxAttempts: 3 })).data
  },
  /** Newest change first, 50 per page; archived hidden unless `includeArchived`. GENERATING and FAILED artifacts are listed so the UI can show progress or a retry. */
  async list(options: { type?: ArtifactType; spaceId?: string; includeArchived?: boolean; cursor?: string } = {}, signal?: AbortSignal) {
    const params = new URLSearchParams()
    if (options.type !== undefined) params.set('type', options.type)
    if (options.spaceId !== undefined) params.set('spaceId', options.spaceId)
    if (options.includeArchived) params.set('includeArchived', 'true')
    if (options.cursor !== undefined) params.set('cursor', options.cursor)
    const query = params.toString()
    return (await apiFetch<ArtifactList>(`/v1/artifacts${query ? `?${query}` : ''}`, { signal })).data
  },
  /** One artifact: its status, current version, and latest generation. */
  async get(artifactId: string, signal?: AbortSignal) {
    return (await apiFetch<Artifact>(`/v1/artifacts/${id(artifactId)}`, { signal })).data
  },
  /** An artifact's versions, newest first. Versions are immutable; a regeneration adds one. */
  async versions(artifactId: string, signal?: AbortSignal) {
    return (await apiFetch<VersionList>(`/v1/artifacts/${id(artifactId)}/versions`, { signal })).data
  },
  /** One version's public content: quiz questions/options or deck card fronts, never answers. */
  async version(artifactId: string, versionId: string, signal?: AbortSignal) {
    return (await apiFetch<VersionContent>(`/v1/artifacts/${id(artifactId)}/versions/${id(versionId)}`, { signal })).data
  },
  /** Rewrites up to 8 questions of the current version and publishes a new version. `202`; follow the generation like a new one. Attempts already started keep grading against their own version. */
  async regenerate(artifactId: string, questionIds: string[], idempotencyKey: string) {
    return (await apiFetch<GenerationAccepted>(`/v1/artifacts/${id(artifactId)}/regenerations`, { method: 'POST', body: { questionIds }, idempotencyKey })).data
  },
  /** Hides the artifact from the default list; it can still be read and taken. Idempotent. */
  async archive(artifactId: string) {
    return (await apiFetch<Artifact>(`/v1/artifacts/${id(artifactId)}/archive`, { method: 'POST', maxAttempts: 3 })).data
  },
  /** Permanent: the artifact disappears at once and its versions, attempts, and stored payloads are removed. Deleting it again is 404. */
  async remove(artifactId: string) {
    await apiFetch<undefined>(`/v1/artifacts/${id(artifactId)}`, { method: 'DELETE' })
  },
}

/**
 * Every event the generation stream names (frontend-api-integration.md, "Following a generation"):
 * `state` ({state, progress}) on every change, `batch` (one PreviewBatch) per validated batch,
 * `done` ({state, artifactId, versionId, failureCode, reused}) once before the stream closes,
 * `timeout` ({state}) after 2 minutes, and `error` ({code}) when the stream itself fails.
 */
export type ArtifactStreamEvent =
  | { type: 'state'; state: GenerationState; progress: GenerationProgress }
  | { type: 'batch'; batch: PreviewBatch }
  | { type: 'done'; state: GenerationState; artifactId: string; versionId: string | null; failureCode: string | null; reused: boolean }
  | { type: 'timeout'; state: GenerationState }
  | { type: 'error'; code: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readState(value: unknown): GenerationState | null {
  return typeof value === 'string' && value ? (value as GenerationState) : null
}

function readProgress(value: unknown): GenerationProgress | null {
  if (!isRecord(value)) return null
  const { batches, completedBatches, failedBatches, questionsReady, cardsReady } = value
  if (typeof batches !== 'number' || typeof completedBatches !== 'number' || typeof failedBatches !== 'number' || typeof questionsReady !== 'number') return null
  if (cardsReady !== undefined && typeof cardsReady !== 'number') return null
  return value as unknown as GenerationProgress
}

function readBatch(value: unknown): PreviewBatch | null {
  if (!isRecord(value) || typeof value.batch !== 'string' || !Array.isArray(value.questions)) return null
  if (value.cards !== undefined && !Array.isArray(value.cards)) return null
  return value as unknown as PreviewBatch
}

function readNullableText(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null
  return typeof value === 'string' ? value : undefined
}

/**
 * Parses one named stream event's `data` payload. Pure: returns the event, or
 * null when the payload is malformed or the event name is unknown (the caller
 * skips those, exactly as polling would never see them).
 */
export function parseArtifactStreamEvent(type: string, data: string): ArtifactStreamEvent | null {
  let payload: unknown
  try {
    payload = JSON.parse(data) as unknown
  } catch {
    return null
  }
  if (!isRecord(payload)) return null
  switch (type) {
    case 'state': {
      const state = readState(payload.state)
      const progress = readProgress(payload.progress)
      return state && progress ? { type: 'state', state, progress } : null
    }
    case 'batch': {
      const batch = readBatch(payload)
      return batch ? { type: 'batch', batch } : null
    }
    case 'done': {
      const state = readState(payload.state)
      const versionId = readNullableText(payload.versionId)
      const failureCode = readNullableText(payload.failureCode)
      if (!state || typeof payload.artifactId !== 'string' || versionId === undefined || failureCode === undefined) return null
      return { type: 'done', state, artifactId: payload.artifactId, versionId, failureCode, reused: payload.reused === true }
    }
    case 'timeout': {
      const state = readState(payload.state)
      return state ? { type: 'timeout', state } : null
    }
    case 'error': {
      return typeof payload.code === 'string' && payload.code ? { type: 'error', code: payload.code } : null
    }
    default:
      return null
  }
}

const STREAM_EVENT_TYPES = ['state', 'batch', 'done', 'timeout', 'error'] as const

/**
 * Follows a generation live over `GET /v1/artifact-jobs/{id}/stream` (SSE).
 * Resolves `'done'` once the stream delivers its `done` event, or `'fallback'`
 * when the stream can't be used or closes early (an error, a `timeout` close):
 * the caller then polls `GET /v1/artifact-jobs/{id}`, so nothing is lost.
 * Aborting the signal closes the stream (no leaks on unmount or navigate).
 */
export function streamArtifactGeneration(jobId: string, onEvent: (event: ArtifactStreamEvent) => void, signal: AbortSignal): Promise<'done' | 'fallback'> {
  return new Promise((resolve) => {
    if (typeof EventSource === 'undefined' || signal.aborted) return resolve('fallback')
    const source = new EventSource(`/v1/artifact-jobs/${id(jobId)}/stream`, { withCredentials: true })
    const finish = (result: 'done' | 'fallback') => { source.close(); signal.removeEventListener('abort', abort); resolve(result) }
    const abort = () => finish('fallback')
    signal.addEventListener('abort', abort, { once: true })
    for (const type of STREAM_EVENT_TYPES) {
      source.addEventListener(type, (message) => {
        const parsed = parseArtifactStreamEvent(type, (message as MessageEvent<string>).data)
        if (!parsed) return
        if (parsed.type === 'done') { onEvent(parsed); finish('done'); return }
        if (parsed.type === 'timeout' || parsed.type === 'error') { onEvent(parsed); finish('fallback'); return }
        onEvent(parsed)
      })
    }
    // EventSource would retry on its own; one path at a time, so hand over to polling instead.
    source.onerror = () => finish('fallback')
  })
}
