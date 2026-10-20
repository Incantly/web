import { apiFetch } from './client'
import type { Schema } from './types'

export type SourceDto = Schema<'SourceDto'>
export type CreateSource = Schema<'CreateSourceDto'>

/** `/v1/library/*` (frontend-api-integration.md, "Library API"). Phase 5 adds listing and management. */
export const libraryApi = {
  async createSource(body: CreateSource, idempotencyKey: string) {
    return (await apiFetch<SourceDto>('/v1/library/sources', { method: 'POST', body, idempotencyKey })).data
  },
}
