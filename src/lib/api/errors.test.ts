import { describe, expect, it } from 'vitest'
import { ApiError, apiErrorMessage } from './errors'

describe('apiErrorMessage', () => {
  it('uses the stable code, not the server message', () => {
    expect(apiErrorMessage(new ApiError(409, 'SPACE_NOT_ACTIVE', null, null, { message: 'raw' }))).toMatch(/archived/)
  })
  it('falls back by status for unknown codes', () => {
    expect(apiErrorMessage(new ApiError(429, 'SOMETHING_NEW', null, 3))).toMatch(/Too many/)
    expect(apiErrorMessage(new ApiError(502, 'HTTP_502', null, null))).toMatch(/our side/)
    expect(apiErrorMessage(new Error('x'))).toMatch(/Something went wrong/)
  })

  it('maps access loss to the no-longer-have-access copy', () => {
    expect(apiErrorMessage(new ApiError(403, 'NOTE_ACCESS_DENIED', 'req-1', null))).toMatch(/no longer have access/)
  })

  it.each([
    ['USE_TRANSACTIONS', /shared.*different way/],
    ['RESTORE_IN_PROGRESS', /restore is in progress.*shortly/],
    ['NOTE_NOT_DELETED', /already restored/],
    ['ROOM_DOCUMENT_TOO_LARGE', /size limit/],
    ['LIVE_COLLABORATION_UNAVAILABLE', /unavailable.*Nothing was applied/],
  ] as const)('maps %s to friendly copy', (code, pattern) => {
    expect(apiErrorMessage(new ApiError(500, code, 'req-1', null))).toMatch(pattern)
  })

  it.each([
    ['COLLABORATOR_LIMIT_REACHED', /sharing limit.*Upgrade/],
    ['SHARE_TARGET_INVALID', /can’t be invited/],
    ['GRANT_NOT_FOUND', /no longer a collaborator/],
    ['INVITATION_EMAIL_MISMATCH', /different email address.*Sign in with that address/],
    ['INVITATION_INVALID', /no longer valid/],
    ['SHARE_LINK_INVALID', /invalid or has expired/],
    ['COLLABORATION_DISABLED', /unavailable right now/],
  ] as const)('maps sharing code %s to friendly copy', (code, pattern) => {
    expect(apiErrorMessage(new ApiError(500, code, 'req-1', null))).toMatch(pattern)
  })

  it.each([
    ['NOTIFICATION_NOT_FOUND', /notification is gone/],
    ['UNSUBSCRIBE_LINK_INVALID', /unsubscribe link is invalid or has expired/],
  ] as const)('maps notification code %s to friendly copy', (code, pattern) => {
    expect(apiErrorMessage(new ApiError(500, code, 'req-1', null))).toMatch(pattern)
  })

  it.each([
    ['QUIZ_NOT_FOUND', /quiz no longer exists/],
    ['QUIZ_NOT_READY', /isn’t ready yet/],
    ['QUIZ_ATTEMPT_NOT_FOUND', /attempt is gone.*Start a new one/],
    ['QUIZ_ATTEMPT_SUBMITTED', /already submitted/],
    ['QUIZ_ATTEMPT_EXPIRED', /Time ran out.*submit to see your score/],
    ['QUIZ_ATTEMPT_CONFLICT', /changed somewhere else/],
    ['QUIZ_ATTEMPT_NOT_SUBMITTED', /Submit this attempt first/],
    ['QUIZ_ANSWER_INVALID', /doesn’t fit its question/],
  ] as const)('maps quiz code %s to friendly copy', (code, pattern) => {
    expect(apiErrorMessage(new ApiError(500, code, 'req-1', null))).toMatch(pattern)
  })

  it.each([
    ['FLASHCARD_DECK_NOT_FOUND', /deck no longer exists/],
    ['FLASHCARD_DECK_NOT_READY', /deck isn’t ready yet/],
    ['FLASHCARD_VERSION_CHANGED', /deck changed.*latest cards/],
    ['FLASHCARD_VERSION_NOT_FOUND', /deck changed.*latest cards/],
    ['FLASHCARD_NOT_FOUND', /card is gone/],
    ['FLASHCARD_REVIEW_CONFLICT', /changed before your review landed/],
    ['FLASHCARD_REVIEW_INVALID', /didn’t fit the card/],
    ['FLASHCARD_CARDS_INVALID', /up to 8 current cards/],
    ['FLASHCARD_PAGE_INVALID', /Reload the deck/],
    ['FLASHCARD_CURSOR_INVALID', /from the top/],
    ['FLASHCARD_PREFERENCES_INVALID', /deck options/],
    ['FLASHCARD_TOO_FEW_VALID_CARDS', /Not enough cards/],
    ['FLASHCARD_REGENERATION_FAILED', /Nothing changed/],
    ['ARTIFACT_SCOPE_EMPTY', /nothing to make cards from/],
    ['ARTIFACT_SCOPE_NOT_READY', /still getting ready/],
    ['ARTIFACT_ACCESS_REVOKED', /was removed/],
    ['ARTIFACT_DEADLINE_EXHAUSTED', /timed out/],
    ['ARTIFACT_JOB_NOT_FOUND', /generation is gone/],
  ] as const)('maps flashcard code %s to friendly copy', (code, pattern) => {
    expect(apiErrorMessage(new ApiError(500, code, 'req-1', null))).toMatch(pattern)
  })
})
