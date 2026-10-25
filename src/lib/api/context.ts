import { apiFetch } from './client'
import type { Schema } from './types'

export type IndexStatusDto = Schema<'IndexStatusDto'>
type PreviewDefaults = 'includeSpaceNotes' | 'maxPassages' | 'evidenceTokens'
/** Fields with server defaults are optional (the generated schema marks them required). */
export type ContextPreviewRequest = Omit<Schema<'ContextPreviewDto'>, PreviewDefaults> & Partial<Pick<Schema<'ContextPreviewDto'>, PreviewDefaults>>
export type ContextPreviewResult = Schema<'ContextPreviewResultDto'>
export type EvidenceDto = Schema<'EvidenceDto'>
export type ContextScope = ContextPreviewRequest['scope']

const id = (value: string) => encodeURIComponent(value)

/** `/v1/context/*` and the index-status routes (frontend-api-integration.md, "Context"). */
export const contextApi = {
  async noteIndexStatus(noteId: string, signal?: AbortSignal) {
    return (await apiFetch<IndexStatusDto>(`/v1/notes/${id(noteId)}/index-status`, { signal })).data
  },
  async sourceIndexStatus(sourceId: string, signal?: AbortSignal) {
    return (await apiFetch<IndexStatusDto>(`/v1/library/sources/${id(sourceId)}/index-status`, { signal })).data
  },
  /** Rate limited: a 429 is surfaced (not retried) so the UI can count down `Retry-After`. */
  async reindexNote(noteId: string) {
    return (await apiFetch<Schema<'ReindexScheduledDto'>>(`/v1/notes/${id(noteId)}/reindex`, { method: 'POST', maxAttempts: 1 })).data
  },
  /**
   * Cited passages the AI would use for `query` within `scope`. Passage text is untrusted user
   * content: render it as text. A 429 is surfaced (not retried) so the UI can count down.
   */
  async preview(body: ContextPreviewRequest, signal?: AbortSignal) {
    return (await apiFetch<ContextPreviewResult>('/v1/context/preview', { method: 'POST', body, signal, maxAttempts: 1 })).data
  },
}
