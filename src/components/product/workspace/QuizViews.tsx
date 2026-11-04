'use client'

import { AppIcon } from '../AppIcon'
import { apiErrorMessage } from '../../../lib/api/errors'
import type { AttemptDto, QuizQuestionDto, ResultQuestionDto } from '../../../lib/api/quiz'
import { useQuiz, useQuizAttempt, useQuizScreen, type QuizAttemptValue } from '@/hooks/use-quiz'
import {
  QUIZ_SHORT_ANSWER_MAX,
  citationCopy,
  formatAnswerText,
  historySummaryCopy,
  moveOrderingItem,
  orderingFromOptions,
  questionTypeHint,
  resultExplanation,
  saveIndicatorCopy,
  scoreCopy,
  setBlank,
  setMatch,
  splitFillBlanks,
  submitConfirmCopy,
  toggleMultiSelect,
  type DraftAnswer,
} from './quizModel'
import { ConfirmDialog, EmptyState, ErrorState, ListSkeleton, PageFrame, PageHeading, buttonPrimary, buttonQuiet, buttonSecondary, inputClass } from './ui'

/** The quiz screen: attempt history, or the open attempt's taker/result. */
export function QuizView({ quizId }: { quizId: string }) {
  const { openAttempt } = useQuiz()
  if (openAttempt && openAttempt.quizId === quizId) return <QuizAttemptScreen key={openAttempt.attemptId} quizId={quizId} attemptId={openAttempt.attemptId} />
  return <QuizHistoryScreen quizId={quizId} />
}

function OfflineNotice({ copy }: { copy: string }) {
  return <div role="status" className="mt-6 flex items-center gap-2 rounded-xl border border-default bg-surface px-4 py-3 text-sm text-muted">
    <AppIcon name="alert" className="size-4 shrink-0" />{copy}
  </div>
}

function QuizHistoryScreen({ quizId }: { quizId: string }) {
  const { online, history, historyStatus, starting, startError, clearStartError, startAttempt, resumeAttempt } = useQuizScreen(quizId)
  return <PageFrame>
    <PageHeading title="Quiz" subtitle="Start a new attempt or pick up where you left off. Each attempt is graded when you submit it."
      actions={<button type="button" onClick={() => void startAttempt()} disabled={starting || !online} className={buttonPrimary} title={!online ? 'Reconnect to start an attempt' : undefined}>
        <AppIcon name="edit" className="size-4" />{starting ? 'Starting…' : 'Start attempt'}
      </button>} />
    {!online ? <OfflineNotice copy="You’re offline. Your past attempts are listed when you reconnect." /> : null}
    {startError ? <div role="alert" className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger bg-danger-surface px-4 py-3 text-sm text-danger">
      <span className="min-w-0 flex-1 basis-48">{apiErrorMessage(startError)}</span>
      <button type="button" onClick={clearStartError} className="min-h-11 rounded-lg px-3 font-semibold hover:bg-raised">Dismiss</button>
    </div> : null}
    <div className="mt-8">
      {historyStatus.loading ? <ListSkeleton rows={4} label="Loading attempts" />
        : historyStatus.error ? <ErrorState message={apiErrorMessage(historyStatus.error)} onRetry={historyStatus.retry} />
        : history.length ? <ul className="divide-y divide-default border-y border-default">
        {history.map((summary) => {
          const inProgress = summary.state === 'IN_PROGRESS'
          return <li key={summary.attemptId} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface text-muted"><AppIcon name="history" className="size-4" /></span>
            <span className="min-w-0 flex-1 basis-48">
              <span className="block truncate text-sm font-medium text-foreground">{inProgress ? 'Attempt in progress' : 'Submitted attempt'}</span>
              <span className="mt-0.5 block truncate text-xs text-muted">{historySummaryCopy(summary)}</span>
            </span>
            <button type="button" onClick={() => resumeAttempt(summary.attemptId)} disabled={starting} className={buttonSecondary}>
              {inProgress ? 'Resume' : 'View result'}
            </button>
          </li>
        })}
      </ul> : <EmptyState icon="edit" title="No attempts yet" body="Start your first attempt when you’re ready. Your answers save as you go." action={!online ? undefined : <button type="button" onClick={() => void startAttempt()} disabled={starting} className={buttonPrimary}>{starting ? 'Starting…' : 'Start attempt'}</button>} />}
    </div>
  </PageFrame>
}

