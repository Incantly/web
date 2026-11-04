import { apiFetch } from './client'
import type { Schema } from './types'

export type DeckScope = Schema<'AiScopeDto'>
export type DeckPreferences = Schema<'DeckPreferencesDto'>
/** `cardTypes`, `language`, `difficulty`, and `itemCount` have server defaults (the generated schema marks them required). */
export type DeckPreferencesInput = Partial<Pick<DeckPreferences, 'cardTypes' | 'language' | 'difficulty' | 'itemCount'>> & Pick<DeckPreferences, 'title' | 'topic'>
export type CardType = DeckPreferences['cardTypes'][number]
export type DeckGeneration = Schema<'GenerationDto'>
export type DeckGenerationAccepted = Schema<'GenerationAcceptedDto'>
export type DueCard = Schema<'DueCardDto'>
export type DueCards = Schema<'DueCardsDto'>
export type RevealedCard = Schema<'RevealedCardDto'>
export type ReviewRating = Schema<'ReviewCardDto'>['rating']
export type ReviewCardInput = Schema<'ReviewCardDto'>
export type CardReview = Schema<'CardReviewDto'>
export type CardSchedule = Schema<'CardScheduleDto'>

const id = (value: string) => encodeURIComponent(value)

/** Thin wrappers over the flashcard-deck routes (frontend-api-integration.md, "Flashcards"). Review scheduling is server-side: the client requests due cards, reveals, and posts reviews. */
export const flashcardsApi = {
  /** Starts generating a deck from the user's material. `202 { created, generation }`; follow the generation until COMPLETED. One idempotency key per Generate press. */
  async generate(scope: DeckScope, preferences: DeckPreferencesInput | undefined, idempotencyKey: string) {
    const body: Schema<'CreateDeckDto'> = preferences ? { scope, preferences: preferences as DeckPreferences } : { scope }
    return (await apiFetch<DeckGenerationAccepted>('/v1/flashcard-decks/generations', { method: 'POST', body, idempotencyKey })).data
  },
  /** Reads one artifact generation (deck create or card replacement) for its progress state. Shared artifact-jobs route, not deck-scoped. */
  async generation(jobId: string, signal?: AbortSignal) {
    return (await apiFetch<DeckGeneration>(`/v1/artifact-jobs/${id(jobId)}`, { signal })).data
  },
  /** The cards due for review, fronts only (backs need the explicit reveal). `limit` 1–40, default 20; pass `nextCursor` unchanged for the next page. */
  async due(deckId: string, options: { limit?: number; cursor?: string } = {}, signal?: AbortSignal) {
    const params = new URLSearchParams()
    if (options.limit !== undefined) params.set('limit', String(options.limit))
    if (options.cursor !== undefined) params.set('cursor', options.cursor)
    const query = params.toString()
    return (await apiFetch<DueCards>(`/v1/flashcard-decks/${id(deckId)}/due${query ? `?${query}` : ''}`, { signal })).data
  },
  /** Reveals one card's answer: front, `back`, and citation locations. Backs appear only here. */
  async reveal(deckId: string, versionId: string, cardId: string, signal?: AbortSignal) {
    return (await apiFetch<RevealedCard>(`/v1/flashcard-decks/${id(deckId)}/versions/${id(versionId)}/cards/${id(cardId)}`, { signal })).data
  },
  /** Reviews a card with the learner's rating and the state version from the due response. The server picks the next date; the response carries the new schedule. */
  async review(deckId: string, body: ReviewCardInput, idempotencyKey: string) {
    return (await apiFetch<CardReview>(`/v1/flashcard-decks/${id(deckId)}/reviews`, { method: 'POST', body, idempotencyKey })).data
  },
  /** Replaces 1–8 cards with freshly generated ones. Other cards keep their text and schedules; replaced cards start due. `202`; follow the generation, then refresh the due list. */
  async regenerate(deckId: string, cardIds: string[], idempotencyKey: string) {
    return (await apiFetch<DeckGenerationAccepted>(`/v1/flashcard-decks/${id(deckId)}/regenerations`, { method: 'POST', body: { cardIds }, idempotencyKey })).data
  },
}
