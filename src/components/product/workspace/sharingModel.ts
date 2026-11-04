import type { CollaboratorsDto, CreateGrantDto, GrantRole } from '../../../lib/api/sharing'

/** Every role the owner can grant, most access first. The backend validates uppercase only. */
export const GRANT_ROLES: readonly GrantRole[] = ['EDITOR', 'COMMENTER', 'VIEWER']

/** `OWNER` is not a grant role (it is never sent); it labels the owner's row only. */
export type DisplayRole = GrantRole | 'OWNER'

const labels: Record<DisplayRole, string> = {
  OWNER: 'Owner',
  EDITOR: 'Editor',
  COMMENTER: 'Commenter',
  VIEWER: 'Viewer',
}

/** Short role label for collaborator rows and selects. */
export function roleLabel(role: DisplayRole): string {
  return labels[role]
}

const descriptions: Record<DisplayRole, string> = {
  OWNER: 'Full access, manages sharing',
  EDITOR: 'Can read, comment and edit',
  COMMENTER: 'Can read and comment',
  VIEWER: 'Can read only',
}

/** One-line capability summary shown under a role label. */
export function roleDescription(role: DisplayRole): string {
  return descriptions[role]
}

/**
 * Whether the signed-in user owns the note. A UI hint only: the backend enforces
 * roles on every read and mutation, and the UI never makes access decisions from this.
 */
export function isNoteOwner(collaborators: Pick<CollaboratorsDto, 'owner'> | null | undefined, userId: string): boolean {
  return collaborators?.owner.id === userId
}

/** Only the owner manages sharing (invite, change roles, revoke, share links). UI hint only. */
export function canManageSharing(collaborators: Pick<CollaboratorsDto, 'owner'> | null | undefined, userId: string): boolean {
  return isNoteOwner(collaborators, userId)
}

/** Client-side email check for the invite form; the backend re-validates (`422 SHARE_TARGET_INVALID`). Null means valid. */
export function validateShareEmail(email: string): string | null {
  const trimmed = email.trim()
  if (!trimmed) return 'Enter an email address.'
  if (trimmed.length > 254) return 'That email address is too long.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return 'Enter a valid email address, like ada@example.com.'
  return null
}

/** The `POST /grants` body for an invite: the address trimmed, the role uppercase as sent. */
export function buildShareRequest(email: string, role: GrantRole): CreateGrantDto {
  return { email: email.trim(), role }
}

/**
 * The in-app path that renders a share link (`/shared/{token}`). The token comes from
 * the route only and is never stored; the only place the full link goes is the clipboard.
 */
export function sharedViewPath(token: string): string {
  return `/shared/${encodeURIComponent(token)}`
}

/** The route token is usable when it is a non-empty string; anything else is an invalid link. */
export function isShareToken(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

const shareDate = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })

/** A backend timestamp as a plain date (link expiry, invite dates), from the backend's own value. */
export function formatShareDate(value: string | null | undefined): string {
  if (!value) return 'Unknown date'
  const time = Date.parse(value)
  return Number.isFinite(time) ? shareDate.format(new Date(time)) : 'Unknown date'
}
