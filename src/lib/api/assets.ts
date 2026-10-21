import { apiFetch } from './client'
import type { Schema } from './types'

export type AssetDto = Schema<'AssetDto'>
export type UploadReservation = Schema<'UploadReservationDto'>
export type UploadPartInstruction = Schema<'UploadPartInstructionDto'>
export type AssetDownload = Schema<'AssetDownloadDto'>
export type AssetContentType = Schema<'ReserveUploadDto'>['contentType']
export type ReserveUpload = Schema<'ReserveUploadDto'>
export type CompletedPart = { partNumber: number; entityTag: string }

const id = (value: string) => encodeURIComponent(value)

/**
 * Thin wrappers over `/v1/assets/*` (frontend-api-integration.md, "Asset upload API").
 * Presigned URLs in the responses are credentials: callers use them at once and never persist or log them.
 */
export const assetsApi = {
  async reserve(body: ReserveUpload, idempotencyKey: string, signal?: AbortSignal) {
    return (await apiFetch<UploadReservation>('/v1/assets/uploads', { method: 'POST', body, idempotencyKey, signal })).data
  },
  async complete(uploadId: string, parts: CompletedPart[] | null, signal?: AbortSignal) {
    return (await apiFetch<AssetDto>(`/v1/assets/uploads/${id(uploadId)}/complete`, { method: 'POST', body: parts ? { parts } : {}, signal })).data
  },
  async abort(uploadId: string) {
    await apiFetch<void>(`/v1/assets/uploads/${id(uploadId)}`, { method: 'DELETE' })
  },
  async download(assetId: string, signal?: AbortSignal) {
    return (await apiFetch<AssetDownload>(`/v1/assets/${id(assetId)}/download`, { signal })).data
  },
  async remove(assetId: string) {
    await apiFetch<void>(`/v1/assets/${id(assetId)}`, { method: 'DELETE' })
  },
}
