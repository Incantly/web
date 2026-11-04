'use client'

import { AppIcon } from '../AppIcon'
import { useNavigation } from '@/hooks/use-navigation'
import {
  useArtifactDetail,
  useArtifactGenerate,
  useArtifactsList,
  type ArtifactDetailValue,
  type ArtifactGenerateValue,
  type ArtifactTypeFilter,
} from '@/hooks/use-artifacts'
import type { ArtifactStatus, VersionContent } from '../../../lib/api/artifacts'
import { apiErrorMessage } from '../../../lib/api/errors'
import {
  ARTIFACT_REGEN_MAX,
  QUESTION_TYPES,
  QUIZ_DURATION_MAX,
  QUIZ_DURATION_MIN,
  QUIZ_ITEM_COUNT_MAX,
  QUIZ_ITEM_COUNT_MIN,
  QUIZ_OPTION_COUNT_MAX,
  QUIZ_OPTION_COUNT_MIN,
  artifactStatusCopy,
  artifactTypeCopy,
  isCurrentVersion,
  versionContentTitle,
  versionLabel,
  type ArtifactScopeKind,
} from './artifactModel'
import { readNumber, readText } from './quizModel'
import { updatedLabel } from './SpaceViews'
import { ConfirmDialog, EmptyState, ErrorState, ListSkeleton, PageFrame, PageHeading, Tabs, buttonDanger, buttonPrimary, buttonQuiet, buttonSecondary, inputClass, labelClass } from './ui'

function OfflineNotice({ copy }: { copy: string }) {
  return <div role="status" className="mt-6 flex items-center gap-2 rounded-xl border border-default bg-surface px-4 py-3 text-sm text-muted">
    <AppIcon name="alert" className="size-4 shrink-0" />{copy}
  </div>
}

