'use client'

import { AppIcon } from '../AppIcon'
import { useNavigation } from '@/hooks/use-navigation'
import { useDeckGenerate, useDeckReview, type DeckGenerateValue, type DeckReviewValue } from '@/hooks/use-flashcards'
import type { DueCard, RevealedCard } from '../../../lib/api/flashcards'
import { apiErrorMessage } from '../../../lib/api/errors'
import {
  CARD_TYPES,
  FLASHCARD_ITEM_COUNT_MAX,
  FLASHCARD_ITEM_COUNT_MIN,
  REVIEW_GRADES,
  cardTypeLabel,
  dueQueueCopy,
  splitCloze,
  type DeckScopeKind,
} from './flashcardModel'
import { citationCopy } from './quizModel'
import { readText } from './quizModel'
import { ConfirmDialog, EmptyState, ErrorState, ListSkeleton, PageFrame, PageHeading, buttonPrimary, buttonQuiet, buttonSecondary, inputClass, labelClass } from './ui'

/** The deck screen: the new-deck form at `?deck=new`, otherwise the review queue. */
export function DeckView({ deckId }: { deckId: string }) {
  if (deckId === 'new') return <DeckGenerateScreen />
  return <DeckReviewScreen key={deckId} deckId={deckId} />
}

function OfflineNotice({ copy }: { copy: string }) {
  return <div role="status" className="mt-6 flex items-center gap-2 rounded-xl border border-default bg-surface px-4 py-3 text-sm text-muted">
    <AppIcon name="alert" className="size-4 shrink-0" />{copy}
  </div>
}

const SCOPE_KINDS: { kind: DeckScopeKind; label: string; help: string }[] = [
  { kind: 'NOTE', label: 'One note', help: 'Cards from a single note.' },
  { kind: 'SPACE', label: 'A Space', help: 'Cards from a Space’s notes and sources.' },
  { kind: 'SELECTED_SOURCES', label: 'Sources', help: 'Cards from sources you pick.' },
  { kind: 'LIBRARY', label: 'Everything', help: 'Cards from all your notes and sources.' },
]

function DeckGenerateScreen() {
  const value = useDeckGenerate()
  const { navigate } = useNavigation()
  const { online, readyDeckId, generation, generationProgress } = value
  if (readyDeckId) return <PageFrame>
    <PageHeading title="Deck ready" subtitle="Your cards are written and due for review." />
    <div className="mt-8"><EmptyState icon="checkCircle" title="Your deck is ready"
      body="Start with the first due card. Reviews schedule each card’s next appearance."
      action={<button type="button" onClick={() => navigate(`deck:${readyDeckId}`)} className={buttonPrimary}>Start reviewing</button>} /></div>
  </PageFrame>
  if (generation) return <GenerationProgressScreen value={value} />
  return <PageFrame>
    <PageHeading title="New deck" subtitle="Pick what the cards cover, tune the options, and we’ll write the deck." />
    {!online ? <OfflineNotice copy="You’re offline. Reconnect to make a deck." /> : null}
    <GenerateForm value={value} />
    {generationProgress ? <p role="status" className="mt-6 text-sm text-muted">{generationProgress}</p> : null}
  </PageFrame>
}

