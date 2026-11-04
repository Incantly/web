import type {
  Artifact,
  ArtifactList,
  ArtifactStatus,
  ArtifactGeneration,
  ArtifactType,
  ArtifactVersion,
  GenerationProgress,
  GenerationState,
  PreviewBatch,
  QuizPreferencesInput,
  QuizQuestionType,
  VersionContent,
} from '../../../lib/api/artifacts'
import { readText } from './quizModel'
import {
  buildDeckScope,
  scopeSelectionError as deckScopeSelectionError,
  type DeckScopeSelection,
} from './flashcardModel'

/** How often a quiz generation or question replacement re-reads its progress while polling. */
export const ARTIFACT_GENERATION_POLL_MS = 2000
/** Questions per quiz (server range 3–30). */
export const QUIZ_ITEM_COUNT_MIN = 3
export const QUIZ_ITEM_COUNT_MAX = 30
/** Items per choice, matching, or ordering question (server range 3–5). */
export const QUIZ_OPTION_COUNT_MIN = 3
export const QUIZ_OPTION_COUNT_MAX = 5
/** Time limit in minutes (server range 1–240; omit for untimed). */
export const QUIZ_DURATION_MIN = 1
export const QUIZ_DURATION_MAX = 240
/** Questions per replacement request (server range 1–8). */
export const ARTIFACT_REGEN_MIN = 1
export const ARTIFACT_REGEN_MAX = 8

/** A generation's outcome for the UI: still working, ready to open, or stopped. Unknown states read as "in progress" (the guide's rule). */
export function generationOutcome(state: GenerationState): 'pending' | 'ready' | 'failed' {
  if (state === 'COMPLETED') return 'ready'
  if (state === 'FAILED' || state === 'CANCELED' || state === 'EXPIRED' || state === 'AWAITING_CLARIFICATION') return 'failed'
  return 'pending'
}

/**
 * The generation's stable failure code, if it stopped. The generated schema
 * types it as an empty record, but the wire carries a string code.
 */
export function generationFailureCode(generation: ArtifactGeneration): string | null {
  return readText(generation.failureCode as unknown)
}

/** The published version id once the generation completed, else null. */
export function generationVersionId(generation: ArtifactGeneration): string | null {
  return readText(generation.versionId as unknown)
}

/** Validated items across every preview batch so far (questions for quizzes, cards for decks). */
export function previewItemCount(preview: readonly PreviewBatch[]): number {
  return preview.reduce((count, batch) => count + batch.questions.length + (batch.cards?.length ?? 0), 0)
}

/** Validated items ready so far: the progress count, or the preview batches when ahead of it. */
export function generationReadyCount(generation: ArtifactGeneration): number {
  const ready = generation.type === 'FLASHCARD_DECK' ? (generation.progress.cardsReady ?? 0) : generation.progress.questionsReady
  return Math.max(ready, previewItemCount(generation.preview))
}

/** "8 questions ready…" style progress copy from the generation's validated batches so far. */
export function generationProgressCopy(generation: ArtifactGeneration): string {
  const count = generationReadyCount(generation)
  if (count <= 0) return 'Reading your material…'
  const noun = generation.type === 'FLASHCARD_DECK' ? (count === 1 ? 'card' : 'cards') : count === 1 ? 'question' : 'questions'
  return `${count} ${noun} ready…`
}

/** One live line: the state ("Writing questions (1 of 3 batches)…") plus the ready count once items arrive. */
export function generationProgressLine(generation: ArtifactGeneration): string {
  const state = generationStateCopy(generation.state, generation.progress)
  const count = generationReadyCount(generation)
  if (count <= 0) return state
  const noun = generation.type === 'FLASHCARD_DECK' ? (count === 1 ? 'card' : 'cards') : count === 1 ? 'question' : 'questions'
  return `${state.replace(/…$/, '')} · ${count} ${noun} ready…`
}

/**
 * Plain words for a generation state. Mid-generation states name the batch
 * position ("Writing questions (2 of 3 batches)…", the guide's example);
 * unknown states read as "Working…".
 */
export function generationStateCopy(state: GenerationState, progress?: GenerationProgress): string {
  switch (state) {
    case 'REQUESTED':
    case 'AUTHORIZED':
    case 'SCOPE_RESOLVED':
    case 'BUDGET_RESERVED':
      return 'Checking what it covers…'
    case 'CONTEXT_PLANNED':
    case 'EVIDENCE_RETRIEVED':
      return 'Finding material…'
    case 'ROUTED':
    case 'GENERATING':
    case 'VALIDATING': {
      const batches = progress?.batches ?? 0
      const done = progress?.completedBatches ?? 0
      return batches > 0 ? `Writing questions (${Math.min(done, batches)} of ${batches} batches)…` : 'Writing questions…'
    }
    case 'PERSISTING':
      return 'Saving…'
    case 'COMPLETED':
      return 'Ready'
    case 'FAILED':
      return 'Failed'
    case 'CANCELED':
      return 'Canceled'
    case 'EXPIRED':
      return 'Expired'
    case 'AWAITING_CLARIFICATION':
      return 'Paused'
    default:
      return 'Working…'
  }
}

/** Plain words for an artifact's list status. */
export function artifactStatusCopy(status: ArtifactStatus): string {
  switch (status) {
    case 'GENERATING':
      return 'Generating'
    case 'READY':
      return 'Ready'
    case 'FAILED':
      return 'Failed'
    case 'ARCHIVED':
      return 'Archived'
  }
}

