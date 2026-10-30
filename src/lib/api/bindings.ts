import { apiFetch } from './client'
import type { Schema } from './types'

export type ContextBindingDto = Schema<'ContextBindingDto'>
export type ContextBindingList = Schema<'ContextBindingListDto'>
export type UpsertContextBinding = Schema<'UpsertContextBindingDto'>
export type UpsertContextBindingResult = Schema<'UpsertContextBindingResultDto'>

const id = (value: string) => encodeURIComponent(value)
const bindings = (noteId: string) => `/v1/notes/${id(noteId)}/context-bindings`

/** `/v1/notes/:noteId/context-bindings` (frontend-api-integration.md, "Reusing Sources in Spaces and Notes"). */
export const bindingsApi = {
  /** Every active binding (up to `limit`, 50), not paginated. */
  async list(noteId: string, signal?: AbortSignal) {
    return (await apiFetch<ContextBindingList>(bindings(noteId), { signal })).data
  },
  /** Creates the binding, or replaces the existing one for this Source. */
  async put(noteId: string, sourceId: string, body: UpsertContextBinding) {
    return (await apiFetch<UpsertContextBindingResult>(`${bindings(noteId)}/${id(sourceId)}`, { method: 'PUT', body })).data
  },
  /** Retries return 204. */
  async remove(noteId: string, sourceId: string) {
    await apiFetch<void>(`${bindings(noteId)}/${id(sourceId)}`, { method: 'DELETE' })
  },
}