function GenerationProgressScreen({ value }: { value: DeckGenerateValue }) {
  const { online, generation, generationStatus, generationProgress, generationFailure, generating, retryGenerate, backToForm } = value
  return <PageFrame>
    <PageHeading title="Making your deck" subtitle="Cards are written in batches. This page follows along on its own."
      actions={<button type="button" onClick={backToForm} className={buttonSecondary}>Back to options</button>} />
    {!online ? <OfflineNotice copy="You’re offline. The deck keeps generating; progress resumes when you reconnect." /> : null}
    <div className="mt-8">
      {generationStatus.loading ? <ListSkeleton rows={2} label="Reading generation progress" />
        : generationStatus.error ? <ErrorState message={apiErrorMessage(generationStatus.error)} onRetry={generationStatus.retry} />
        : generationFailure ? <ErrorState message={apiErrorMessage(generationFailure)} onRetry={() => void retryGenerate()} />
        : <div role="status" className="flex items-center gap-3 rounded-[1.15rem] border border-default bg-raised p-5">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-surface text-muted"><AppIcon name="card" className="size-5" /></span>
          <span className="min-w-0">
            <span className="block text-base font-medium text-foreground">{generationProgress ?? 'Starting…'}</span>
            <span className="mt-0.5 block text-sm text-muted">Safe to leave — the deck keeps generating{generation?.reused ? ' (matched your existing deck, no charge)' : ''}.</span>
          </span>
        </div>}
      {generationFailure ? <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" onClick={() => void retryGenerate()} disabled={generating || !online} className={buttonPrimary}>{generating ? 'Trying again…' : 'Try again'}</button>
        <button type="button" onClick={backToForm} className={buttonSecondary}>Change what it covers</button>
      </div> : null}
    </div>
  </PageFrame>
}