/** Plain words for an artifact's type. */
export function artifactTypeCopy(type: ArtifactType): string {
  return type === 'QUIZ' ? 'Quiz' : 'Flashcard deck'
}

/** Where an artifact opens for taking or review: the existing quiz or deck view. */
export function artifactOpenView(artifact: Pick<Artifact, 'id' | 'type'>): `quiz:${string}` | `deck:${string}` {
  return artifact.type === 'QUIZ' ? `quiz:${artifact.id}` : `deck:${artifact.id}`
}

/**
 * The artifact list's `nextCursor`, or null on the last page. The generated
 * schema types it as an empty record, but the wire carries an opaque string.
 */
export function artifactListCursor(page: ArtifactList): string | null {
  return readText(page.nextCursor as unknown)
}

/** True when the version is the artifact's current one (null-safe: no current version means none is). */
export function isCurrentVersion(artifact: Pick<Artifact, 'currentVersion'>, versionId: string): boolean {
  return artifact.currentVersion?.id === versionId
}

/**
 * The version to show: the explicit pick while it is still listed, else the
 * newest (versions arrive newest first), else null when there are none.
 */
export function selectVersionId(versions: readonly ArtifactVersion[], selectedId: string | null): string | null {
  if (selectedId && versions.some((version) => version.id === selectedId)) return selectedId
  return versions[0]?.id ?? null
}

/** "Version 3 · current" style label for a version row. */
export function versionLabel(version: Pick<ArtifactVersion, 'versionNumber'>, current: boolean): string {
  return current ? `Version ${version.versionNumber} · current` : `Version ${version.versionNumber}`
}

/** A version's display title: its quiz or deck title, else "Version N". */
export function versionContentTitle(content: Pick<VersionContent, 'versionNumber' | 'quiz' | 'deck'>): string {
  return content.quiz?.title || content.deck?.title || `Version ${content.versionNumber}`
}

/** What the quiz covers: every `AiScopeDto` kind the generation endpoint accepts (same picker as decks). */
export type ArtifactScopeSelection = DeckScopeSelection
export type ArtifactScopeKind = DeckScopeSelection['kind']
export const buildArtifactScope = buildDeckScope
export const artifactScopeSelectionError = deckScopeSelectionError

export type QuizDifficulty = NonNullable<QuizPreferencesInput['difficulty']>

export const QUESTION_TYPES: { type: QuizQuestionType; label: string; help: string }[] = [
  { type: 'SINGLE_CHOICE', label: 'Single choice', help: 'One right answer out of 3–5 options.' },
  { type: 'TRUE_FALSE', label: 'True/false', help: 'Quick checks, about one in five by default.' },
  { type: 'MULTIPLE_SELECT', label: 'Multiple select', help: 'Every right option, no partial credit.' },
  { type: 'SHORT_ANSWER', label: 'Short answer', help: 'A short factual completion.' },
  { type: 'FILL_IN_THE_BLANK', label: 'Fill in the blank', help: 'Complete the sentence.' },
  { type: 'MATCHING', label: 'Matching', help: 'Pair each item on the left.' },
  { type: 'ORDERING', label: 'Ordering', help: 'Put the steps in order.' },
]

export type QuizPreferencesForm = {
  title: string
  topic: string
  language: string
  difficulty: QuizDifficulty
  itemCount: number
  questionTypes: QuizQuestionType[]
  optionCount: number
  /** Time limit in minutes, or null for untimed. */
  durationMinutes: number | null
}

export const DEFAULT_QUIZ_PREFERENCES: QuizPreferencesForm = {
  title: '',
  topic: '',
  language: 'en',
  difficulty: 'MIXED',
  itemCount: 10,
  questionTypes: ['SINGLE_CHOICE', 'TRUE_FALSE'],
  optionCount: 4,
  durationMinutes: null,
}

/** The preferences for the generation request: trimmed, clamped, and defaulted like the server. */
export function buildQuizPreferences(form: QuizPreferencesForm): QuizPreferencesInput {
  const title = form.title.trim()
  const topic = form.topic.trim()
  const language = form.language.trim() || 'en'
  const itemCount = Math.min(QUIZ_ITEM_COUNT_MAX, Math.max(QUIZ_ITEM_COUNT_MIN, Math.round(form.itemCount) || QUIZ_ITEM_COUNT_MIN))
  const optionCount = Math.min(QUIZ_OPTION_COUNT_MAX, Math.max(QUIZ_OPTION_COUNT_MIN, Math.round(form.optionCount) || QUIZ_OPTION_COUNT_MIN))
  const questionTypes = form.questionTypes.length > 0 ? [...new Set(form.questionTypes)] : (['SINGLE_CHOICE', 'TRUE_FALSE'] as const)
  const durationMinutes = form.durationMinutes === null ? undefined : Math.min(QUIZ_DURATION_MAX, Math.max(QUIZ_DURATION_MIN, Math.round(form.durationMinutes)))
  return {
    ...(title ? { title } : {}),
    ...(topic ? { topic } : {}),
    language,
    difficulty: form.difficulty ?? 'MIXED',
    itemCount,
    questionTypes: [...questionTypes],
    optionCount,
    ...(durationMinutes === undefined ? {} : { durationMinutes }),
  }
}
