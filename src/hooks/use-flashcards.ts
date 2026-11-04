'use client'

import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createFeatureContext, useFeatureContext } from '@/components/product/features/createFeatureContext'
import type { ListStatus } from '@/components/product/workspace/views'
import { useLibrary } from '@/hooks/use-library'
import { useNotes } from '@/hooks/use-notes'
import { useOnlineStatus } from '@/hooks/use-sharing'
import { useSpaces } from '@/hooks/use-spaces'
import {
  DEFAULT_DECK_PREFERENCES,
  FLASHCARD_DUE_LIMIT,
  FLASHCARD_GENERATION_POLL_MS,
  buildDeckPreferences,
  buildDeckScope,
  clampElapsedMs,
  currentCard,
  dueNextCursor,
  generationFailureCode,
  generationOutcome,
  generationProgressCopy,
  isCurrentReveal,
  reviewInput,
  scopeSelectionError,
  type DeckPreferencesForm,
  type DeckScopeKind,
  type DeckScopeSelection,
} from '@/components/product/workspace/flashcardModel'
import { isUsableSource, type SourceRecord } from '@/components/product/workspace/model'
import { ApiError, isApiError } from '@/lib/api/errors'
import {
  flashcardsApi,
  type CardType,
  type DeckGeneration,
  type DeckScope,
  type DueCard,
  type DueCards,
  type RevealedCard,
  type ReviewRating,
} from '@/lib/api/flashcards'
import { newIdempotencyKey } from '@/lib/api/idempotency'

export const flashcardsDueKey = (deckId: string) => ['flashcards-due', deckId] as const
export const flashcardRevealKey = (deckId: string, versionId: string, cardId: string) => ['flashcard-reveal', deckId, versionId, cardId] as const
export const flashcardGenerationKey = (jobId: string) => ['flashcard-generation', jobId] as const

/** A deck generation or card replacement being followed, so leaving the screen does not lose it. Memory only. */
export type PendingGeneration = { jobId: string; deckId: string; mode: 'CREATE' | 'REGENERATE' }

export type FlashcardsValue = {
  online: boolean
  pending: PendingGeneration | null
  trackGeneration: (pending: PendingGeneration) => void
  clearGeneration: () => void
}

export const FlashcardsContext = createFeatureContext<FlashcardsValue>('Flashcards')

/** Connection state plus the generation being followed. Runs once, in `FlashcardsProvider`. */
export function useFlashcardsState(): FlashcardsValue {
  const online = useOnlineStatus()
  const [pending, setPending] = useState<PendingGeneration | null>(null)
  const trackGeneration = useCallback((next: PendingGeneration) => setPending(next), [])
  const clearGeneration = useCallback(() => setPending(null), [])
  return useMemo<FlashcardsValue>(() => ({ online, pending, trackGeneration, clearGeneration }), [online, pending, trackGeneration, clearGeneration])
}

/** The shared flashcard state. Must be used inside `WorkspaceProviders`. */
export function useFlashcards(): FlashcardsValue {
  return useFeatureContext(FlashcardsContext)
}

/** The generation request as posted, kept so "Try again" resends the same body with a new key. */
type PostedGeneration = { scope: DeckScope; preferences: ReturnType<typeof buildDeckPreferences> }

export type DeckGenerateValue = {
  online: boolean
  scopeKind: DeckScopeKind
  setScopeKind: (kind: DeckScopeKind) => void
  scope: DeckScopeSelection
  setNoteId: (noteId: string) => void
  setSpaceId: (spaceId: string) => void
  toggleSourceId: (sourceId: string) => void
  preferences: DeckPreferencesForm
  setPreferences: (patch: Partial<DeckPreferencesForm>) => void
  toggleCardType: (type: CardType) => void
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
  generation: DeckGeneration | null
  generationStatus: ListStatus
  /** Live "N cards ready…" copy while the generation runs. */
  generationProgress: string | null
  /** A friendly failure once the generation stops, for the view to render with a retry. */
  generationFailure: unknown
  /** The completed deck id once the generation publishes it. */
  readyDeckId: string | null
  backToForm: () => void
}

/**
 * The new-deck screen: scope picker plus preferences, then the generation's
 * progress until the deck is ready to review. The form only draws this state.
 */
