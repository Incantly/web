import { apiFetch } from './client'
import type { Schema } from './types'

export type ImportJobDto = Schema<'ImportJobDto'>
export type ImportStatus = ImportJobDto['status']

const id = (value: string) => encodeURIComponent(value)

/** `/v1/imports/*` (frontend-api-integration.md, "Imports"). */
export const importsApi = {
  /** A READY `text/plain` or `text/markdown` Asset (≤10 MiB). Omit `targetNoteId` for a new note. */
  async importFile(body: Schema<'CreateFileImportDto'>, idempotencyKey: string) {
    return (await apiFetch<ImportJobDto>('/v1/imports/files', { method: 'POST', body, idempotencyKey })).data
  },
  async importUrl(body: Schema<'CreateUrlImportDto'>, idempotencyKey: string) {
    return (await apiFetch<ImportJobDto>('/v1/imports/urls', { method: 'POST', body, idempotencyKey })).data
  },
  async get(importId: string, signal?: AbortSignal) {
    return (await apiFetch<ImportJobDto>(`/v1/imports/${id(importId)}`, { signal })).data
  },
  /** Only while `queued`; a running import answers 409 IMPORT_NOT_CANCELLABLE. */
  async cancel(importId: string) {
    await apiFetch<void>(`/v1/imports/${id(importId)}`, { method: 'DELETE' })
  },
}

export const IMPORT_MAX_BYTES = 10 * 1024 * 1024

export function importSettled(status: ImportStatus) {
  return status === 'completed' || status === 'failed' || status === 'cancelled'
}