function GenerateForm({ value }: { value: DeckGenerateValue }) {
  const {
    online, scopeKind, setScopeKind, scope, setNoteId, setSpaceId, toggleSourceId,
    preferences, setPreferences, toggleCardType, noteOptions, spaceOptions, sourceOptions,
    optionsStatus, scopeError, generate, generating, generateError, clearGenerateError,
  } = value
  const disabled = generating || !online || optionsStatus.loading
  return <div className="mt-8 grid gap-8">
    {generateError ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger bg-danger-surface px-4 py-3 text-sm text-danger">
      <span className="min-w-0 flex-1 basis-48">{apiErrorMessage(generateError)}</span>
      <button type="button" onClick={clearGenerateError} className="min-h-11 rounded-lg px-3 font-semibold hover:bg-raised">Dismiss</button>
    </div> : null}
    {optionsStatus.loading ? <ListSkeleton rows={3} label="Loading your notes and sources" />
      : optionsStatus.error ? <ErrorState message={apiErrorMessage(optionsStatus.error)} onRetry={optionsStatus.retry} />
      : <fieldset disabled={disabled}>
        <legend className="text-sm font-semibold text-foreground">What should the cards cover?</legend>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {SCOPE_KINDS.map((option) => <label key={option.kind} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-default bg-raised px-3.5 py-2.5 transition-colors has-checked:border-button">
            <input type="radio" name="deck-scope" checked={scopeKind === option.kind} onChange={() => setScopeKind(option.kind)} className="mt-1 size-5 shrink-0 accent-button" />
            <span className="min-w-0"><span className="block text-base text-foreground">{option.label}</span><span className="block text-sm text-muted">{option.help}</span></span>
          </label>)}
        </div>
        <div className="mt-4">
          {scope.kind === 'NOTE' ? (noteOptions.length ? <><label htmlFor="deck-note" className={labelClass}>Note</label>
            <select id="deck-note" value={scope.noteId} onChange={(event) => setNoteId(event.target.value)} className="min-h-11 w-full rounded-xl border border-default bg-surface px-3 text-base text-foreground">
              <option value="">Choose a note…</option>
              {noteOptions.map((note) => <option key={note.id} value={note.id}>{note.title}</option>)}
            </select></> : <EmptyState icon="document" title="No notes yet" body="Write a note first, then make cards from it." />)
            : scope.kind === 'SPACE' ? (spaceOptions.length ? <><label htmlFor="deck-space" className={labelClass}>Space</label>
              <select id="deck-space" value={scope.spaceId} onChange={(event) => setSpaceId(event.target.value)} className="min-h-11 w-full rounded-xl border border-default bg-surface px-3 text-base text-foreground">
                <option value="">Choose a Space…</option>
                {spaceOptions.map((space) => <option key={space.id} value={space.id}>{space.name}</option>)}
              </select></> : <EmptyState icon="space" title="No active Spaces" body="Make a Space first, or cover everything instead." />)
            : scope.kind === 'SELECTED_SOURCES' ? (sourceOptions.length ? <fieldset>
              <legend className={labelClass}>Sources ({scope.sourceIds.length} picked)</legend>
              <ul className="mt-2 grid gap-1">
                {sourceOptions.map((source) => <li key={source.id}><label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-surface">
                  <input type="checkbox" checked={scope.sourceIds.includes(source.id)} onChange={() => toggleSourceId(source.id)} className="size-5 shrink-0 accent-button" />
                  <span className="min-w-0 truncate text-base text-foreground">{source.title}</span>
                </label></li>)}
              </ul>
            </fieldset> : <EmptyState icon="library" title="No ready sources" body="Add a source to your Library first, or cover everything instead." />)
            : <p className="rounded-xl border border-default bg-surface px-4 py-3 text-sm text-muted">Covers all your notes and sources. You chose this explicitly — nothing wider is searched.</p>}
        </div>
      </fieldset>}
    <fieldset disabled={disabled} className="grid gap-4">
      <legend className="text-sm font-semibold text-foreground">Options</legend>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label htmlFor="deck-title" className={labelClass}>Title (optional)</label>
          <input id="deck-title" type="text" value={preferences.title} onChange={(event) => setPreferences({ title: event.target.value })} placeholder="e.g. Networking basics" className={inputClass} /></div>
        <div><label htmlFor="deck-topic" className={labelClass}>Topic focus (optional)</label>
          <input id="deck-topic" type="text" value={preferences.topic} onChange={(event) => setPreferences({ topic: event.target.value })} placeholder="e.g. network protocols" className={inputClass} /></div>
        <div><label htmlFor="deck-difficulty" className={labelClass}>Difficulty</label>
          <select id="deck-difficulty" value={preferences.difficulty} onChange={(event) => setPreferences({ difficulty: event.target.value as DeckGenerateValue['preferences']['difficulty'] })} className="min-h-11 w-full rounded-xl border border-default bg-surface px-3 text-base text-foreground">
            <option value="MIXED">Mixed</option><option value="EASY">Easy</option><option value="MEDIUM">Medium</option><option value="HARD">Hard</option>
          </select></div>
        <div><label htmlFor="deck-count" className={labelClass}>Cards ({FLASHCARD_ITEM_COUNT_MIN}–{FLASHCARD_ITEM_COUNT_MAX})</label>
          <input id="deck-count" type="number" min={FLASHCARD_ITEM_COUNT_MIN} max={FLASHCARD_ITEM_COUNT_MAX} value={preferences.itemCount}
            onChange={(event) => setPreferences({ itemCount: Number(event.target.value) })} className={inputClass} /></div>
      </div>
      <fieldset>
        <legend className={labelClass}>Card types</legend>
        <div className="mt-2 grid gap-1">
          {CARD_TYPES.map((option) => <label key={option.type} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-surface">
            <input type="checkbox" checked={preferences.cardTypes.includes(option.type)} onChange={() => toggleCardType(option.type)} className="mt-1 size-5 shrink-0 accent-button" />
            <span className="min-w-0"><span className="block text-base text-foreground">{option.label}</span><span className="block text-sm text-muted">{option.help}</span></span>
          </label>)}
        </div>
      </fieldset>
    </fieldset>
    <div className="flex flex-wrap items-center justify-between gap-4 border-t border-default pt-6">
      <p className="text-sm text-muted">{scopeError ?? 'Ready when you are.'}{online ? '' : ' Reconnect to generate.'}</p>
      <button type="button" onClick={() => void generate()} disabled={disabled || scopeError !== null} className={buttonPrimary}
        title={scopeError ?? (!online ? 'Reconnect to generate' : undefined)}>
        <AppIcon name="sparkles" className="size-4" />{generating ? 'Starting…' : 'Generate deck'}
      </button>
    </div>
  </div>
}