export function useDeckGenerate(): DeckGenerateValue {
  const { online, pending, trackGeneration, clearGeneration } = useFlashcards()
  const { notes, status: notesStatus } = useNotes()
  const { spaces, status: spacesStatus } = useSpaces()
  const { sources, status: sourcesStatus } = useLibrary()

  const [scopeKind, setScopeKind] = useState<DeckScopeKind>('LIBRARY')
  const [noteId, setNoteId] = useState('')
  const [spaceId, setSpaceId] = useState('')
  const [sourceIds, setSourceIds] = useState<string[]>([])
  const [preferences, setPreferencesState] = useState<DeckPreferencesForm>(DEFAULT_DECK_PREFERENCES)
  const [posted, setPosted] = useState<PostedGeneration | null>(null)
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<unknown>(null)

  const scope: DeckScopeSelection = useMemo<DeckScopeSelection>(() => scopeKind === 'NOTE'
    ? { kind: 'NOTE', noteId }
    : scopeKind === 'SPACE'
      ? { kind: 'SPACE', spaceId }
      : scopeKind === 'SELECTED_SOURCES'
        ? { kind: 'SELECTED_SOURCES', sourceIds }
        : { kind: 'LIBRARY' }, [scopeKind, noteId, spaceId, sourceIds])

  const generationQuery = useQuery({
    queryKey: pending?.mode === 'CREATE' ? flashcardGenerationKey(pending.jobId) : ['flashcard-generation', 'idle'],
    queryFn: ({ signal }) => flashcardsApi.generation(pending?.jobId ?? '', signal),
    enabled: pending?.mode === 'CREATE',
    refetchInterval: (query) => (query.state.data && generationOutcome(query.state.data.state) === 'pending' ? FLASHCARD_GENERATION_POLL_MS : false),
    meta: { silentErrors: true },
  })
  const generation = pending?.mode === 'CREATE' ? generationQuery.data ?? null : null
  const readyDeckId = pending?.mode === 'CREATE' && generation && generationOutcome(generation.state) === 'ready' ? pending.deckId : null

  const post = useCallback(async (scope: DeckScope, preferences: ReturnType<typeof buildDeckPreferences>) => {
    // One key per Generate press, retried unchanged only by the transport itself.
    const accepted = await flashcardsApi.generate(scope, preferences, newIdempotencyKey())
    trackGeneration({ jobId: accepted.generation.id, deckId: accepted.generation.artifactId, mode: 'CREATE' })
  }, [trackGeneration])

  const generate = useCallback(async () => {
    const selection: DeckScopeSelection = scopeKind === 'NOTE'
      ? { kind: 'NOTE', noteId }
      : scopeKind === 'SPACE'
        ? { kind: 'SPACE', spaceId }
        : scopeKind === 'SELECTED_SOURCES'
          ? { kind: 'SELECTED_SOURCES', sourceIds }
          : { kind: 'LIBRARY' }
    const scope = buildDeckScope(selection)
    if (!scope || generating) return
    setGenerating(true)
    setGenerateError(null)
    try {
      const prefs = buildDeckPreferences(preferences)
      setPosted({ scope, preferences: prefs })
      await post(scope, prefs)
    } catch (failure) {
      setGenerateError(failure)
    } finally {
      setGenerating(false)
    }
  }, [scopeKind, noteId, spaceId, sourceIds, preferences, generating, post])

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

  const setPreferences = useCallback((patch: Partial<DeckPreferencesForm>) => setPreferencesState((current) => ({ ...current, ...patch })), [])
  const toggleSourceId = useCallback((sourceId: string) => {
    setSourceIds((current) => (current.includes(sourceId) ? current.filter((id) => id !== sourceId) : [...current, sourceId].slice(0, 50)))
  }, [])
  const toggleCardType = useCallback((type: CardType) => {
    setPreferencesState((current) => ({ ...current, cardTypes: current.cardTypes.includes(type) ? current.cardTypes.filter((entry) => entry !== type) : [...current.cardTypes, type] }))
  }, [])
  const clearGenerateError = useCallback(() => setGenerateError(null), [])
  const backToForm = useCallback(() => { clearGeneration(); setGenerateError(null) }, [clearGeneration])

  return useMemo<DeckGenerateValue>(() => {
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
      toggleCardType,
      noteOptions: notes.map((note) => ({ id: note.id, title: note.title || 'Untitled note' })),
      spaceOptions: spaces.filter((space) => space.status === 'ACTIVE').map((space) => ({ id: space.id, name: space.name })),
      sourceOptions: sources.filter(isUsableSource),
      optionsStatus: {
        loading,
        error,
        retry: () => { notesStatus.retry(); spacesStatus.retry(); sourcesStatus.retry() },
      },
      scopeError: scopeSelectionError(scope),
      generate,
      generating,
      generateError,
      clearGenerateError,
      retryGenerate,
      generation,
      generationStatus: {
        loading: generationQuery.isPending,
        error: generationQuery.isError ? generationQuery.error : null,
        retry: () => void generationQuery.refetch(),
      },
      generationProgress: generation && generationOutcome(generation.state) === 'pending' ? generationProgressCopy(generation) : null,
      generationFailure: generation && generationOutcome(generation.state) === 'failed' && generationFailureCode(generation)
        ? new ApiError(500, generationFailureCode(generation) as string, null, null)
        : null,
      readyDeckId,
      backToForm,
    }
  }, [online, scopeKind, scope, notes, spaces, sources, notesStatus, spacesStatus, sourcesStatus, preferences, setPreferences, toggleCardType, toggleSourceId, generate, generating, generateError, clearGenerateError, retryGenerate, generation, generationQuery, readyDeckId, backToForm])
}

