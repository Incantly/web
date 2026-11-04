import { apiFetch } from './client'
import type { Schema } from './types'

export type GrantRole = Schema<'GrantDto'>['role']
export type GrantDto = Schema<'GrantDto'>
export type InvitationDto = Schema<'InvitationDto'>
export type CreatedInvitationDto = Schema<'CreatedInvitationDto'>
export type CollaboratorsDto = Schema<'CollaboratorsDto'>
export type CreateGrantDto = Schema<'CreateGrantDto'>
export type UpdateGrantRoleDto = Schema<'UpdateGrantRoleDto'>
export type CreateShareLinkDto = Schema<'CreateShareLinkDto'>
export type ShareLinkDto = Schema<'ShareLinkDto'>
export type MyInvitationDto = Schema<'MyInvitationDto'>
export type SharedCheckpointDto = Schema<'SharedCheckpointDto'>
export type ShareUserDto = Schema<'ShareUserDto'>

/**
 * `POST /grants` result: a live grant for a verified user, or a pending invitation otherwise.
 * Re-posting the same person and role is a no-op; an invitation replay omits the token.
 */
export type ShareResult =
  | { type: 'grant'; grant: GrantDto }
  | { type: 'invitation'; invitation: InvitationDto | CreatedInvitationDto }

const id = (value: string) => encodeURIComponent(value)

/** Thin wrappers over the sharing routes (frontend-api-integration.md, "Sharing endpoints"). */
export const sharingApi = {
  /** The owner, active grants and pending invitations. Any grant holder may call it; invited emails are owner-only. */
  async collaborators(noteId: string, signal?: AbortSignal) {
    return (await apiFetch<CollaboratorsDto>(`/v1/notes/${id(noteId)}/grants`, { signal })).data
  },
  /** Share with an email address. One idempotency key per click, reused unchanged on retry. */
  async share(noteId: string, body: CreateGrantDto, idempotencyKey: string) {
    return (await apiFetch<ShareResult>(`/v1/notes/${id(noteId)}/grants`, { method: 'POST', body, idempotencyKey })).data
  },
  /** Change a collaborator's role. Owner only. */
  async changeRole(noteId: string, grantId: string, body: UpdateGrantRoleDto) {
    return (await apiFetch<Schema<'ChangeGrantRoleResultDto'>>(`/v1/notes/${id(noteId)}/grants/${id(grantId)}`, { method: 'PATCH', body })).data
  },
  /** The owner revokes any grant; a holder passes their own grant id to leave (`{ left: true }`). */
  async revokeGrant(noteId: string, grantId: string) {
    return (await apiFetch<Schema<'RevokeGrantResultDto'>>(`/v1/notes/${id(noteId)}/grants/${id(grantId)}`, { method: 'DELETE' })).data
  },
  /** Owner revokes a pending invitation (`204`). To change an invited role: revoke, then share again. */
  async revokeInvitation(noteId: string, invitationId: string) {
    await apiFetch<void>(`/v1/notes/${id(noteId)}/invitations/${id(invitationId)}`, { method: 'DELETE' })
  },
  /** My pending invitations (verified email only). */
  async myInvitations(signal?: AbortSignal) {
    return (await apiFetch<Schema<'MyInvitationsDto'>>('/v1/note-invitations', { signal })).data.items
  },
  /** Accept one invitation (empty body, single-use). The signed-in verified email must match the invited one. */
  async acceptInvitation(invitationId: string) {
    return (await apiFetch<Schema<'AcceptInvitationResultDto'>>(`/v1/note-invitations/${id(invitationId)}/accept`, { method: 'POST' })).data
  },
  /**
   * Create a view-only share link. The token is returned once and cannot be listed again:
   * keep the response in memory (for copy/revoke) and never log it.
   */
  async createShareLink(noteId: string, body: CreateShareLinkDto = {}) {
    return (await apiFetch<ShareLinkDto>(`/v1/notes/${id(noteId)}/share-links`, { method: 'POST', body })).data
  },
  /** Owner revokes a share link (`204`). */
  async revokeShareLink(noteId: string, linkId: string) {
    await apiFetch<void>(`/v1/notes/${id(noteId)}/share-links/${id(linkId)}`, { method: 'DELETE' })
  },
  /** Public, no session: the view-only latest checkpoint for reading only. Never joins the room. */
  async sharedCheckpoint(token: string, signal?: AbortSignal) {
    return (await apiFetch<SharedCheckpointDto>(`/v1/shared/${id(token)}`, { signal })).data
  },
}