function ArtifactStatusChip({ status }: { status: ArtifactStatus }) {
  const style = status === 'READY'
    ? 'bg-feature-research text-accent'
    : status === 'GENERATING'
      ? 'bg-surface text-muted'
      : status === 'FAILED'
        ? 'bg-danger-surface text-danger'
        : 'bg-surface text-subtle'
  const icon = status === 'READY' ? 'checkCircle' : status === 'GENERATING' ? 'clock' : status === 'FAILED' ? 'alert' : 'archive'
  return <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${style}`}>
    <AppIcon name={icon} className="size-3.5" />{artifactStatusCopy(status)}
  </span>
}

const TYPE_FILTERS: { id: ArtifactTypeFilter; label: string }[] = [
  { id: 'ALL', label: 'All' },
  { id: 'QUIZ', label: 'Quizzes' },
  { id: 'FLASHCARD_DECK', label: 'Decks' },
]

/** The quizzes-and-decks list: filter by type, open one, or make a new quiz. */
export function ArtifactsView() {
  const { online, typeFilter, setTypeFilter, includeArchived, setIncludeArchived, items, listStatus } = useArtifactsList()
  const { navigate } = useNavigation()
  return <PageFrame>
    <PageHeading title="Quizzes & decks" subtitle="Everything generated from your material. Open one to take it, review it, or see its versions."
      actions={<button type="button" onClick={() => navigate('artifact:new')} className={buttonPrimary}><AppIcon name="plus" className="size-4" />New quiz</button>} />
    {!online ? <OfflineNotice copy="You’re offline. Your quizzes and decks are listed when you reconnect." /> : null}
    <div className="mt-8">
      <Tabs tabs={TYPE_FILTERS} value={typeFilter} onChange={setTypeFilter} label="Filter by type" />
      <label className="mt-3 flex min-h-11 w-fit cursor-pointer items-center gap-3 rounded-xl px-2 py-2">
        <input type="checkbox" checked={includeArchived} onChange={(event) => setIncludeArchived(event.target.checked)} className="size-5 shrink-0 accent-button" />
        <span className="text-sm text-muted">Show archived</span>
      </label>
    </div>
    <div className="mt-4">
      {listStatus.loading ? <ListSkeleton rows={6} label="Loading quizzes and decks" />
        : listStatus.error ? <ErrorState message={apiErrorMessage(listStatus.error)} onRetry={listStatus.retry} />
        : items.length ? <>
          <ul className="divide-y divide-default border-y border-default">
            {items.map((artifact) => <li key={artifact.id}>
              <button type="button" onClick={() => navigate(`artifact:${artifact.id}`)} className="flex min-h-[4.25rem] w-full min-w-0 items-center gap-3 py-3 text-left">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface text-muted">
                  <AppIcon name={artifact.type === 'QUIZ' ? 'edit' : 'card'} className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">{artifact.title}</span>
                  <span className="mt-0.5 block truncate text-xs text-muted">{artifactTypeCopy(artifact.type)} · Updated {updatedLabel(Date.parse(artifact.updatedAt) || 0)}</span>
                </span>
                <ArtifactStatusChip status={artifact.status} />
                <AppIcon name="chevron" className="size-4 shrink-0 text-subtle" />
              </button>
            </li>)}
          </ul>
          {listStatus.hasMore ? <div className="mt-4 flex justify-center">
            <button type="button" onClick={listStatus.loadMore} disabled={listStatus.loadingMore} className={buttonSecondary}>{listStatus.loadingMore ? 'Loading…' : 'Load more'}</button>
          </div> : null}
        </>
        : <EmptyState icon="card" title={typeFilter === 'ALL' ? 'No quizzes or decks yet' : typeFilter === 'QUIZ' ? 'No quizzes yet' : 'No decks yet'}
          body={typeFilter === 'FLASHCARD_DECK' ? 'Decks you generate appear here. Make one from your material to start reviewing.' : 'Make a quiz from your material — it takes about a minute.'}
          action={typeFilter === 'FLASHCARD_DECK'
            ? <button type="button" onClick={() => navigate('deck:new')} className={buttonPrimary}>New deck</button>
            : <button type="button" onClick={() => navigate('artifact:new')} className={buttonPrimary}>New quiz</button>} />}
    </div>
  </PageFrame>
}

/** The artifact screen: the new-quiz form at `?artifact=new`, otherwise the artifact detail. */
export function ArtifactView({ artifactId }: { artifactId: string }) {
  if (artifactId === 'new') return <ArtifactGenerateScreen />
  return <ArtifactDetailScreen key={artifactId} artifactId={artifactId} />
}

function ArtifactDetailScreen({ artifactId }: { artifactId: string }) {
  const value = useArtifactDetail(artifactId)
  const { online, artifact, artifactStatus, backToList } = value
  if (artifactStatus.loading) return <PageFrame>
    <PageHeading title="Quiz or deck" actions={<button type="button" onClick={backToList} className={buttonSecondary}>All quizzes & decks</button>} />
    <div className="mt-8"><ListSkeleton rows={3} label="Loading quiz or deck" /></div>
  </PageFrame>
  if (artifactStatus.error || !artifact) return <PageFrame>
    <PageHeading title="Quiz or deck" actions={<button type="button" onClick={backToList} className={buttonSecondary}>All quizzes & decks</button>} />
    <div className="mt-8"><ErrorState message={apiErrorMessage(artifactStatus.error)} onRetry={artifactStatus.retry} /></div>
  </PageFrame>
  return <PageFrame>
    <PageHeading title={artifact.title} subtitle={`${artifactTypeCopy(artifact.type)} · Updated ${updatedLabel(Date.parse(artifact.updatedAt) || 0)}`}
      actions={<span className="flex flex-wrap items-center gap-2"><ArtifactStatusChip status={artifact.status} />
        <button type="button" onClick={backToList} className={buttonSecondary}>All quizzes & decks</button></span>} />
    {!online ? <OfflineNotice copy="You’re offline. Versions and actions are available when you reconnect." /> : null}
    <DetailActions value={value} />
    <RegenSection value={value} />
    <VersionsSection value={value} />
    <DangerSection value={value} />
  </PageFrame>
}

function DetailActions({ value }: { value: ArtifactDetailValue }) {
  const { navigate } = useNavigation()
  const { online, artifact, openView, archiveState, archiveError, clearArchiveError, requestArchive, cancelArchive, confirmArchive } = value
  if (!artifact || !openView) return null
  const takeLabel = artifact.type === 'QUIZ' ? 'Take quiz' : 'Review deck'
  return <div className="mt-8">
    {archiveError ? <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger bg-danger-surface px-4 py-3 text-sm text-danger">
      <span className="min-w-0 flex-1 basis-48">{apiErrorMessage(archiveError)}</span>
      <button type="button" onClick={clearArchiveError} className="min-h-11 rounded-lg px-3 font-semibold hover:bg-raised">Dismiss</button>
    </div> : null}
    <div className="flex flex-wrap gap-3">
      <button type="button" onClick={() => navigate(openView)} disabled={!online} className={buttonPrimary} title={!online ? 'Reconnect to open this' : undefined}>
        <AppIcon name={artifact.type === 'QUIZ' ? 'edit' : 'card'} className="size-4" />{takeLabel}
      </button>
      {artifact.status !== 'ARCHIVED' ? <button type="button" onClick={requestArchive} disabled={archiveState === 'working' || !online} className={buttonSecondary} title={!online ? 'Reconnect to archive' : undefined}>
        <AppIcon name="archive" className="size-4" />{archiveState === 'working' ? 'Archiving…' : 'Archive'}
      </button> : null}
    </div>
    {artifact.status === 'ARCHIVED' ? <p className="mt-3 text-sm text-muted">Archived — hidden from the default list, but still readable and takeable.</p> : null}
    <ConfirmDialog open={archiveState === 'confirming'} onClose={cancelArchive} onConfirm={() => void confirmArchive()}
      title="Archive this?" body="It leaves the default list but stays readable and takeable. Find it again any time under “Show archived”." confirmLabel="Archive" />
  </div>
}

function RegenSection({ value }: { value: ArtifactDetailValue }) {
  const {
    online, artifact, showingCurrent, versionContent, versionStatus,
    regenState, pickedQuestionIds, toggleQuestionId, canRegen, requestRegen, cancelRegen, confirmRegen,
    regenError, regenProgress, regenCanceled, cancelRegenGeneration, cancellingRegen,
  } = value
  if (!artifact || artifact.type !== 'QUIZ') return null
  const questions = versionContent?.quiz?.questions ?? []
  const following = regenProgress !== null || regenState === 'working'
  return <section aria-labelledby="artifact-regen-heading" className="mt-10">
    <h2 id="artifact-regen-heading" className="text-sm font-semibold text-foreground">Replace questions</h2>
    <p className="mt-1 text-sm text-muted">Pick up to {ARTIFACT_REGEN_MAX} questions to rewrite from the same material. Everything else stays exactly as it was.</p>
    {versionStatus.loading ? <div className="mt-4"><ListSkeleton rows={2} label="Loading current questions" /></div>
      : versionStatus.error ? <div className="mt-4"><ErrorState message={apiErrorMessage(versionStatus.error)} onRetry={versionStatus.retry} /></div>
      : !showingCurrent ? <p className="mt-4 rounded-xl border border-default bg-surface px-4 py-3 text-sm text-muted">You’re looking at an older version. Select the current version below to replace its questions.</p>
      : questions.length === 0 ? <p className="mt-4 rounded-xl border border-default bg-surface px-4 py-3 text-sm text-muted">This quiz has no questions to replace yet.</p>
      : <fieldset disabled={following || !online} className="mt-4">
        <legend className="sr-only">Questions to replace</legend>
        <ul className="grid gap-1">
          {questions.map((question, index) => <li key={question.id}>
            <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-surface">
              <input type="checkbox" checked={pickedQuestionIds.includes(question.id)} onChange={() => toggleQuestionId(question.id)} className="mt-1 size-5 shrink-0 accent-button" />
              <span className="min-w-0"><span className="block text-sm text-subtle">Question {index + 1}</span><span className="block text-base text-foreground">{question.prompt}</span></span>
            </label>
          </li>)}
        </ul>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-4 border-t border-default pt-4">
          <p className="text-sm text-muted">{pickedQuestionIds.length === 0 ? 'Pick at least one question.' : `${pickedQuestionIds.length} picked`}{online ? '' : ' Reconnect to replace.'}</p>
          <button type="button" onClick={requestRegen} disabled={!canRegen || following || !online} className={buttonSecondary}>
            <AppIcon name="sparkles" className="size-4" />Replace picked
          </button>
        </div>
      </fieldset>}
    {following ? <div role="status" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[1.15rem] border border-default bg-raised p-5">
      <span className="flex min-w-0 items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-surface text-muted"><AppIcon name="sparkles" className="size-5" /></span>
        <span className="min-w-0"><span className="block text-base font-medium text-foreground">{regenProgress ?? 'Starting…'}</span>
          <span className="mt-0.5 block text-sm text-muted">Safe to leave — the replacement keeps running.</span></span>
      </span>
      <button type="button" onClick={() => void cancelRegenGeneration()} disabled={cancellingRegen} className={buttonSecondary}>
        <AppIcon name="stop" className="size-4" />{cancellingRegen ? 'Canceling…' : 'Cancel'}
      </button>
    </div> : null}
    {regenCanceled ? <div role="status" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-default bg-surface px-4 py-3 text-sm text-foreground">
      <span className="min-w-0 flex-1 basis-48">Replacement canceled. The current version is unchanged.</span>
      <button type="button" onClick={requestRegen} className={buttonSecondary}>Try again</button>
    </div> : null}
    {regenState === 'failed' && regenError ? <div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger bg-danger-surface px-4 py-3 text-sm text-danger">
      <span className="min-w-0 flex-1 basis-48">{apiErrorMessage(regenError)}</span>
      <button type="button" onClick={requestRegen} className="min-h-11 rounded-lg px-3 font-semibold hover:bg-raised">Try again</button>
    </div> : null}
    <ConfirmDialog open={regenState === 'confirming'} onClose={cancelRegen} onConfirm={() => void confirmRegen()}
      title={`Replace ${pickedQuestionIds.length} ${pickedQuestionIds.length === 1 ? 'question' : 'questions'}?`}
      body="Fresh questions take their place in a new version. Every other question stays exactly as it was; attempts already started keep grading against their own version."
      confirmLabel="Replace questions" />
  </section>
}

function VersionsSection({ value }: { value: ArtifactDetailValue }) {
  const { artifact, versions, versionsStatus, selectedVersionId, selectVersion, versionContent, versionStatus } = value
  return <section aria-labelledby="artifact-versions-heading" className="mt-10">
    <h2 id="artifact-versions-heading" className="text-sm font-semibold text-foreground">Versions</h2>
    <div className="mt-4">
      {versionsStatus.loading ? <ListSkeleton rows={2} label="Loading versions" />
        : versionsStatus.error ? <ErrorState message={apiErrorMessage(versionsStatus.error)} onRetry={versionsStatus.retry} />
        : versions.length === 0 ? <EmptyState icon="history" title="No versions yet" body="Versions appear here once the first generation finishes." />
        : <ul className="divide-y divide-default border-y border-default">
          {versions.map((version) => {
            const current = artifact !== null && isCurrentVersion(artifact, version.id)
            const selected = version.id === selectedVersionId
            return <li key={version.id}>
              <button type="button" onClick={() => selectVersion(version.id)} aria-current={selected ? 'true' : undefined}
                className="flex min-h-11 w-full min-w-0 items-center gap-3 py-2.5 text-left">
                <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${selected ? 'bg-button text-inverse' : 'bg-surface text-muted'}`}>
                  <AppIcon name="history" className="size-4" />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">{versionLabel(version, current)}</span>
                <span className="shrink-0 text-xs text-muted">{version.itemCount} {version.itemCount === 1 ? 'item' : 'items'}</span>
              </button>
            </li>
          })}
        </ul>}
    </div>
    {versions.length > 0 ? <div className="mt-6">
      {versionStatus.loading ? <ListSkeleton rows={3} label="Loading version" />
        : versionStatus.error ? <ErrorState message={apiErrorMessage(versionStatus.error)} onRetry={versionStatus.retry} />
        : versionContent ? <VersionContentView content={versionContent} /> : null}
    </div> : null}
  </section>
}