export type DeckReviewValue = {
  online: boolean
  /** Every loaded due card, reviewed or not, in server order. */
  items: DueCard[]
  dueStatus: ListStatus
  reviewedCount: number
  /** The card under review, or null when the loaded queue is done. */
  card: DueCard | null
  cardVersionId: string | null
  jumpTo: (cardId: string) => void
  reviewed: (cardId: string) => boolean
  /** Shows the answer, fetched once per card and never drawn stale. */
  reveal: () => void
  revealed: RevealedCard | null
  revealStatus: ListStatus
  grade: (rating: ReviewRating) => Promise<void>
  grading: ReviewRating | null
  gradeError: unknown
  clearGradeError: () => void
  /** True when the deck changed mid-review: the list refreshed, so grade the current card again. */
  gradeStale: boolean
  /** Replaces the card under review with a fresh one, after a confirm. */
  regenState: 'idle' | 'confirming' | 'working' | 'failed'
  requestRegen: () => void
  cancelRegen: () => void
  confirmRegen: () => Promise<void>
  regenError: unknown
  regenProgress: string | null
}

/**
 * Reviewing one deck: the due queue one card at a time, answer reveal, and
 * grading. Scheduling stays server-side; this only sends ratings and renders
 * what comes back. Never auto-submits a second rating after a conflict.
 */
