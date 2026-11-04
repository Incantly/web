import { describe, expect, it } from 'vitest'
import type { AttemptDto, AttemptResultDto, AttemptSummaryDto, QuizQuestionDto, ResultQuestionDto } from '../../../lib/api/quiz'
import {
  attemptDeadline,
  citationCopy,
  countAnswered,
  draftFromAttempt,
  formatAnswerText,
  historySummaryCopy,
  isAnswered,
  moveOrderingItem,
  normalizeSavedAnswer,
  orderingFromOptions,
  questionTypeHint,
  readNumber,
  readText,
  resultExplanation,
  saveIndicatorCopy,
  scoreCopy,
  setBlank,
  setMatch,
  splitFillBlanks,
  submitConfirmCopy,
  timeLeftCopy,
  toggleMultiSelect,
} from './quizModel'

const question = (overrides: Partial<QuizQuestionDto> = {}): QuizQuestionDto => ({
  id: 'q1',
  type: 'SINGLE_CHOICE',
  prompt: 'Pick one.',
  difficulty: 'EASY',
  points: 1,
  ...overrides,
})

const options = [
  { id: 'a', text: 'Alpha' },
  { id: 'b', text: 'Beta' },
  { id: 'c', text: 'Gamma' },
]

const resultQuestion = (overrides: Partial<ResultQuestionDto> = {}): ResultQuestionDto => ({
  id: 'q1',
  type: 'SINGLE_CHOICE',
  prompt: 'Pick one.',
  difficulty: 'EASY',
  points: 1,
  correct: true,
  citations: [],
  ...overrides,
})

describe('readText / readNumber / attemptDeadline / resultExplanation', () => {
  it('recovers the runtime scalars behind the broken nullable codegen', () => {
    expect(readText('2026-01-01T00:00:00.000Z')).toBe('2026-01-01T00:00:00.000Z')
    expect(readText(null)).toBeNull()
    expect(readText(42)).toBeNull()
    expect(readNumber(7)).toBe(7)
    expect(readNumber(null)).toBeNull()
    expect(readNumber('7')).toBeNull()
  })

  it('reads the server deadline and background explanations', () => {
    const attempt = { deadlineAt: '2026-05-01T12:00:00.000Z' } as unknown as AttemptDto
    expect(attemptDeadline(attempt)).toBe('2026-05-01T12:00:00.000Z')
    expect(attemptDeadline({} as AttemptDto)).toBeNull()
    expect(resultExplanation(resultQuestion({ explanation: 'Because.' as unknown as Record<string, never> }))).toBe('Because.')
    expect(resultExplanation(resultQuestion({ explanation: null }))).toBeNull()
  })
})

describe('normalizeSavedAnswer / draftFromAttempt', () => {
  it('keeps every server answer shape and drops unknown ones', () => {
    expect(normalizeSavedAnswer('b')).toBe('b')
    expect(normalizeSavedAnswer(true)).toBe(true)
    expect(normalizeSavedAnswer(['a', 'c'])).toEqual(['a', 'c'])
    expect(normalizeSavedAnswer({ l1: 'r2' })).toEqual({ l1: 'r2' })
    expect(normalizeSavedAnswer(null)).toBeUndefined()
    expect(normalizeSavedAnswer(undefined)).toBeUndefined()
    expect(normalizeSavedAnswer(42)).toBeUndefined()
    expect(normalizeSavedAnswer(['a', 1])).toBeUndefined()
    expect(normalizeSavedAnswer({ l1: 2 })).toBeUndefined()
  })

  it('builds the draft from the attempt\u2019s saved answers only', () => {
    const attempt = {
      answers: { q1: 'b', q2: true, q9: 'stale' },
      questions: [question({ id: 'q1' }), question({ id: 'q2', type: 'TRUE_FALSE' })],
    } as unknown as AttemptDto
    expect(draftFromAttempt(attempt)).toEqual({ q1: 'b', q2: true })
  })
})

