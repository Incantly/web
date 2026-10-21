import { apiFetch } from './client'
import type { Page, Schema } from './types'

export type SourceDto = Schema<'SourceDto'>
export type SourceVersionDto = Schema<'SourceVersionDto'>
export type SourceProcessingDto = Schema<'SourceProcessingDto'>
export type CreateSource = Schema<'CreateSourceDto'>
export type UpdateSource = Schema<'UpdateSourceDto'>

const id = (value: string) => encodeURIComponent(value)

/** `/v1/library/*` (frontend-api-integration.md, "Library Sources and versions" and "Processing controls"). */
export const libraryApi = {
  async list(params: { cursor?: string | null; limit?: number; kind?: SourceDto['kind']; status?: Exclude<SourceDto['status'], 'DELETED'> } = {}, signal?: AbortSignal) {
    const query = new URLSearchParams({ limit: String(params.limit ?? 25) })
    if (params.cursor) query.set('cursor', params.cursor)
    if (params.kind) query.set('kind', params.kind)
    if (params.status) query.set('status', params.status)
    return (await apiFetch<Page<SourceDto>>(`/v1/library/sources?${query}`, { signal })).data
  },
  async get(sourceId: string, signal?: AbortSignal) {
    return (await apiFetch<SourceDto>(`/v1/library/sources/${id(sourceId)}`, { signal })).data
  },
  /** Re-adding the same Asset or Note revision returns the existing Source (and links any new Spaces). */
  async createSource(body: CreateSource, idempotencyKey: string) {
    return (await apiFetch<SourceDto>('/v1/library/sources', { method: 'POST', body, idempotencyKey })).data
  },
  async update(sourceId: string, body: UpdateSource) {
    return (await apiFetch<SourceDto>(`/v1/library/sources/${id(sourceId)}`, { method: 'PATCH', body })).data
  },
  async archive(sourceId: string) {
    return (await apiFetch<SourceDto>(`/v1/library/sources/${id(sourceId)}/archive`, { method: 'POST' })).data
  },
  async restore(sourceId: string) {
    return (await apiFetch<SourceDto>(`/v1/library/sources/${id(sourceId)}/restore`, { method: 'POST' })).data
  },
  /** Removes its Space links and Note bindings too. The Asset or Note revision stays. */
  async remove(sourceId: string) {
    await apiFetch<void>(`/v1/library/sources/${id(sourceId)}`, { method: 'DELETE' })
  },
  async processing(sourceId: string, signal?: AbortSignal) {
    return (await apiFetch<SourceProcessingDto>(`/v1/library/sources/${id(sourceId)}/processing`, { signal })).data
  },
  async retry(sourceId: string) {
    return (await apiFetch<SourceProcessingDto>(`/v1/library/sources/${id(sourceId)}/retry-processing`, { method: 'POST' })).data
  },
  async cancel(sourceId: string) {
    return (await apiFetch<SourceProcessingDto>(`/v1/library/sources/${id(sourceId)}/cancel-processing`, { method: 'POST' })).data
  },
}