export function useDeckReview(deckId: string): DeckReviewValue {
  const client = useQueryClient()
  const { online, pending, trackGeneration, clearGeneration } = useFlashcards()

  const dueQuery = useInfiniteQuery({
    queryKey: flashcardsDueKey(deckId),
    queryFn: ({ signal, pageParam }) => flashcardsApi.due(deckId, { limit: FLASHCARD_DUE_LIMIT, ...(pageParam ? { cursor: pageParam } : {}) }, signal),
    initialPageParam: '',
    getNextPageParam: (last) => dueNextCursor(last) ?? undefined,
    meta: { silentErrors: true },
  })
  const pages = useMemo(() => dueQuery.data?.pages ?? [], [dueQuery.data])
  const items = useMemo(() => pages.flatMap((page: DueCards) => page.items), [pages])
  // The cursor pins one version across pages: every item shares the first page's version.
  const cardVersionId = pages[0]?.versionId ?? null

  const [reviewedIds, setReviewedIds] = useState<string[]>([])
  const [pickedId, setPickedId] = useState<string | null>(null)
  const [requestedIds, setRequestedIds] = useState<string[]>([])
  const card = currentCard(items, reviewedIds, pickedId)
  const revealRequested = card !== null && cardVersionId !== null && requestedIds.includes(card.id)
  const revealQuery = useQuery({
    queryKey: card && cardVersionId ? flashcardRevealKey(deckId, cardVersionId, card.id) : ['flashcard-reveal', 'idle'],
    queryFn: ({ signal }) => flashcardsApi.reveal(deckId, cardVersionId ?? '', card?.id ?? '', signal),
    enabled: revealRequested,
    meta: { silentErrors: true },
  })
  const revealed = revealQuery.data && card && cardVersionId && isCurrentReveal(revealQuery.data, cardVersionId, card.id) ? revealQuery.data : null

  // Thinking time runs from the moment the current card appears. The effect stamps
  // it before any grading press can happen; 0 (never stamped) reads as "just now".
  const shownAt = useRef(0)
  useEffect(() => { shownAt.current = Date.now() }, [card?.id])

  const [grading, setGrading] = useState<ReviewRating | null>(null)
  const [gradeError, setGradeError] = useState<unknown>(null)
  const [gradeStale, setGradeStale] = useState(false)

  const refreshDue = useCallback(() => {
    setRequestedIds([])
    setPickedId(null)
    void client.invalidateQueries({ queryKey: flashcardsDueKey(deckId) })
  }, [client, deckId])

  const grade = useCallback(async (rating: ReviewRating) => {
    if (!card || !cardVersionId || grading) return
    setGrading(rating)
    setGradeError(null)
    setGradeStale(false)
    try {
      // One key per grading press; a same-key retry replays the same review.
      await flashcardsApi.review(deckId, reviewInput(cardVersionId, card, rating, clampElapsedMs(shownAt.current || Date.now(), Date.now())), newIdempotencyKey())
      setReviewedIds((current) => (current.includes(card.id) ? current : [...current, card.id]))
      setPickedId(null)
    } catch (failure) {
      if (isApiError(failure, 'FLASHCARD_VERSION_CHANGED') || isApiError(failure, 'FLASHCARD_REVIEW_CONFLICT')) {
        // The deck moved on: refresh and let the learner grade the current card again.
        setGradeStale(true)
        refreshDue()
      }
      setGradeError(failure)
    } finally {
      setGrading(null)
    }
  }, [card, cardVersionId, grading, deckId, refreshDue])

  const reveal = useCallback(() => {
    if (!card || !online) return
    setRequestedIds((current) => (current.includes(card.id) ? current : [...current, card.id]))
  }, [card, online])
  const jumpTo = useCallback((cardId: string) => setPickedId(cardId), [])
  const reviewed = useCallback((cardId: string) => reviewedIds.includes(cardId), [reviewedIds])
  const clearGradeError = useCallback(() => { setGradeError(null); setGradeStale(false) }, [])

  const [regenState, setRegenState] = useState<DeckReviewValue['regenState']>('idle')
  const [regenError, setRegenError] = useState<unknown>(null)
  const regenPending = pending?.mode === 'REGENERATE' && pending.deckId === deckId ? pending : null
  const regenQuery = useQuery({
    queryKey: regenPending ? flashcardGenerationKey(regenPending.jobId) : ['flashcard-generation', 'idle'],
    queryFn: ({ signal }) => flashcardsApi.generation(regenPending?.jobId ?? '', signal),
    enabled: regenPending !== null,
    refetchInterval: (query) => (query.state.data && generationOutcome(query.state.data.state) === 'pending' ? FLASHCARD_GENERATION_POLL_MS : false),
    meta: { silentErrors: true },
  })
  const regenGeneration = regenPending ? regenQuery.data ?? null : null
  const regenOutcome = regenGeneration ? generationOutcome(regenGeneration.state) : null

  // A finished replacement publishes a new version: follow it with a fresh due list.
  useEffect(() => {
    if (!regenPending || regenOutcome === 'pending' || regenOutcome === null) return
    if (regenOutcome === 'ready') {
      clearGeneration()
      // eslint-disable-next-line react-hooks/set-state-in-effect -- settle regen state when the polled replacement finishes
      setRegenState('idle')
      setRegenError(null)
      refreshDue()
    } else {
      setRegenState('failed')
    }
  }, [regenPending, regenOutcome, clearGeneration, refreshDue])

  const requestRegen = useCallback(() => { setRegenError(null); setRegenState('confirming') }, [])
  const cancelRegen = useCallback(() => setRegenState('idle'), [])
  const confirmRegen = useCallback(async () => {
    if (!card || regenState === 'working') return
    setRegenState('working')
    setRegenError(null)
    try {
      const accepted = await flashcardsApi.regenerate(deckId, [card.id], newIdempotencyKey())
      trackGeneration({ jobId: accepted.generation.id, deckId, mode: 'REGENERATE' })
    } catch (failure) {
      if (isApiError(failure, 'FLASHCARD_VERSION_CHANGED') || isApiError(failure, 'FLASHCARD_DECK_NOT_READY')) refreshDue()
      setRegenError(failure)
      setRegenState('failed')
    }
  }, [card, regenState, deckId, trackGeneration, refreshDue])

  return useMemo<DeckReviewValue>(() => ({
    online,
    items,
    dueStatus: {
      loading: dueQuery.isPending,
      error: dueQuery.isError ? dueQuery.error : null,
      retry: () => void dueQuery.refetch(),
      hasMore: dueQuery.hasNextPage,
      loadMore: () => void dueQuery.fetchNextPage(),
      loadingMore: dueQuery.isFetchingNextPage,
    },
    reviewedCount: reviewedIds.length,
    card,
    cardVersionId,
    jumpTo,
    reviewed,
    reveal,
    revealed,
    revealStatus: {
      loading: revealQuery.isPending,
      error: revealQuery.isError ? revealQuery.error : null,
      retry: () => void revealQuery.refetch(),
    },
    grade,
    grading,
    gradeError,
    clearGradeError,
    gradeStale,
    regenState,
    requestRegen,
    cancelRegen,
    confirmRegen,
    regenError: regenError ?? (regenQuery.isError ? regenQuery.error : null) ?? (regenOutcome === 'failed' && regenGeneration && generationFailureCode(regenGeneration) ? new ApiError(500, generationFailureCode(regenGeneration) as string, null, null) : null),
    regenProgress: regenPending && regenOutcome === 'pending' ? 'Writing replacement cards…' : null,
  }), [online, items, dueQuery, reviewedIds, card, cardVersionId, jumpTo, reviewed, reveal, revealed, revealQuery, grade, grading, gradeError, clearGradeError, gradeStale, regenState, requestRegen, cancelRegen, confirmRegen, regenError, regenQuery, regenOutcome, regenGeneration, regenPending])
}