function QuizAttemptScreen({ quizId, attemptId }: { quizId: string; attemptId: string }) {
  const value = useQuizAttempt(quizId, attemptId)
  const { attempt, attemptStatus, result, resultStatus, backToHistory } = value
  if (attemptStatus.loading) return <PageFrame>
    <PageHeading title="Quiz" actions={<button type="button" onClick={backToHistory} className={buttonSecondary}>All attempts</button>} />
    <div className="mt-8"><ListSkeleton rows={3} label="Loading attempt" /></div>
  </PageFrame>
  if (attemptStatus.error || !attempt) return <PageFrame>
    <PageHeading title="Quiz" actions={<button type="button" onClick={backToHistory} className={buttonSecondary}>All attempts</button>} />
    <div className="mt-8"><ErrorState message={apiErrorMessage(attemptStatus.error)} onRetry={attemptStatus.retry} /></div>
  </PageFrame>
  if (attempt.state === 'SUBMITTED' || result) {
    if (!result && resultStatus.loading) return <PageFrame>
      <PageHeading title={attempt.title} actions={<button type="button" onClick={backToHistory} className={buttonSecondary}>All attempts</button>} />
      <div className="mt-8"><ListSkeleton rows={3} label="Loading result" /></div>
    </PageFrame>
    if (!result) return <PageFrame>
      <PageHeading title={attempt.title} actions={<button type="button" onClick={backToHistory} className={buttonSecondary}>All attempts</button>} />
      <div className="mt-8"><ErrorState message={apiErrorMessage(resultStatus.error)} onRetry={resultStatus.retry} /></div>
    </PageFrame>
    return <QuizResultScreen value={value} attempt={attempt} />
  }
  return <QuizTakerScreen value={value} attempt={attempt} />
}

function QuizTakerScreen({ value, attempt }: { value: QuizAttemptValue; attempt: AttemptDto }) {
  const { online, draft, saveState, savedAt, saveError, retrySave, answered, total, timeLeft, backToHistory } = value
  return <PageFrame>
    <PageHeading title={attempt.title} subtitle={attempt.instructions || undefined}
      actions={<button type="button" onClick={backToHistory} className={buttonSecondary}>All attempts</button>} />
    <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted">
      <span role="status">{answered} of {total} answered</span>
      {timeLeft ? <span role="timer" className="inline-flex items-center gap-1.5"><AppIcon name="clock" className="size-4" />{timeLeft}</span> : null}
      <span role="status" className="inline-flex items-center gap-1.5">
        <AppIcon name={saveState === 'error' ? 'alert' : saveState === 'saved' ? 'check' : 'clock'} className="size-4" />
        {saveIndicatorCopy(saveState, savedAt)}
      </span>
    </div>
    {!online ? <OfflineNotice copy="You’re offline. Your answers stay on this page and save when you reconnect." /> : null}
    {saveError ? <div role="alert" className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger bg-danger-surface px-4 py-3 text-sm text-danger">
      <span className="min-w-0 flex-1 basis-48">{apiErrorMessage(saveError)}</span>
      <button type="button" onClick={retrySave} className="min-h-11 rounded-lg px-3 font-semibold hover:bg-raised">Try again</button>
    </div> : null}
    {attempt.questions.length === 0 ? <div className="mt-8"><EmptyState icon="document" title="No questions" body="This attempt has no questions to answer." /></div>
      : <ol className="mt-8 grid gap-6">
        {attempt.questions.map((question, index) => <li key={question.id}>
          <QuestionCard value={value} question={question} index={index} answer={draft[question.id]} />
        </li>)}
      </ol>}
    {attempt.questions.length > 0 ? <SubmitSection value={value} /> : null}
  </PageFrame>
}

