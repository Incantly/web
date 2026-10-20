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
})