function DeckReviewScreen({ deckId }: { deckId: string }) {
  const value = useDeckReview(deckId)
  const { online, items, dueStatus, reviewedCount, card } = value
  const remaining = items.length - reviewedCount
  return <PageFrame>
    <PageHeading title="Review deck" subtitle={dueQueueCopy(Math.max(0, remaining), reviewedCount, dueStatus.hasMore ?? false)} />
    {!online ? <OfflineNotice copy="You’re offline. Reconnect to load due cards and send reviews." /> : null}
    <div className="mt-8">
      {dueStatus.loading ? <ListSkeleton rows={3} label="Loading due cards" />
        : dueStatus.error ? <ErrorState message={apiErrorMessage(dueStatus.error)} onRetry={dueStatus.retry} />
        : items.length === 0 ? <EmptyState icon="checkCircle" title="No cards due" body="Nothing needs review right now. New cards become due on their schedule." action={<button type="button" onClick={dueStatus.retry} className={buttonSecondary}>Check again</button>} />
        : !card ? <EmptyState icon="checkCircle" title="All caught up" body={dueStatus.hasMore ? 'You reviewed every loaded card. More are still loading in.' : 'You reviewed every due card. Nice work.'}
          action={dueStatus.hasMore ? <button type="button" onClick={dueStatus.loadMore} disabled={dueStatus.loadingMore} className={buttonPrimary}>{dueStatus.loadingMore ? 'Loading…' : 'Load more cards'}</button> : <button type="button" onClick={dueStatus.retry} className={buttonSecondary}>Check again</button>} />
        : <ReviewQueue key={deckId} value={value} />}
    </div>
  </PageFrame>
}

function ReviewQueue({ value }: { value: DeckReviewValue }) {
  const { card } = value
  if (!card) return null
  return <div className="grid gap-8">
    <CurrentCard value={value} card={card} />
    <DueList value={value} />
  </div>
}

/** One front as text, with each `[[c1]]` cloze marker drawn as a blank gap. */
function FrontText({ front, cloze }: { front: string; cloze: boolean }) {
  if (!cloze) return <>{front}</>
  return <>{splitCloze(front).map((run, index) => run.kind === 'text'
    ? <span key={index}>{run.text}</span>
    : <span key={index} role="img" aria-label={`blank ${run.id}`} className="mx-1 inline-block min-w-16 rounded-md border-b-2 border-strong bg-surface px-2 text-center text-subtle">⋯</span>)}</>
}

function CurrentCard({ value, card }: { value: DeckReviewValue; card: DueCard }) {
  const {
    online, revealed, revealStatus, reveal, grade, grading, gradeError, clearGradeError, gradeStale,
    regenState, requestRegen, cancelRegen, confirmRegen, regenError, regenProgress,
  } = value
  const hint = readText(card.hint as unknown)
  return <article aria-labelledby="deck-current-front" className="rounded-[1.15rem] border border-default bg-raised p-5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{cardTypeLabel(card)}</p>
      <button type="button" onClick={requestRegen} disabled={regenState === 'working' || !online} className={buttonQuiet} title={!online ? 'Reconnect to replace this card' : undefined}>
        <AppIcon name="sparkles" className="size-4" />Replace this card
      </button>
    </div>
    <p id="deck-current-front" className="mt-2 text-lg font-medium leading-8 text-foreground"><FrontText front={card.front} cloze={card.type === 'CLOZE'} /></p>
    {hint ? <p className="mt-2 text-sm text-muted">Hint: {hint}</p> : null}
    {!revealed ? <div className="mt-5">
      {revealStatus.loading ? <ListSkeleton rows={1} label="Revealing answer" />
        : revealStatus.error ? <ErrorState message={apiErrorMessage(revealStatus.error)} onRetry={revealStatus.retry} />
        : <button type="button" onClick={reveal} disabled={!online} className={buttonSecondary} title={!online ? 'Reconnect to reveal the answer' : undefined}>Show answer</button>}
    </div> : <RevealedAnswer revealed={revealed} />}
    {revealed ? <div className="mt-6">
      <p id="deck-grade-label" className="text-sm font-semibold text-foreground">How well did you recall it?</p>
      <div role="group" aria-labelledby="deck-grade-label" className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {REVIEW_GRADES.map((option) => <button key={option.rating} type="button" onClick={() => void grade(option.rating)}
          disabled={grading !== null || !online} title={option.hint}
          className="flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-xl border border-default bg-canvas px-2 py-2 text-center transition-colors hover:border-strong hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60">
          <span className="text-sm font-semibold text-foreground">{grading === option.rating ? 'Saving…' : option.label}</span>
          <span className="text-xs text-muted">{option.hint}</span>
        </button>)}
      </div>
      {!online ? <p role="status" className="mt-2 text-sm text-muted">Reconnect to send your review.</p> : null}
    </div> : null}
    {gradeError ? <div role="alert" className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger bg-danger-surface px-4 py-3 text-sm text-danger">
      <span className="min-w-0 flex-1 basis-48">{apiErrorMessage(gradeError)}{gradeStale ? ' Grade the current card again — nothing was sent twice.' : ''}</span>
      <button type="button" onClick={clearGradeError} className="min-h-11 rounded-lg px-3 font-semibold hover:bg-raised">Dismiss</button>
    </div> : null}
    {regenProgress ? <p role="status" className="mt-5 flex items-center gap-2 text-sm text-muted"><AppIcon name="clock" className="size-4 shrink-0" />{regenProgress}</p> : null}
    {regenError ? <div role="alert" className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger bg-danger-surface px-4 py-3 text-sm text-danger">
      <span className="min-w-0 flex-1 basis-48">{apiErrorMessage(regenError)}</span>
      <button type="button" onClick={requestRegen} className="min-h-11 rounded-lg px-3 font-semibold hover:bg-raised">Try again</button>
    </div> : null}
    <ConfirmDialog open={regenState === 'confirming'} onClose={cancelRegen} onConfirm={() => void confirmRegen()}
      title="Replace this card?" body="A fresh card takes its place and starts due. Every other card keeps its text and schedule." confirmLabel={regenState === 'working' ? 'Replacing…' : 'Replace card'} />
  </article>
}