/** One version's public content as text: quiz questions with options, or deck card fronts. Never answers. */
function VersionContentView({ content }: { content: VersionContent }) {
  const questions = content.quiz?.questions ?? []
  const cards = content.deck?.cards ?? []
  const durationSeconds = readNumber(content.quiz?.durationSeconds as unknown)
  return <article aria-labelledby="artifact-version-title" className="rounded-[1.15rem] border border-default bg-raised p-5">
    <h3 id="artifact-version-title" className="text-base font-medium text-foreground">{versionContentTitle(content)}</h3>
    {content.quiz?.instructions ? <p className="mt-1 text-sm text-muted">{content.quiz.instructions}</p> : null}
    <p className="mt-1 text-sm text-muted">
      {content.itemCount} {content.itemCount === 1 ? 'item' : 'items'}
      {content.quiz ? ` · ${content.quiz.totalPoints} points to earn` : ''}
      {durationSeconds !== null ? ` · ${Math.round(durationSeconds / 60)} min limit` : ''}
      {content.explanationsReady ? '' : ' · explanations on their way'}
    </p>
    {questions.length > 0 ? <ol className="mt-5 grid gap-4">
      {questions.map((question, index) => <li key={question.id} className="rounded-xl bg-surface px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Question {index + 1} · {question.points} {question.points === 1 ? 'point' : 'points'}</p>
        <p className="mt-1 text-base text-foreground">{question.prompt}</p>
        {(question.options ?? []).length > 0 ? <ul className="mt-2 grid gap-1">
          {(question.options ?? []).map((option) => <li key={option.id} className="text-sm text-muted">· {option.text}</li>)}
        </ul> : null}
      </li>)}
    </ol> : null}
    {cards.length > 0 ? <ol className="mt-5 grid gap-4">
      {cards.map((card, index) => {
        const hint = readText(card.hint as unknown)
        return <li key={card.id} className="rounded-xl bg-surface px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Card {index + 1}</p>
          <p className="mt-1 text-base text-foreground">{card.front}</p>
          {hint ? <p className="mt-1 text-sm text-muted">Hint: {hint}</p> : null}
        </li>
      })}
    </ol> : null}
    {questions.length === 0 && cards.length === 0 ? <p className="mt-4 text-sm text-muted">This version has no items to show.</p> : null}
  </article>
}

