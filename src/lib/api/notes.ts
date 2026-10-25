import type { IncantlyDocument } from '@incantly/canvas-core/document'
import type { DocumentOperation } from '@incantly/canvas-core/document'
import { apiFetch } from './client'
import type { Page, Schema } from './types'

export type NoteDto = Schema<'NoteDto'>
export type NoteRevisionDto = Schema<'NoteRevisionDto'>
export type NoteTransactionAck = Schema<'NoteTransactionAckDto'>
/** The checkpoint document is untrusted JSON until it passes the load gate. */
export type NoteCheckpoint = { revision: NoteRevisionDto; document: unknown }

export type NoteTransaction = {
  version: 1
  transactionId: string
  clientId: string
  localSequence: string
  baseRevisionNumber: number
  operations: readonly DocumentOperation[]
}

const id = (value: string) => encodeURIComponent(value)

/** Thin wrappers over `/v1/notes/*` (frontend-api-integration.md, "Notes API"). */
export const notesApi = {
  async list(params: { cursor?: string | null; limit?: number } = {}, signal?: AbortSignal) {
    const query = new URLSearchParams({ limit: String(params.limit ?? 25) })
    if (params.cursor) query.set('cursor', params.cursor)
    return (await apiFetch<Page<NoteDto>>(`/v1/notes?${query}`, { signal })).data
  },
  async create(title: string, idempotencyKey: string) {
    return (await apiFetch<NoteDto>('/v1/notes', { method: 'POST', body: { title }, idempotencyKey })).data
  },
  async get(noteId: string, signal?: AbortSignal) {
    return (await apiFetch<NoteDto>(`/v1/notes/${id(noteId)}`, { signal })).data
  },
  async checkpoint(noteId: string, signal?: AbortSignal) {
    return (await apiFetch<NoteCheckpoint>(`/v1/notes/${id(noteId)}/checkpoint`, { signal })).data
  },
  async saveCheckpoint(noteId: string, baseRevisionNumber: number, document: IncantlyDocument) {
    return (await apiFetch<Schema<'NoteRevisionResultDto'>>(`/v1/notes/${id(noteId)}/checkpoint`, { method: 'PUT', body: { baseRevisionNumber, document } })).data
  },
  async transact(noteId: string, transaction: NoteTransaction) {
    return (await apiFetch<NoteTransactionAck>(`/v1/notes/${id(noteId)}/transactions`, { method: 'POST', body: transaction })).data
  },
  async revisions(noteId: string, signal?: AbortSignal) {
    return (await apiFetch<Schema<'NoteRevisionListDto'>>(`/v1/notes/${id(noteId)}/revisions`, { signal })).data.items
  },
  async revision(noteId: string, revisionId: string, signal?: AbortSignal) {
    return (await apiFetch<NoteCheckpoint>(`/v1/notes/${id(noteId)}/revisions/${id(revisionId)}`, { signal })).data
  },
  async restore(noteId: string, sourceRevisionId: string) {
    return (await apiFetch<Schema<'NoteRevisionResultDto'>>(`/v1/notes/${id(noteId)}/restore`, { method: 'POST', body: { sourceRevisionId } })).data
  },
  async remove(noteId: string) {
    await apiFetch<void>(`/v1/notes/${id(noteId)}`, { method: 'DELETE' })
  },
}
