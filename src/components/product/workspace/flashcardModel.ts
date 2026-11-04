import type { CardType, DeckGeneration, DeckPreferencesInput, DeckScope, DueCard, DueCards, ReviewCardInput, ReviewRating, RevealedCard } from '../../../lib/api/flashcards'
import { readText } from './quizModel'

/** Due cards per page (server allows 1–40). */
export const FLASHCARD_DUE_LIMIT = 20
/** How often a deck generation or card replacement re-reads its progress. */
export const FLASHCARD_GENERATION_POLL_MS = 2000
/** Facts per deck (server range 5–40; each REVERSE fact becomes two cards). */
export const FLASHCARD_ITEM_COUNT_MIN = 5
export const FLASHCARD_ITEM_COUNT_MAX = 40
/** Cards per replacement request (server range 1–8). */
export const FLASHCARD_REGEN_MAX = 8
/** Reviews accept 0–3,600,000 ms of elapsed thinking time. */
export const REVIEW_ELAPSED_MS_MAX = 3_600_000

/** The four review grades, exactly the `ReviewCardDto.rating` enum, easiest to hardest to forget. */
export const REVIEW_GRADES: { rating: ReviewRating; label: string; hint: string }[] = [
  { rating: 'AGAIN', label: 'Again', hint: 'Forgot it — see it soon' },
  { rating: 'HARD', label: 'Hard', hint: 'Recalled with effort' },
  { rating: 'GOOD', label: 'Good', hint: 'Recalled confidently' },
  { rating: 'EASY', label: 'Easy', hint: 'Knew it instantly' },
]

export const CARD_TYPES: { type: CardType; label: string; help: string }[] = [
  { type: 'BASIC', label: 'Basic', help: 'A question with an answer.' },
  { type: 'REVERSE', label: 'Reversible', help: 'Each fact becomes two cards, both directions.' },
  { type: 'CLOZE', label: 'Fill in the blank', help: 'A sentence with one blank to recall.' },
]

/** Elapsed thinking time for a review, clamped to the server's 0–3,600,000 ms range. */
export function clampElapsedMs(shownAt: number, now: number): number {
  const elapsed = Math.round(now - shownAt)
  if (!Number.isFinite(elapsed) || elapsed < 0) return 0
  return Math.min(elapsed, REVIEW_ELAPSED_MS_MAX)
}

/** The review body for one grading press: the due response's version and state version, never invented. */
export function reviewInput(versionId: string, card: Pick<DueCard, 'id' | 'stateVersion'>, rating: ReviewRating, elapsedMs: number): ReviewCardInput {
  return { versionId, cardId: card.id, rating, elapsedMs, expectedStateVersion: card.stateVersion }
}

/**
 * The due list's `nextCursor`, or null on the last page. The generated schema
 * types it as an empty record, but the wire carries an opaque string.
 */
export function dueNextCursor(page: DueCards): string | null {
  return readText(page.nextCursor as unknown)
}

/** Due cards not yet reviewed this session, in server order. */
export function remainingCards(items: DueCard[], reviewedIds: readonly string[]): DueCard[] {
  return items.filter((card) => !reviewedIds.includes(card.id))
}

/** The card under review: an explicit pick while it is still due, else the first remaining card. */
export function currentCard(items: DueCard[], reviewedIds: readonly string[], pickedId: string | null): DueCard | null {
  const remaining = remainingCards(items, reviewedIds)
  return (pickedId ? remaining.find((card) => card.id === pickedId) : undefined) ?? remaining[0] ?? null
}

/** "3 of 12 due" style queue copy. `hasMore` means further pages are still loading in. */
export function dueQueueCopy(remaining: number, reviewed: number, hasMore: boolean): string {
  const total = remaining + reviewed
  if (total === 0) return 'No cards due'
  if (remaining === 0) return hasMore ? `All ${total} loaded cards reviewed` : `All ${total} reviewed`
  const head = reviewed === 0 ? `${remaining} due` : `${remaining} of ${total} left`
  return hasMore ? `${head} (more loading)` : head
}

/** Splits a front on its `[[c1]]` cloze marker into text and blank runs (render the blank as a gap, never HTML). */
export function splitCloze(front: string): ({ kind: 'text'; text: string } | { kind: 'blank'; id: string })[] {
  const runs: ({ kind: 'text'; text: string } | { kind: 'blank'; id: string })[] = []
  const marker = /\[\[([^\]]+)\]\]/g
  let cursor = 0
  let match: RegExpExecArray | null
  while ((match = marker.exec(front)) !== null) {
    if (match.index > cursor) runs.push({ kind: 'text', text: front.slice(cursor, match.index) })
    runs.push({ kind: 'blank', id: match[1] })
    cursor = match.index + match[0].length
  }
  if (cursor < front.length) runs.push({ kind: 'text', text: front.slice(cursor) })
  return runs
}

