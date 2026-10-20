import type { Sensitivity, SourceKind } from './model'

/** Everything the "Add to Library" form collects. Phase 5 turns this into upload + `POST /v1/library/sources`. */
export type AddSourceInput = {
  kind: SourceKind
  title: string
  sensitivity: Sensitivity
  spaceIds: string[]
  file?: File
  captions?: File
  url?: string
  youtubeUrl?: string
  text?: string
  noteId?: string
  transcriptionConsent?: boolean
}

export type AddSourceFields = {
  kind: SourceKind
  title: string
  sensitivity: Sensitivity
  spaceIds: string[]
  file: File | null
  captions: File | null
  url: string
  youtubeUrl: string
  text: string
  noteId: string
  consent: boolean
}

const MiB = 1024 * 1024
export const LIMITS = { fileBytes: 250 * MiB, audioBytes: 200 * MiB, pastedBytes: 512 * 1024, spaces: 20, title: 300 } as const

const documentTypes = new Set(['application/pdf', 'text/plain', 'text/markdown'])
const documentExtensions = /\.(pdf|txt|md|markdown)$/i
const captionExtensions = /\.(vtt|srt)$/i
const youtubeId = /^[A-Za-z0-9_-]{11}$/

export function utf8Bytes(text: string) {
  return new TextEncoder().encode(text).length
}

/** Accepts a YouTube watch, short, embed or youtu.be URL, or a bare 11-character video ID. */
export function isYoutubeReference(value: string) {
  const trimmed = value.trim()
  if (youtubeId.test(trimmed)) return true
  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false
    const host = url.hostname.replace(/^www\.|^m\./, '')
    if (host === 'youtu.be') return youtubeId.test(url.pathname.slice(1))
    if (host !== 'youtube.com') return false
    const id = url.searchParams.get('v') ?? url.pathname.split('/').filter(Boolean)[1] ?? ''
    return youtubeId.test(id)
  } catch { return false }
}

export function isHttpsUrl(value: string) {
  try { return new URL(value.trim()).protocol === 'https:' } catch { return false }
}

/** A sensible title when the user leaves it blank. */
export function defaultTitle(fields: AddSourceFields, noteTitle?: string) {
  if (fields.title.trim()) return fields.title.trim().slice(0, LIMITS.title)
  switch (fields.kind) {
    case 'FILE': case 'AUDIO_TRANSCRIPT': return fields.file?.name ?? ''
    case 'YOUTUBE_TRANSCRIPT': return fields.captions?.name.replace(captionExtensions, '') ?? 'YouTube video'
    case 'WEB_PAGE': try { return new URL(fields.url.trim()).hostname } catch { return '' }
    case 'PASTED_TEXT': return (fields.text.trim().split('\n')[0] ?? '').slice(0, 80)
    case 'NOTE_REVISION': return noteTitle ?? ''
  }
}

/** Returns the first problem as a field-keyed message, or null when the form can be sent. */
export function validateSource(fields: AddSourceFields): { field: keyof AddSourceFields; message: string } | null {
  if (fields.title.trim().length > LIMITS.title) return { field: 'title', message: `Keep the title under ${LIMITS.title} characters.` }
  if (fields.spaceIds.length > LIMITS.spaces) return { field: 'spaceIds', message: `Choose up to ${LIMITS.spaces} Spaces.` }
  switch (fields.kind) {
    case 'FILE':
      if (!fields.file) return { field: 'file', message: 'Choose a PDF, text or Markdown file.' }
      if (!documentTypes.has(fields.file.type) && !documentExtensions.test(fields.file.name)) return { field: 'file', message: 'Only PDF, text and Markdown files can be added.' }
      if (fields.file.size > LIMITS.fileBytes) return { field: 'file', message: 'Files can be up to 250 MB.' }
      return null
    case 'AUDIO_TRANSCRIPT':
      if (!fields.file) return { field: 'file', message: 'Choose an audio recording.' }
      if (!fields.file.type.startsWith('audio/')) return { field: 'file', message: 'Choose an audio file such as MP3 or WAV.' }
      if (fields.file.size > LIMITS.audioBytes) return { field: 'file', message: 'Recordings can be up to 200 MB.' }
      if (!fields.consent) return { field: 'consent', message: 'Confirm you have permission to record and transcribe this audio.' }
      return null
    case 'YOUTUBE_TRANSCRIPT':
      if (!isYoutubeReference(fields.youtubeUrl)) return { field: 'youtubeUrl', message: 'Paste the YouTube video link or ID.' }
      if (!fields.captions) return { field: 'captions', message: 'Add the caption file (.vtt or .srt) for this video.' }
      if (!captionExtensions.test(fields.captions.name)) return { field: 'captions', message: 'Caption files must be .vtt or .srt.' }
      return null
    case 'WEB_PAGE':
      return isHttpsUrl(fields.url) ? null : { field: 'url', message: 'Enter a web address starting with https://.' }
    case 'PASTED_TEXT':
      if (!fields.text.trim()) return { field: 'text', message: 'Paste some text to add.' }
      if (utf8Bytes(fields.text) > LIMITS.pastedBytes) return { field: 'text', message: 'Pasted text can be up to 512 KB.' }
      return null
    case 'NOTE_REVISION':
      return fields.noteId ? null : { field: 'noteId', message: 'Choose a note to add.' }
  }
}

export function toInput(fields: AddSourceFields, noteTitle?: string): AddSourceInput {
  const base = { kind: fields.kind, title: defaultTitle(fields, noteTitle), sensitivity: fields.sensitivity, spaceIds: fields.spaceIds }
  switch (fields.kind) {
    case 'FILE': return { ...base, file: fields.file ?? undefined }
    case 'AUDIO_TRANSCRIPT': return { ...base, file: fields.file ?? undefined, transcriptionConsent: true }
    case 'YOUTUBE_TRANSCRIPT': return { ...base, captions: fields.captions ?? undefined, youtubeUrl: fields.youtubeUrl.trim() }
    case 'WEB_PAGE': return { ...base, url: fields.url.trim() }
    case 'PASTED_TEXT': return { ...base, text: fields.text }
    case 'NOTE_REVISION': return { ...base, noteId: fields.noteId }
  }
}