function DangerSection({ value }: { value: ArtifactDetailValue }) {
  const { online, deleteState, requestDelete, cancelDelete, confirmDelete, deleteError } = value
  return <section aria-labelledby="artifact-danger-heading" className="mt-10 border-t border-default pt-6">
    <h2 id="artifact-danger-heading" className="text-sm font-semibold text-foreground">Delete</h2>
    <p className="mt-1 text-sm text-muted">Deleting is permanent: versions, attempts, and stored material go with it.</p>
    {deleteError ? <div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger bg-danger-surface px-4 py-3 text-sm text-danger">
      <span className="min-w-0 flex-1 basis-48">{apiErrorMessage(deleteError)}</span>
      <button type="button" onClick={requestDelete} className="min-h-11 rounded-lg px-3 font-semibold hover:bg-raised">Try again</button>
    </div> : null}
    <div className="mt-4">
      <button type="button" onClick={requestDelete} disabled={deleteState === 'working' || !online} className={buttonDanger} title={!online ? 'Reconnect to delete' : undefined}>
        <AppIcon name="trash" className="size-4" />{deleteState === 'working' ? 'Deleting…' : 'Delete forever'}
      </button>
    </div>
    <ConfirmDialog open={deleteState === 'confirming'} onClose={cancelDelete} onConfirm={() => void confirmDelete()}
      title="Delete this forever?" body="Its versions, attempts, and stored material are removed and can’t be brought back." confirmLabel="Delete forever" destructive />
  </section>
}

