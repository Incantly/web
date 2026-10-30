import { describe, expect, it } from 'vitest'
import { ApiError } from '../../../lib/api/errors'
import { SOURCE_DRAG_TYPE, dropFeedback, isSourceDrag } from './sourceDragModel'

describe('isSourceDrag', () => {
  it('accepts only a Library source drag', () => {
    expect(isSourceDrag([SOURCE_DRAG_TYPE, 'text/plain'])).toBe(true)
    expect(isSourceDrag(['Files'])).toBe(false)
    expect(isSourceDrag(['text/plain'])).toBe(false)
  })
})

describe('dropFeedback', () => {
  it('says whether the source was added or already there', () => {
    expect(dropFeedback({ created: true })).toEqual({ tone: 'done', text: 'Added' })
    expect(dropFeedback({ created: false })).toEqual({ tone: 'done', text: 'Already in this Space' })
  })

  it('names the Space when asked', () => {
    expect(dropFeedback({ created: true }, 'Biology').text).toBe('Added to Biology')
    expect(dropFeedback({ created: false }, 'Biology').text).toBe('Already in Biology')
  })

  it('explains a failure in plain words', () => {
    const feedback = dropFeedback({ error: new ApiError(409, 'SPACE_SOURCE_LIMIT_REACHED', null, null) })
    expect(feedback.tone).toBe('error')
    expect(feedback.text).toMatch(/maximum of 200/)
  })
})