function RevealedAnswer({ revealed }: { revealed: RevealedCard }) {
  return <div className="mt-5 border-t border-default pt-5">
    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Answer</p>
    <p className="mt-1 text-base leading-7 text-foreground">{revealed.back}</p>
    {revealed.citations.length > 0 ? <ul aria-label="Sources" className="mt-3 grid gap-1.5">
      {revealed.citations.map((citation, index) => <li key={index} className="flex items-start gap-2 text-sm text-muted">
        <AppIcon name="document" className="mt-0.5 size-4 shrink-0" /><span>{citationCopy(citation)}</span>
      </li>)}
    </ul> : null}
  </div>
}

function DueList({ value }: { value: DeckReviewValue }) {
  const { items, card, dueStatus, reviewed, jumpTo, reviewedCount } = value
  return <section aria-labelledby="deck-queue-heading">
    <h2 id="deck-queue-heading" className="text-sm font-semibold text-foreground">Due queue · {reviewedCount} reviewed</h2>
    <ul className="mt-3 divide-y divide-default border-y border-default">
      {items.map((entry) => {
        const done = reviewed(entry.id)
        const current = card?.id === entry.id
        return <li key={entry.id}>
          <button type="button" onClick={() => jumpTo(entry.id)} disabled={done} aria-current={current ? 'true' : undefined}
            className="flex min-h-11 w-full min-w-0 items-center gap-3 py-2.5 text-left disabled:cursor-default">
            <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${current ? 'bg-button text-inverse' : 'bg-surface text-muted'}`}>
              <AppIcon name={done ? 'checkCircle' : 'card'} className="size-4" />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm text-foreground">{entry.front}</span>
            <span className="shrink-0 text-xs text-muted">{done ? 'Reviewed' : current ? 'Now' : cardTypeLabel(entry)}</span>
          </button>
        </li>
      })}
    </ul>
    {dueStatus.hasMore ? <div className="mt-4 flex justify-center">
      <button type="button" onClick={dueStatus.loadMore} disabled={dueStatus.loadingMore} className={buttonSecondary}>{dueStatus.loadingMore ? 'Loading…' : 'Load more cards'}</button>
    </div> : null}
  </section>
}
