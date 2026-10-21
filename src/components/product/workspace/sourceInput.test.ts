import { describe, expect, it } from 'vitest'
import { LIMITS, defaultTitle, isYoutubeReference, toInput, validateSource, type AddSourceFields } from './sourceInput'

const base: AddSourceFields = { kind: 'FILE', title: '', sensitivity: 'PRIVATE', spaceIds: [], file: null, captions: null, url: '', youtubeUrl: '', text: '', noteId: '', consent: false }
const file = (name: string, type: string, size = 10) => new File([new Uint8Array(size)], name, { type })

describe('validateSource', () => {
  it('requires a supported document for FILE', () => {
    expect(validateSource(base)?.field).toBe('file')
    expect(validateSource({ ...base, file: file('a.png', 'image/png') })?.message).toMatch(/PDF, text and Markdown/)
    expect(validateSource({ ...base, file: file('notes.md', '') })).toBeNull()
    expect(validateSource({ ...base, file: file('paper.pdf', 'application/pdf') })).toBeNull()
  })

  it('requires consent for audio', () => {
    const audio = { ...base, kind: 'AUDIO_TRANSCRIPT' as const, file: file('lecture.mp3', 'audio/mpeg') }
    expect(validateSource(audio)?.field).toBe('consent')
    expect(validateSource({ ...audio, consent: true })).toBeNull()
    expect(validateSource({ ...audio, consent: true, file: file('x.pdf', 'application/pdf') })?.field).toBe('file')
  })

  it('needs a video reference and a caption file for YouTube', () => {
    const yt = { ...base, kind: 'YOUTUBE_TRANSCRIPT' as const }
    expect(validateSource(yt)?.field).toBe('youtubeUrl')
    expect(validateSource({ ...yt, youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ' })?.field).toBe('captions')
    expect(validateSource({ ...yt, youtubeUrl: 'dQw4w9WgXcQ', captions: file('talk.srt', '') })).toBeNull()
    expect(validateSource({ ...yt, youtubeUrl: 'dQw4w9WgXcQ', captions: file('talk.txt', 'text/plain') })?.field).toBe('captions')
  })

  it('accepts only https web pages', () => {
    const web = { ...base, kind: 'WEB_PAGE' as const }
    expect(validateSource({ ...web, url: 'http://example.com' })?.field).toBe('url')
    expect(validateSource({ ...web, url: 'https://example.com/article' })).toBeNull()
  })

  it('limits pasted text to 512 KB of UTF-8', () => {
    const paste = { ...base, kind: 'PASTED_TEXT' as const }
    expect(validateSource({ ...paste, text: '   ' })?.field).toBe('text')
    expect(validateSource({ ...paste, text: 'é'.repeat(LIMITS.pastedBytes / 2 + 1) })?.field).toBe('text')
    expect(validateSource({ ...paste, text: 'Mitochondria produce ATP.' })).toBeNull()
  })

  it('caps Spaces at 20', () => {
    expect(validateSource({ ...base, file: file('a.txt', 'text/plain'), spaceIds: Array.from({ length: 21 }, (_, i) => `s${i}`) })?.field).toBe('spaceIds')
  })
})

describe('youtube references', () => {
  it.each(['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://youtu.be/dQw4w9WgXcQ', 'https://m.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'])('accepts %s', (value) => {
    expect(isYoutubeReference(value)).toBe(true)
  })
  it.each(['https://vimeo.com/123', 'not a link', 'https://youtube.com/watch?v=short'])('rejects %s', (value) => {
    expect(isYoutubeReference(value)).toBe(false)
  })
})

describe('defaultTitle / toInput', () => {
  it('derives titles from the input when blank', () => {
    expect(defaultTitle({ ...base, file: file('Biology 101.pdf', 'application/pdf') })).toBe('Biology 101.pdf')
    expect(defaultTitle({ ...base, kind: 'WEB_PAGE', url: 'https://example.org/x' })).toBe('example.org')
    expect(defaultTitle({ ...base, kind: 'PASTED_TEXT', text: 'First line\nsecond' })).toBe('First line')
    expect(defaultTitle({ ...base, kind: 'NOTE_REVISION', noteId: 'n1' }, 'My note')).toBe('My note')
    expect(defaultTitle({ ...base, title: '  Mine  ' })).toBe('Mine')
  })
  it('only carries the fields for the chosen kind', () => {
    expect(toInput({ ...base, kind: 'WEB_PAGE', url: ' https://a.org ', text: 'ignored' })).toEqual({ kind: 'WEB_PAGE', title: 'a.org', sensitivity: 'PRIVATE', spaceIds: [], url: 'https://a.org' })
    expect(toInput({ ...base, kind: 'AUDIO_TRANSCRIPT', consent: true })).toMatchObject({ transcriptionConsent: true })
  })
})