function SubmitSection({ value }: { value: QuizAttemptValue }) {
  const { online, answered, total, confirming, requestSubmit, cancelSubmit, submitting, submitError, clearSubmitError, confirmSubmit } = value
  const copy = submitConfirmCopy(answered, total)
  return <section aria-label="Submit attempt" className="mt-10 border-t border-default pt-6">
    {submitError ? <div role="alert" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger bg-danger-surface px-4 py-3 text-sm text-danger">
      <span className="min-w-0 flex-1 basis-48">{apiErrorMessage(submitError)}</span>
      <button type="button" onClick={clearSubmitError} className="min-h-11 rounded-lg px-3 font-semibold hover:bg-raised">Dismiss</button>
    </div> : null}
    <div className="flex flex-wrap items-center justify-between gap-4">
      <p className="text-sm text-muted">{answered} of {total} answered{online ? '' : ' · Reconnect to submit.'}</p>
      <button type="button" onClick={requestSubmit} disabled={submitting || !online} className={buttonPrimary} title={!online ? 'Reconnect to submit' : undefined}>
        {submitting ? 'Submitting…' : 'Submit attempt'}
      </button>
    </div>
    <ConfirmDialog open={confirming} onClose={cancelSubmit} onConfirm={() => void confirmSubmit()} title={copy.title} body={copy.body} confirmLabel={submitting ? 'Submitting…' : 'Submit'} />
  </section>
}

function QuestionCard({ value, question, index, answer }: { value: QuizAttemptValue; question: QuizQuestionDto; index: number; answer: DraftAnswer }) {
  const { clearAnswer } = value
  const hint = questionTypeHint(question.type)
  const clearable = answer !== undefined && answer !== null
  return <fieldset className="min-w-0 rounded-[1.15rem] border border-default bg-raised p-5">
    <legend className="sr-only">Question {index + 1}, {question.points} {question.points === 1 ? 'point' : 'points'}</legend>
    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Question {index + 1} · {question.points} {question.points === 1 ? 'point' : 'points'}</p>
    <p className="mt-1 text-base font-medium leading-7 text-foreground">{question.prompt}</p>
    {hint ? <p className="mt-1 text-sm text-muted">{hint}</p> : null}
    <div className="mt-4">
      <QuestionInput value={value} question={question} answer={answer} />
    </div>
    {clearable ? <div className="mt-3"><button type="button" onClick={() => clearAnswer(question.id)} className={buttonQuiet}>Clear answer</button></div> : null}
  </fieldset>
}