const SCOPE_KINDS: { kind: ArtifactScopeKind; label: string; help: string }[] = [
  { kind: 'NOTE', label: 'One note', help: 'Questions from a single note.' },
  { kind: 'SPACE', label: 'A Space', help: 'Questions from a Space’s notes and sources.' },
  { kind: 'SELECTED_SOURCES', label: 'Sources', help: 'Questions from sources you pick.' },
  { kind: 'LIBRARY', label: 'Everything', help: 'Questions from all your notes and sources.' },
]

function ArtifactGenerateScreen() {
  const value = useArtifactGenerate()
  const { navigate } = useNavigation()
  const { online, readyArtifactId, generation } = value
  if (readyArtifactId) return <PageFrame>
    <PageHeading title="Quiz ready" subtitle="Your questions are written and ready to take." />
    <div className="mt-8"><EmptyState icon="checkCircle" title="Your quiz is ready"
      body="Start an attempt when you’re ready. Each attempt is graded when you submit it."
      action={<button type="button" onClick={() => navigate(`quiz:${readyArtifactId}`)} className={buttonPrimary}>Take the quiz</button>} /></div>
  </PageFrame>
  if (generation) return <QuizGenerationProgressScreen value={value} />
  return <PageFrame>
    <PageHeading title="New quiz" subtitle="Pick what the questions cover, tune the options, and we’ll write the quiz."
      actions={<button type="button" onClick={() => navigate('artifacts')} className={buttonSecondary}>All quizzes & decks</button>} />
    {!online ? <OfflineNotice copy="You’re offline. Reconnect to make a quiz." /> : null}
    <QuizGenerateForm value={value} />
  </PageFrame>
}