describe('draft updates', () => {
  it('toggles multiple-select options without duplicates', () => {
    expect(toggleMultiSelect(undefined, 'a')).toEqual(['a'])
    expect(toggleMultiSelect(['a'], 'b')).toEqual(['a', 'b'])
    expect(toggleMultiSelect(['a', 'b'], 'a')).toEqual(['b'])
    expect(toggleMultiSelect(['a'], 'a')).toEqual([])
  })

  it('orders from the attempt\u2019s own option order and moves one slot at a time', () => {
    expect(orderingFromOptions(question({ type: 'ORDERING', options }))).toEqual(['a', 'b', 'c'])
    expect(moveOrderingItem(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c'])
    expect(moveOrderingItem(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b'])
    expect(moveOrderingItem(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c'])
    expect(moveOrderingItem(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'b', 'c'])
  })

  it('maps and clears matching rows independently', () => {
    expect(setMatch(undefined, 'l1', 'r2')).toEqual({ l1: 'r2' })
    expect(setMatch({ l1: 'r2', l2: 'r1' }, 'l1', null)).toEqual({ l2: 'r1' })
  })

  it('fills and clears blanks independently', () => {
    expect(setBlank(undefined, 'b1', 'Mercury')).toEqual({ b1: 'Mercury' })
    expect(setBlank({ b1: 'Mercury', b2: 'Venus' }, 'b1', '')).toEqual({ b2: 'Venus' })
  })

  it('splits fill-in prompts on [[blank]] markers', () => {
    expect(splitFillBlanks('[[b1]] and [[b2]] orbit.')).toEqual([
      { kind: 'blank', id: 'b1' },
      { kind: 'text', text: ' and ' },
      { kind: 'blank', id: 'b2' },
      { kind: 'text', text: ' orbit.' },
    ])
    expect(splitFillBlanks('No markers.')).toEqual([{ kind: 'text', text: 'No markers.' }])
  })
})

describe('isAnswered / countAnswered', () => {
  it('counts complete answers only, never partial maps', () => {
    expect(isAnswered(question(), 'b')).toBe(true)
    expect(isAnswered(question(), '')).toBe(false)
    expect(isAnswered(question({ type: 'TRUE_FALSE' }), false)).toBe(true)
    expect(isAnswered(question({ type: 'MULTIPLE_SELECT', options }), [])).toBe(true)
    expect(isAnswered(question({ type: 'ORDERING', options }), ['a', 'b'])).toBe(false)
    expect(isAnswered(question({ type: 'ORDERING', options }), ['a', 'b', 'c'])).toBe(true)
    const fill = question({ type: 'FILL_IN_THE_BLANK', blanks: ['b1', 'b2'] })
    expect(isAnswered(fill, { b1: 'x' })).toBe(false)
    expect(isAnswered(fill, { b1: 'x', b2: 'y' })).toBe(true)
    const match = question({ type: 'MATCHING', options })
    expect(isAnswered(match, { a: 'r1' })).toBe(false)
    expect(isAnswered(match, { a: 'r1', b: 'r2', c: 'r3' })).toBe(true)
    expect(isAnswered(question(), undefined)).toBe(false)
    expect(isAnswered(question(), null)).toBe(false)
  })

  it('counts across the draft', () => {
    const questions = [question({ id: 'q1' }), question({ id: 'q2', type: 'TRUE_FALSE' })]
    expect(countAnswered(questions, { q1: 'b' })).toBe(1)
    expect(countAnswered(questions, {})).toBe(0)
  })

  it('warns about exact-match scoring on the new types', () => {
    expect(questionTypeHint('SINGLE_CHOICE')).toBeNull()
    expect(questionTypeHint('TRUE_FALSE')).toBeNull()
    expect(questionTypeHint('MATCHING')).toMatch(/no partial credit/i)
    expect(questionTypeHint('ORDERING')).toMatch(/no partial credit/i)
    expect(questionTypeHint('MULTIPLE_SELECT')).toMatch(/no partial credit/i)
    expect(questionTypeHint('FILL_IN_THE_BLANK')).toMatch(/no partial credit/i)
  })
})

describe('formatAnswerText', () => {
  const choice = resultQuestion({ options })
  it('resolves option IDs through the question\u2019s own options', () => {
    expect(formatAnswerText(choice, 'b')).toBe('Beta')
    expect(formatAnswerText(choice, 'zzz')).toBe('zzz')
    expect(formatAnswerText(choice, null)).toBe('No answer')
  })

  it('renders booleans, short text, selections and orders as text', () => {
    expect(formatAnswerText(resultQuestion({ type: 'TRUE_FALSE' }), false)).toBe('False')
    expect(formatAnswerText(resultQuestion({ type: 'SHORT_ANSWER' }), 'Oxygen')).toBe('Oxygen')
    expect(formatAnswerText(resultQuestion({ type: 'MULTIPLE_SELECT', options }), ['c', 'a'])).toBe('Gamma, Alpha')
    expect(formatAnswerText(resultQuestion({ type: 'ORDERING', options }), ['b', 'a', 'c'])).toBe('Beta → Alpha → Gamma')
    expect(formatAnswerText(resultQuestion({ type: 'MULTIPLE_SELECT', options }), [])).toBe('No answer')
  })

  it('renders blank and matching maps row by row', () => {
    expect(formatAnswerText(resultQuestion({ type: 'FILL_IN_THE_BLANK' }), { b1: 'Mercury', b2: 'Venus' })).toBe('b1: Mercury, b2: Venus')
    const matching = resultQuestion({ type: 'MATCHING', options, right: [{ id: 'r1', text: 'Uno' }, { id: 'r2', text: 'Dos' }] })
    expect(formatAnswerText(matching, { a: 'r2', b: 'r1' })).toBe('Alpha → Dos; Beta → Uno')
  })
})

describe('scoreCopy / citationCopy / historySummaryCopy / timeLeftCopy', () => {
  const result = (overrides: Partial<AttemptResultDto> = {}): AttemptResultDto => ({
    attemptId: 'att_1',
    quizId: 'quiz_1',
    versionId: 'v1',
    score: 7,
    maxScore: 10,
    passingScore: 6,
    passed: true,
    submittedAt: '2026-03-04T10:00:00.000Z',
    explanationsComplete: true,
    questions: [],
    ...overrides,
  })

  it('headlines the server\u2019s pass/fail and score, never a client grade', () => {
    expect(scoreCopy(result())).toMatchObject({ headline: 'You passed' })
    expect(scoreCopy(result()).detail).toMatch(/7 of 10 points · Passing score 6/)
    expect(scoreCopy(result({ passed: false, score: 2 })).headline).toBe('Not passed yet')
  })

  it('cites the file, page and heading path as text', () => {
    expect(citationCopy({ kind: 'SOURCE', title: 'Biology.pdf', page: 12 as unknown as Record<string, never>, headingPath: ['Cells', 'Mitochondria'] })).toBe(
      'Biology.pdf · p. 12 · Cells › Mitochondria',
    )
    expect(citationCopy({ kind: 'NOTE', title: 'Lecture 3', headingPath: [] })).toBe('Lecture 3')
  })

  it('summarizes history rows from the server\u2019s own values', () => {
    const summary = (overrides: Partial<AttemptSummaryDto>): AttemptSummaryDto => ({
      attemptId: 'att_1',
      versionId: 'v1',
      state: 'SUBMITTED',
      startedAt: '2026-03-04T10:00:00.000Z',
      ...overrides,
    })
    expect(historySummaryCopy(summary({ score: 7 as unknown as Record<string, never>, maxScore: 10 as unknown as Record<string, never>, submittedAt: '2026-03-04T10:20:00.000Z' as unknown as Record<string, never> }))).toMatch(
      /7 of 10 points · Submitted /,
    )
    expect(historySummaryCopy(summary({ state: 'IN_PROGRESS' }))).toMatch(/In progress · Started /)
  })

  it('confirms submits with the unanswered count', () => {
    expect(submitConfirmCopy(10, 10)).toMatchObject({ title: 'Submit this attempt?' })
    expect(submitConfirmCopy(10, 10).body).toMatch(/answered all 10 questions/)
    expect(submitConfirmCopy(7, 10).body).toMatch(/3 of 10 questions are still unanswered.*score zero/)
  })

  it('labels every autosave state', () => {
    expect(saveIndicatorCopy('idle', null)).toMatch(/save as you go/)
    expect(saveIndicatorCopy('saving', null)).toBe('Saving…')
    expect(saveIndicatorCopy('saved', null)).toBe('Saved')
    expect(saveIndicatorCopy('saved', Date.parse('2026-03-04T10:00:00.000Z'))).toMatch(/^Saved /)
    expect(saveIndicatorCopy('error', null)).toMatch(/Couldn’t save/)
    expect(saveIndicatorCopy('offline', null)).toMatch(/Offline/)
  })

  it('counts down from the server deadline', () => {
    const deadline = '2026-03-04T10:10:00.000Z'
    expect(timeLeftCopy(null, Date.parse(deadline))).toBeNull()
    expect(timeLeftCopy(deadline, Date.parse('2026-03-04T10:07:30.000Z'))).toBe('2m 30s left')
    expect(timeLeftCopy(deadline, Date.parse('2026-03-04T10:09:45.000Z'))).toBe('15s left')
    expect(timeLeftCopy(deadline, Date.parse('2026-03-04T08:00:00.000Z'))).toBe('2h 10m left')
    expect(timeLeftCopy(deadline, Date.parse(deadline))).toMatch(/Time is up/)
    expect(timeLeftCopy('not-a-date', Date.now())).toMatch(/Time is up/)
  })
})
