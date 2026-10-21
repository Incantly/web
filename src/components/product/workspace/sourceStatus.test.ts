import { describe, expect, it } from 'vitest'
import { failureText, isProcessing, partialText, pollDelay, processingSummary, stageLabel } from './sourceStatus'

describe('source status words', () => {
  it('names every processing stage', () => {
    expect(stageLabel('QUEUED_FOR_PROCESSOR')).toBe('Queued')
    expect(stageLabel('TRANSCRIBING')).toBe('Transcribing')
    expect(stageLabel(null)).toBeNull()
  })

  it('explains failures and partial results in words, with safe fallbacks', () => {
    expect(failureText('PDF_NO_TEXT_LAYER')).toMatch(/scanned PDF/)
    expect(failureText('REMOTE_SOMETHING_NEW')).toBe('That page couldn’t be fetched.')
    expect(failureText('UNKNOWN')).toBe('Processing failed.')
    expect(partialText('PDF_PAGE_LIMIT')).toMatch(/first pages/)
    expect(partialText(null)).toMatch(/Part of this source/)
  })

  it('treats images awaiting a processor as added but not searchable, and settled', () => {
    expect(processingSummary('PROCESSING', { processingStage: 'AWAITING_PROCESSOR' })).toMatch(/not searchable/)
    expect(isProcessing('PROCESSING', 'AWAITING_PROCESSOR')).toBe(false)
    expect(isProcessing('PROCESSING', 'PARSING')).toBe(true)
    expect(isProcessing('PENDING')).toBe(true)
    expect(processingSummary('PROCESSING', { processingStage: 'PARSING' })).toBe('Parsing…')
    expect(processingSummary('QUARANTINED')).toMatch(/can’t be retried/)
  })

  it('backs off polling from 1 s to 5 s', () => {
    expect([0, 1, 2, 10].map(pollDelay)).toEqual([1000, 1500, 2250, 5000])
  })
})