function QuizGenerationProgressScreen({ value }: { value: ArtifactGenerateValue }) {
  const {
    online, generation, generationStatus, generationProgress, generationFailure, generationCanceled,
    cancelGeneration, cancelling, generating, retryGenerate, backToForm, scope,
  } = value
  const { navigate } = useNavigation()
  const scopeCopy = scope.kind === 'LIBRARY' ? 'everything' : scope.kind === 'NOTE' ? 'your note' : scope.kind === 'SPACE' ? 'your Space' : 'your sources'
  return <PageFrame>
    <PageHeading title="Making your quiz" subtitle={`Questions are written in batches from ${scopeCopy}. This page follows along on its own.`}
      actions={<span className="flex flex-wrap gap-2">
        <button type="button" onClick={backToForm} className={buttonSecondary}>Back to options</button>
        <button type="button" onClick={() => navigate('artifacts')} className={buttonQuiet}>All quizzes & decks</button>
      </span>} />
    {!online ? <OfflineNotice copy="You’re offline. The quiz keeps generating; progress resumes when you reconnect." /> : null}
    <div className="mt-8">
      {generationStatus.loading ? <ListSkeleton rows={2} label="Reading generation progress" />
        : generationStatus.error ? <ErrorState message={apiErrorMessage(generationStatus.error)} onRetry={generationStatus.retry} />
        : generationCanceled ? <div role="status" className="flex flex-col items-center rounded-[1.15rem] border border-default px-6 py-10 text-center">
          <AppIcon name="stop" className="size-6 text-muted" />
          <p className="mt-3 text-base font-medium text-foreground">Generation canceled</p>
          <p className="mt-1.5 max-w-[24rem] text-sm leading-6 text-muted">Nothing was published. Try again with the same options, or change what it covers.</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <button type="button" onClick={() => void retryGenerate()} disabled={generating || !online} className={buttonPrimary}>{generating ? 'Trying again…' : 'Try again'}</button>
            <button type="button" onClick={backToForm} className={buttonSecondary}>Change what it covers</button>
          </div>
        </div>
        : generationFailure ? <ErrorState message={apiErrorMessage(generationFailure)} onRetry={() => void retryGenerate()} />
        : <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-[1.15rem] border border-default bg-raised p-5">
          <span className="flex min-w-0 items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-surface text-muted"><AppIcon name="sparkles" className="size-5" /></span>
            <span className="min-w-0">
              <span className="block text-base font-medium text-foreground">{generationProgress ?? 'Starting…'}</span>
              <span className="mt-0.5 block text-sm text-muted">Safe to leave — the quiz keeps generating{generation?.reused ? ' (matched your existing quiz, no charge)' : ''}.</span>
            </span>
          </span>
          <button type="button" onClick={() => void cancelGeneration()} disabled={cancelling || !online} className={buttonSecondary} title={!online ? 'Reconnect to cancel' : undefined}>
            <AppIcon name="stop" className="size-4" />{cancelling ? 'Canceling…' : 'Cancel'}
          </button>
        </div>}
      {generationFailure && !generationCanceled ? <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" onClick={() => void retryGenerate()} disabled={generating || !online} className={buttonPrimary}>{generating ? 'Trying again…' : 'Try again'}</button>
        <button type="button" onClick={backToForm} className={buttonSecondary}>Change what it covers</button>
      </div> : null}
    </div>
  </PageFrame>
}

