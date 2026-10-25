import { describe, expect, it } from 'vitest'
import { importPollDelay, importStatusText, parseTracked, validateImportFile, validateImportUrl } from './importModel'

describe('import inputs', () => {
  it('accepts only text and Markdown up to 10 MB', () => {
    expect(validateImportFile({ name: 'a.md', type: '', size: 10 })).toBeNull()
    expect(validateImportFile({ name: 'a.txt', type: 'text/plain', size: 10 })).toBeNull()
    expect(validateImportFile({ name: 'a.pdf', type: 'application/pdf', size: 10 })).toMatch(/plain text/)
    expect(validateImportFile({ name: 'a.md', type: 'text/markdown', size: 0 })).toMatch(/empty/)
    expect(validateImportFile({ name: 'a.md', type: 'text/markdown', size: 10 * 1024 * 1024 + 1 })).toMatch(/10 MB/)
  })
  it('accepts only https addresses and exposes just the host', () => {
    expect(validateImportUrl(' https://example.org/a?b=1 ')).toEqual({ ok: true, url: 'https://example.org/a?b=1', host: 'example.org' })
    expect(validateImportUrl('http://example.org')).toMatchObject({ ok: false })
    expect(validateImportUrl('example.org')).toMatchObject({ ok: false })
    expect(validateImportUrl('')).toMatchObject({ ok: false })
  })
})

describe('tracked imports', () => {
  it('drops malformed and day-old records', () => {
    const now = 1_000_000_000
    const raw = JSON.stringify([{ id: 'a', label: 'a.md', intoNoteId: null, startedAt: now - 1000 }, { id: 'b', label: 'b', intoNoteId: null, startedAt: now - 25 * 3600 * 1000 }, { id: 3 }, null])
    expect(parseTracked(raw, now).map((item) => item.id)).toEqual(['a'])
    expect(parseTracked('not json', now)).toEqual([])
    expect(parseTracked(null, now)).toEqual([])
  })
  it('describes status and polls every 2–5 s', () => {
    expect(importStatusText({ status: 'completed' }, true)).toBe('Added to the note')
    expect(importStatusText({ status: 'queued' }, false)).toBe('Waiting to start')
    expect(importPollDelay(0)).toBe(2000)
    expect(importPollDelay(20)).toBe(5000)
  })
})