/** Plain words for a card type, with the REVERSE direction the learner is being tested on. */
export function cardTypeLabel(card: Pick<DueCard, 'type' | 'direction'>): string {
  if (card.type === 'REVERSE') return card.direction === 'REVERSE' ? 'Reversible · back to front' : 'Reversible · front to back'
  if (card.type === 'CLOZE') return 'Fill in the blank'
  return 'Basic'
}

/** A generation's outcome for the UI: still working, ready to review, or stopped with a failure code. */
export function generationOutcome(state: DeckGeneration['state']): 'pending' | 'ready' | 'failed' {
  if (state === 'COMPLETED') return 'ready'
  if (state === 'FAILED' || state === 'CANCELED' || state === 'EXPIRED' || state === 'AWAITING_CLARIFICATION') return 'failed'
  return 'pending'
}

/** "8 cards ready…" style progress copy from the generation's validated batches so far. */
export function generationProgressCopy(generation: DeckGeneration): string {
  const ready = generation.progress.cardsReady ?? 0
  const previewed = generation.preview.reduce((count, batch) => count + (batch.cards?.length ?? 0), 0)
  const count = Math.max(ready, previewed)
  return count > 0 ? `${count} ${count === 1 ? 'card' : 'cards'} ready…` : 'Reading your material…'
}

/**
 * The generation's stable failure code, if it stopped. The generated schema
 * types it as an empty record, but the wire carries a string code.
 */
export function generationFailureCode(generation: DeckGeneration): string | null {
  return readText(generation.failureCode as unknown)
}

/** The published version id once the generation completed, else null. */
export function generationVersionId(generation: DeckGeneration): string | null {
  return readText(generation.versionId as unknown)
}

/** What the deck covers: every `AiScopeDto` kind the generation endpoint accepts. */
export type DeckScopeKind = DeckScope['kind']
export type DeckScopeSelection =
  | { kind: 'NOTE'; noteId: string }
  | { kind: 'SPACE'; spaceId: string }
  | { kind: 'SELECTED_SOURCES'; sourceIds: string[] }
  | { kind: 'LIBRARY' }

/** The scope for the generation request, or null while the picker is incomplete. */
export function buildDeckScope(selection: DeckScopeSelection): DeckScope | null {
  switch (selection.kind) {
    case 'NOTE':
      return selection.noteId ? { kind: 'NOTE', noteId: selection.noteId } : null
    case 'SPACE':
      return selection.spaceId ? { kind: 'SPACE', spaceId: selection.spaceId } : null
    case 'SELECTED_SOURCES':
      return selection.sourceIds.length > 0 ? { kind: 'SELECTED_SOURCES', sourceIds: [...selection.sourceIds] } : null
    case 'LIBRARY':
      return { kind: 'LIBRARY' }
  }
}

/** Why the Generate button stays disabled, or null when the scope is complete. */
export function scopeSelectionError(selection: DeckScopeSelection): string | null {
  switch (selection.kind) {
    case 'NOTE':
      return selection.noteId ? null : 'Choose the note to make cards from.'
    case 'SPACE':
      return selection.spaceId ? null : 'Choose the Space to make cards from.'
    case 'SELECTED_SOURCES':
      return selection.sourceIds.length > 0 ? null : 'Pick at least one source to make cards from.'
    case 'LIBRARY':
      return null
  }
}

export type DeckPreferencesForm = {
  title: string
  topic: string
  language: string
  difficulty: DeckPreferencesInput['difficulty']
  itemCount: number
  cardTypes: CardType[]
}

export const DEFAULT_DECK_PREFERENCES: DeckPreferencesForm = {
  title: '',
  topic: '',
  language: 'en',
  difficulty: 'MIXED',
  itemCount: 20,
  cardTypes: ['BASIC'],
}

/** The preferences for the generation request: trimmed, clamped, and defaulted like the server. */
export function buildDeckPreferences(form: DeckPreferencesForm): DeckPreferencesInput {
  const title = form.title.trim()
  const topic = form.topic.trim()
  const language = form.language.trim() || 'en'
  const itemCount = Math.min(FLASHCARD_ITEM_COUNT_MAX, Math.max(FLASHCARD_ITEM_COUNT_MIN, Math.round(form.itemCount) || FLASHCARD_ITEM_COUNT_MIN))
  const cardTypes = form.cardTypes.length > 0 ? [...new Set(form.cardTypes)] : ['BASIC' as const]
  return { ...(title ? { title } : {}), ...(topic ? { topic } : {}), language, difficulty: form.difficulty ?? 'MIXED', itemCount, cardTypes }
}

/** True while the reveal response below belongs to the card under review (stale reveals never draw). */
export function isCurrentReveal(revealed: RevealedCard, deckVersionId: string, cardId: string): boolean {
  return revealed.versionId === deckVersionId && revealed.id === cardId
}