function QuizGenerateForm({ value }: { value: ArtifactGenerateValue }) {
  const {
    online, scopeKind, setScopeKind, scope, setNoteId, setSpaceId, toggleSourceId,
    preferences, setPreferences, toggleQuestionType, noteOptions, spaceOptions, sourceOptions,
    optionsStatus, scopeError, generate, generating, generateError, clearGenerateError,
  } = value
  const disabled = generating || !online || optionsStatus.loading
  const untimed = preferences.durationMinutes === null
  return <div className="mt-8 grid gap-8">
    {generateError ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger bg-danger-surface px-4 py-3 text-sm text-danger">
      <span className="min-w-0 flex-1 basis-48">{apiErrorMessage(generateError)}</span>
      <button type="button" onClick={clearGenerateError} className="min-h-11 rounded-lg px-3 font-semibold hover:bg-raised">Dismiss</button>
    </div> : null}
    {optionsStatus.loading ? <ListSkeleton rows={3} label="Loading your notes and sources" />
      : optionsStatus.error ? <ErrorState message={apiErrorMessage(optionsStatus.error)} onRetry={optionsStatus.retry} />
      : <fieldset disabled={disabled}>
        <legend className="text-sm font-semibold text-foreground">What should the questions cover?</legend>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {SCOPE_KINDS.map((option) => <label key={option.kind} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-default bg-raised px-3.5 py-2.5 transition-colors has-checked:border-button">
            <input type="radio" name="quiz-scope" checked={scopeKind === option.kind} onChange={() => setScopeKind(option.kind)} className="mt-1 size-5 shrink-0 accent-button" />
            <span className="min-w-0"><span className="block text-base text-foreground">{option.label}</span><span className="block text-sm text-muted">{option.help}</span></span>
          </label>)}
        </div>
        <div className="mt-4">
          {scope.kind === 'NOTE' ? (noteOptions.length ? <><label htmlFor="quiz-note" className={labelClass}>Note</label>
            <select id="quiz-note" value={scope.noteId} onChange={(event) => setNoteId(event.target.value)} className="min-h-11 w-full rounded-xl border border-default bg-surface px-3 text-base text-foreground">
              <option value="">Choose a note…</option>
              {noteOptions.map((note) => <option key={note.id} value={note.id}>{note.title}</option>)}
            </select></> : <EmptyState icon="document" title="No notes yet" body="Write a note first, then make a quiz from it." />)
            : scope.kind === 'SPACE' ? (spaceOptions.length ? <><label htmlFor="quiz-space" className={labelClass}>Space</label>
              <select id="quiz-space" value={scope.spaceId} onChange={(event) => setSpaceId(event.target.value)} className="min-h-11 w-full rounded-xl border border-default bg-surface px-3 text-base text-foreground">
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
        <div><label htmlFor="quiz-title" className={labelClass}>Title (optional)</label>
          <input id="quiz-title" type="text" value={preferences.title} onChange={(event) => setPreferences({ title: event.target.value })} placeholder="e.g. B-trees quiz" className={inputClass} /></div>
        <div><label htmlFor="quiz-topic" className={labelClass}>Topic focus (optional)</label>
          <input id="quiz-topic" type="text" value={preferences.topic} onChange={(event) => setPreferences({ topic: event.target.value })} placeholder="e.g. B-tree page splits" className={inputClass} /></div>
        <div><label htmlFor="quiz-difficulty" className={labelClass}>Difficulty</label>
          <select id="quiz-difficulty" value={preferences.difficulty} onChange={(event) => setPreferences({ difficulty: event.target.value as ArtifactGenerateValue['preferences']['difficulty'] })} className="min-h-11 w-full rounded-xl border border-default bg-surface px-3 text-base text-foreground">
            <option value="MIXED">Mixed</option><option value="EASY">Easy</option><option value="MEDIUM">Medium</option><option value="HARD">Hard</option>
          </select></div>
        <div><label htmlFor="quiz-count" className={labelClass}>Questions ({QUIZ_ITEM_COUNT_MIN}–{QUIZ_ITEM_COUNT_MAX})</label>
          <input id="quiz-count" type="number" min={QUIZ_ITEM_COUNT_MIN} max={QUIZ_ITEM_COUNT_MAX} value={preferences.itemCount}
            onChange={(event) => setPreferences({ itemCount: Number(event.target.value) })} className={inputClass} /></div>
        <div><label htmlFor="quiz-options" className={labelClass}>Options per question ({QUIZ_OPTION_COUNT_MIN}–{QUIZ_OPTION_COUNT_MAX})</label>
          <input id="quiz-options" type="number" min={QUIZ_OPTION_COUNT_MIN} max={QUIZ_OPTION_COUNT_MAX} value={preferences.optionCount}
            onChange={(event) => setPreferences({ optionCount: Number(event.target.value) })} className={inputClass} /></div>
        <div>
          <label htmlFor="quiz-duration" className={labelClass}>Time limit (minutes)</label>
          <input id="quiz-duration" type="number" min={QUIZ_DURATION_MIN} max={QUIZ_DURATION_MAX} value={preferences.durationMinutes ?? ''}
            disabled={disabled || untimed} placeholder={untimed ? 'Untimed' : `e.g. 15`}
            onChange={(event) => setPreferences({ durationMinutes: event.target.value === '' ? null : Number(event.target.value) })} className={inputClass} />
          <label className="mt-2 flex min-h-11 w-fit cursor-pointer items-center gap-3 rounded-xl px-2 py-2">
            <input type="checkbox" checked={untimed} onChange={(event) => setPreferences({ durationMinutes: event.target.checked ? null : 15 })} className="size-5 shrink-0 accent-button" />
            <span className="text-sm text-muted">Untimed</span>
          </label>
        </div>
      </div>
      <fieldset>
        <legend className={labelClass}>Question types</legend>
        <div className="mt-2 grid gap-1">
          {QUESTION_TYPES.map((option) => <label key={option.type} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-surface">
            <input type="checkbox" checked={preferences.questionTypes.includes(option.type)} onChange={() => toggleQuestionType(option.type)} className="mt-1 size-5 shrink-0 accent-button" />
            <span className="min-w-0"><span className="block text-base text-foreground">{option.label}</span><span className="block text-sm text-muted">{option.help}</span></span>
          </label>)}
        </div>
      </fieldset>
    </fieldset>
    <div className="flex flex-wrap items-center justify-between gap-4 border-t border-default pt-6">
      <p className="text-sm text-muted">{scopeError ?? 'Ready when you are.'}{online ? '' : ' Reconnect to generate.'}</p>
      <button type="button" onClick={() => void generate()} disabled={disabled || scopeError !== null} className={buttonPrimary}
        title={scopeError ?? (!online ? 'Reconnect to generate' : undefined)}>
        <AppIcon name="sparkles" className="size-4" />{generating ? 'Starting…' : 'Generate quiz'}
      </button>
    </div>
  </div>
}
