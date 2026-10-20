import { apiFetch } from './client'
import type { Page, Schema } from './types'

export type SpaceDto = Schema<'SpaceDto'>
export type SpaceNoteDto = Schema<'SpaceNoteDto'>
export type SpaceSourceLinkDto = Schema<'SpaceSourceLinkDto'>
export type SpaceSourceList = Schema<'SpaceSourceListDto'>
export type CreateSpace = Schema<'CreateSpaceDto'>
export type UpdateSpace = Schema<'UpdateSpaceDto'>
export type UpdateSpaceSource = Schema<'UpdateSpaceSourceDto'>

const id = (value: string) => encodeURIComponent(value)
const space = (spaceId: string) => `/v1/spaces/${id(spaceId)}`

/** `/v1/spaces/*` (frontend-api-integration.md, "Space lifecycle and Note membership", "Reusing Sources in Spaces"). */
export const spacesApi = {
  async list(params: { cursor?: string | null; limit?: number; status?: 'ACTIVE' | 'ARCHIVED' } = {}, signal?: AbortSignal) {
    const query = new URLSearchParams({ limit: String(params.limit ?? 25) })
    if (params.cursor) query.set('cursor', params.cursor)
    if (params.status) query.set('status', params.status)
    return (await apiFetch<Page<SpaceDto>>(`/v1/spaces?${query}`, { signal })).data
  },
  async get(spaceId: string, signal?: AbortSignal) {
    return (await apiFetch<SpaceDto>(space(spaceId), { signal })).data
  },
  async create(body: CreateSpace, idempotencyKey: string) {
    return (await apiFetch<SpaceDto>('/v1/spaces', { method: 'POST', body, idempotencyKey })).data
  },
  /** An empty `description` or `icon` clears it. */
  async update(spaceId: string, body: UpdateSpace) {
    return (await apiFetch<SpaceDto>(space(spaceId), { method: 'PATCH', body })).data
  },
  async archive(spaceId: string) {
    return (await apiFetch<SpaceDto>(`${space(spaceId)}/archive`, { method: 'POST' })).data
  },
  async restore(spaceId: string) {
    return (await apiFetch<SpaceDto>(`${space(spaceId)}/restore`, { method: 'POST' })).data
  },
  /** Notes become standalone and Source links are removed; nothing else is deleted. */
  async remove(spaceId: string) {
    await apiFetch<void>(space(spaceId), { method: 'DELETE' })
  },
  async notes(spaceId: string, params: { cursor?: string | null; limit?: number } = {}, signal?: AbortSignal) {
    const query = new URLSearchParams({ limit: String(params.limit ?? 50) })
    if (params.cursor) query.set('cursor', params.cursor)
    return (await apiFetch<Page<SpaceNoteDto>>(`${space(spaceId)}/notes?${query}`, { signal })).data
  },
  /** Assigns a note, or moves it from another Space. Never creates a revision. */
  async addNote(spaceId: string, noteId: string) {
    return (await apiFetch<Schema<'NoteMembershipDto'>>(`${space(spaceId)}/notes/${id(noteId)}`, { method: 'PUT' })).data
  },
  async removeNote(spaceId: string, noteId: string) {
    await apiFetch<void>(`${space(spaceId)}/notes/${id(noteId)}`, { method: 'DELETE' })
  },
  async setHomeNote(spaceId: string, noteId: string) {
    return (await apiFetch<Schema<'HomeNoteDto'>>(`${space(spaceId)}/home-note/${id(noteId)}`, { method: 'PUT' })).data
  },
  async clearHomeNote(spaceId: string) {
    await apiFetch<void>(`${space(spaceId)}/home-note`, { method: 'DELETE' })
  },
  async sources(spaceId: string, signal?: AbortSignal) {
    return (await apiFetch<SpaceSourceList>(`${space(spaceId)}/sources`, { signal })).data
  },
  /** `created: false` means it was already linked. */
  async linkSource(spaceId: string, sourceId: string) {
    return (await apiFetch<Schema<'LinkSourceResultDto'>>(`${space(spaceId)}/sources/${id(sourceId)}`, { method: 'PUT' })).data
  },
  async updateLink(spaceId: string, sourceId: string, body: UpdateSpaceSource) {
    return (await apiFetch<SpaceSourceLinkDto>(`${space(spaceId)}/sources/${id(sourceId)}`, { method: 'PATCH', body })).data
  },
  async unlinkSource(spaceId: string, sourceId: string) {
    await apiFetch<void>(`${space(spaceId)}/sources/${id(sourceId)}`, { method: 'DELETE' })
  },
}