function QuestionInput({ value, question, answer }: { value: QuizAttemptValue; question: QuizQuestionDto; answer: DraftAnswer }) {
  const { setAnswer } = value
  const group = `quiz-${question.id}`
  switch (question.type) {
    case 'SINGLE_CHOICE':
      return <div className="grid gap-1">
        {(question.options ?? []).map((option) => <label key={option.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-surface">
          <input type="radio" name={group} checked={answer === option.id} onChange={() => setAnswer(question.id, option.id)} className="size-5 shrink-0 accent-button" />
          <span className="min-w-0 text-base text-foreground">{option.text}</span>
        </label>)}
      </div>
    case 'TRUE_FALSE':
      return <div className="grid gap-1">
        {[{ label: 'True', value: true }, { label: 'False', value: false }].map((choice) => <label key={choice.label} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-surface">
          <input type="radio" name={group} checked={answer === choice.value} onChange={() => setAnswer(question.id, choice.value)} className="size-5 shrink-0 accent-button" />
          <span className="text-base text-foreground">{choice.label}</span>
        </label>)}
      </div>
    case 'MULTIPLE_SELECT':
      return <div className="grid gap-1">
        {(question.options ?? []).map((option) => {
          const selected = Array.isArray(answer) && answer.includes(option.id)
          return <label key={option.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-surface">
            <input type="checkbox" checked={selected} onChange={() => setAnswer(question.id, toggleMultiSelect(answer, option.id))} className="size-5 shrink-0 accent-button" />
            <span className="min-w-0 text-base text-foreground">{option.text}</span>
          </label>
        })}
      </div>
    case 'SHORT_ANSWER':
      return <input type="text" value={typeof answer === 'string' ? answer : ''} maxLength={QUIZ_SHORT_ANSWER_MAX}
        onChange={(event) => setAnswer(question.id, event.target.value === '' ? null : event.target.value)}
        aria-label="Your answer" placeholder="Type your answer" className={inputClass} />
    case 'FILL_IN_THE_BLANK': {
      const fills = typeof answer === 'object' && answer !== null && !Array.isArray(answer) ? (answer as Record<string, string>) : {}
      return <p className="text-base leading-9 text-foreground">
        {splitFillBlanks(question.prompt).map((run, runIndex) => run.kind === 'text'
          ? <span key={runIndex}>{run.text}</span>
          : <input key={runIndex} type="text" value={fills[run.id] ?? ''} maxLength={QUIZ_SHORT_ANSWER_MAX}
            onChange={(event) => setAnswer(question.id, setBlank(answer, run.id, event.target.value))}
            aria-label={`Fill in blank ${run.id}`} placeholder={run.id}
            className="mx-1 inline-block min-h-11 w-full max-w-44 rounded-xl border border-default bg-surface px-3 align-baseline text-base text-foreground transition-[border-color,box-shadow] placeholder:text-subtle focus-visible:border-button focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-button/15 sm:w-44" />)}
      </p>
    }
    case 'MATCHING': {
      const map = typeof answer === 'object' && answer !== null && !Array.isArray(answer) ? (answer as Record<string, string>) : {}
      const left = question.options ?? []
      const right = question.right ?? []
      return <div className="grid gap-3">
        {left.map((option) => {
          const usedElsewhere = new Set(Object.entries(map).filter(([key]) => key !== option.id).map(([, rightId]) => rightId))
          return <div key={option.id} className="grid gap-1.5 sm:grid-cols-2 sm:items-center sm:gap-3">
            <p className="min-w-0 text-base text-foreground">{option.text}</p>
            <select value={map[option.id] ?? ''} onChange={(event) => setAnswer(question.id, setMatch(answer, option.id, event.target.value === '' ? null : event.target.value))}
              aria-label={`Match for ${option.text}`} className="min-h-11 w-full rounded-xl border border-default bg-surface px-3 text-base text-foreground">
              <option value="">Choose…</option>
              {right.map((item) => <option key={item.id} value={item.id} disabled={usedElsewhere.has(item.id)}>{item.text}</option>)}
            </select>
          </div>
        })}
      </div>
    }
    case 'ORDERING': {
      const order = Array.isArray(answer) && answer.length > 0 ? answer : orderingFromOptions(question)
      const byId = new Map((question.options ?? []).map((option) => [option.id, option.text] as const))
      return <ol className="grid gap-2">
        {order.map((optionId, position) => <li key={optionId} className="flex min-h-11 items-center gap-2 rounded-xl border border-default bg-surface px-2 py-1">
          <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center text-sm font-semibold text-muted">{position + 1}</span>
          <span className="min-w-0 flex-1 text-base text-foreground">{byId.get(optionId) ?? optionId}</span>
          <span className="flex shrink-0 gap-1">
            <button type="button" onClick={() => setAnswer(question.id, moveOrderingItem(order, position, -1))} disabled={position === 0}
              aria-label={`Move ${byId.get(optionId) ?? optionId} up`} className="grid min-h-11 min-w-11 place-items-center rounded-lg px-2 text-sm font-semibold text-muted transition-colors hover:bg-raised hover:text-foreground disabled:opacity-40">↑</button>
            <button type="button" onClick={() => setAnswer(question.id, moveOrderingItem(order, position, 1))} disabled={position === order.length - 1}
              aria-label={`Move ${byId.get(optionId) ?? optionId} down`} className="grid min-h-11 min-w-11 place-items-center rounded-lg px-2 text-sm font-semibold text-muted transition-colors hover:bg-raised hover:text-foreground disabled:opacity-40">↓</button>
          </span>
        </li>)}
      </ol>
    }
  }
}

function QuizResultScreen({ value, attempt }: { value: QuizAttemptValue; attempt: AttemptDto }) {
  const { online, result, resultStatus, backToHistory } = value
  if (!result) return null
  const copy = scoreCopy(result)
  return <PageFrame>
    <PageHeading title={copy.headline} subtitle={copy.detail}
      actions={<button type="button" onClick={backToHistory} className={buttonSecondary}>All attempts</button>} />
    {!online ? <OfflineNotice copy="You’re offline. The result below is the graded score from the server." /> : null}
    {!result.explanationsComplete ? <div role="status" className="mt-6 flex items-center gap-2 rounded-xl border border-default bg-surface px-4 py-3 text-sm text-muted">
      <AppIcon name="clock" className="size-4 shrink-0" />Explanations are still being written. This page updates on its own.
    </div> : null}
    {resultStatus.error ? <div role="alert" className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger bg-danger-surface px-4 py-3 text-sm text-danger">
      <span className="min-w-0 flex-1 basis-48">{apiErrorMessage(resultStatus.error)}</span>
      <button type="button" onClick={resultStatus.retry} className="min-h-11 rounded-lg px-3 font-semibold hover:bg-raised">Try again</button>
    </div> : null}
    <p className="mt-6 text-sm text-muted">Showing “{attempt.title}” · {result.questions.length} {result.questions.length === 1 ? 'question' : 'questions'}</p>
    {result.questions.length === 0 ? <div className="mt-4"><EmptyState icon="document" title="No questions" body="This result has no questions to show." /></div>
      : <ol className="mt-4 grid gap-6">
        {result.questions.map((question, index) => <li key={question.id}><ResultCard question={question} index={index} /></li>)}
      </ol>}
  </PageFrame>
}

function ResultCard({ question, index }: { question: ResultQuestionDto; index: number }) {
  const explanation = resultExplanation(question)
  return <article aria-labelledby={`result-${question.id}`} className="rounded-[1.15rem] border border-default bg-raised p-5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Question {index + 1} · {question.correct ? question.points : 0} of {question.points} {question.points === 1 ? 'point' : 'points'}</p>
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${question.correct ? 'bg-feature-research text-accent' : 'bg-danger-surface text-danger'}`}>
        <AppIcon name={question.correct ? 'checkCircle' : 'alert'} className="size-3.5" />{question.correct ? 'Correct' : 'Incorrect'}
      </span>
    </div>
    <h2 id={`result-${question.id}`} className="mt-1 text-base font-medium leading-7 text-foreground">{question.prompt}</h2>
    <dl className="mt-4 grid gap-3">
      <div className="rounded-xl bg-surface px-4 py-3">
        <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Your answer</dt>
        <dd className="mt-1 text-base text-foreground">{formatAnswerText(question, question.yourAnswer)}</dd>
      </div>
      {!question.correct ? <div className="rounded-xl bg-surface px-4 py-3">
        <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Correct answer</dt>
        <dd className="mt-1 text-base text-foreground">{formatAnswerText(question, question.correctAnswer)}</dd>
      </div> : null}
    </dl>
    {explanation ? <p className="mt-4 text-sm leading-6 text-muted">{explanation}</p>
      : <p role="status" className="mt-4 text-sm text-subtle">Explanation on its way…</p>}
    {question.citations.length > 0 ? <ul aria-label="Sources" className="mt-3 grid gap-1.5">
      {question.citations.map((citation, citationIndex) => <li key={citationIndex} className="flex items-start gap-2 text-sm text-muted">
        <AppIcon name="document" className="mt-0.5 size-4 shrink-0" /><span>{citationCopy(citation)}</span>
      </li>)}
    </ul> : null}
  </article>
}
