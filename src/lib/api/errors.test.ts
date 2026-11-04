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
})
