'use client'

import { useId, useState, type FormEvent } from 'react'
import { AppIcon } from '../AppIcon'
import { useShareDialog as useShareDialogState, useSharing } from '@/hooks/use-sharing'
import { useWorkspaceUI } from '@/hooks/use-workspace-ui'
import { apiErrorMessage } from '../../../lib/api/errors'
import type { GrantDto, GrantRole, InvitationDto, ShareLinkDto, ShareUserDto } from '../../../lib/api/sharing'
import { GRANT_ROLES, formatShareDate, roleDescription, roleLabel } from './sharingModel'
import { ConfirmDialog, Dialog, ErrorState, ListSkeleton, buttonPrimary, buttonSecondary, inputClass, labelClass } from './ui'

/** The name's initial in a tile, like the account row. Names and emails render as plain text. */
function Initial({ name }: { name: string }) {
  const letter = name.trim().charAt(0).toUpperCase() || '?'
  return <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-button text-sm font-semibold text-inverse">{letter}</span>
}

function OfflineNote() {
  return <p role="status" className="mb-4 flex items-center gap-2 rounded-xl bg-surface px-4 py-3 text-sm text-muted">
    <AppIcon name="alert" className="size-4 shrink-0" />You’re offline. Sharing needs a connection — your collaborators will load when you’re back.
  </p>
}

function RoleSelect({ label, value, onChange, disabled, changing }: { label: string; value: GrantRole; onChange: (role: GrantRole) => void; disabled: boolean; changing: boolean }) {
  return <select value={value} disabled={disabled || changing} onChange={(event) => onChange(event.target.value as GrantRole)}
    aria-label={label} title={roleDescription(value)} className={`${inputClass} mt-0 min-h-11 w-auto max-w-full shrink-0 pr-8 text-sm`}>
    {GRANT_ROLES.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}
  </select>
}

function GrantRow({ grant, canManage, changing, busy, onRole, onRevoke }: {
  grant: GrantDto; canManage: boolean; changing: boolean; busy: boolean; onRole: (role: GrantRole) => void; onRevoke: () => void
}) {
  return <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
    <Initial name={grant.user.name} />
    <span className="min-w-0 flex-1 basis-40">
      <span className="block truncate text-sm font-medium text-foreground">{grant.user.name}</span>
      <span className="mt-0.5 block truncate text-xs text-muted">{roleDescription(grant.role)}</span>
    </span>
    {canManage ? <>
      <RoleSelect label={`Role for ${grant.user.name}`} value={grant.role} onChange={onRole} disabled={busy} changing={changing} />
      <button type="button" onClick={onRevoke} disabled={busy || changing} className={buttonSecondary} aria-label={busy ? `Removing ${grant.user.name}` : `Remove ${grant.user.name}`}>
        {busy ? 'Removing…' : 'Remove'}
      </button>
    </> : <span className="shrink-0 rounded-full bg-surface px-2.5 py-1 text-xs font-medium text-muted">{roleLabel(grant.role)}</span>}
  </li>
}

function InvitationRow({ invitation, canManage, busy, onRevoke }: {
  invitation: InvitationDto; canManage: boolean; busy: boolean; onRevoke: () => void
}) {
  return <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
    <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-surface text-muted"><AppIcon name="inbox" className="size-4" /></span>
    <span className="min-w-0 flex-1 basis-40">
      <span className="block truncate text-sm font-medium text-foreground">{invitation.email ?? 'Invited'}</span>
      <span className="mt-0.5 block truncate text-xs text-muted">Invited · {roleLabel(invitation.role)}</span>
    </span>
    {canManage ? <button type="button" onClick={onRevoke} disabled={busy} className={buttonSecondary} aria-label={busy ? 'Revoking invitation' : `Revoke invitation for ${invitation.email ?? 'this person'}`}>
      {busy ? 'Revoking…' : 'Revoke'}
    </button> : <span className="shrink-0 rounded-full bg-surface px-2.5 py-1 text-xs font-medium text-muted">Pending</span>}
  </li>
}

function OwnerRow({ owner }: { owner: ShareUserDto }) {
  return <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
    <Initial name={owner.name} />
    <span className="min-w-0 flex-1 basis-40">
      <span className="block truncate text-sm font-medium text-foreground">{owner.name}</span>
      <span className="mt-0.5 block truncate text-xs text-muted">{roleDescription('OWNER')}</span>
    </span>
    <span className="shrink-0 rounded-full bg-surface px-2.5 py-1 text-xs font-medium text-muted">{roleLabel('OWNER')}</span>
  </li>
}

type Confirming = { kind: 'grant'; grant: GrantDto } | { kind: 'invitation'; invitation: InvitationDto } | { kind: 'link'; link: ShareLinkDto } | null

function ShareDialogBody({ noteId }: { noteId: string }) {
  const dialog = useShareDialogState(noteId)
  const { openPlans } = useWorkspaceUI()
  const [confirming, setConfirming] = useState<Confirming>(null)
  const emailErrorId = useId()
  const inviteFailedId = useId()
  const collaborators = dialog.collaborators
  const grants = collaborators?.grants ?? []
  const invitations = collaborators?.invitations ?? []

  async function invite(event: FormEvent) {
    event.preventDefault()
    await dialog.submitInvite()
  }

  const confirmCopy = confirming?.kind === 'grant'
    ? { title: `Remove ${confirming.grant.user.name || 'this person'}?`, body: 'They lose access to this note immediately. You can invite them again later.', confirmLabel: 'Remove access' }
    : confirming?.kind === 'invitation'
      ? { title: 'Revoke this invitation?', body: `The invite${confirming.invitation.email ? ` for ${confirming.invitation.email}` : ''} stops working. To change its role, revoke it and invite again.`, confirmLabel: 'Revoke invitation' }
      : confirming ? { title: 'Revoke this link?', body: 'Anyone with this link loses access immediately.', confirmLabel: 'Revoke link' } : null

  async function confirm() {
    if (!confirming) return
    if (confirming.kind === 'grant') await dialog.revokeGrant(confirming.grant.id)
    else if (confirming.kind === 'invitation') await dialog.revokeInvitation(confirming.invitation.id)
    else await dialog.revokeLink(confirming.link.id)
  }

  return <>
    {dialog.online ? null : <OfflineNote />}

    <section aria-labelledby="share-collaborators">
      <h3 id="share-collaborators" className="text-sm font-semibold text-foreground">Who has access</h3>
      <div className="mt-2">
        {dialog.status.loading ? <ListSkeleton rows={3} label="Loading collaborators" />
          : dialog.status.error ? <ErrorState message={apiErrorMessage(dialog.status.error)} onRetry={dialog.status.retry} />
          : collaborators ? <>
            <ul className="divide-y divide-default border-y border-default">
              <OwnerRow owner={collaborators.owner} />
              {grants.map((grant) => <GrantRow key={grant.id} grant={grant} canManage={dialog.canManage}
                changing={dialog.changingId === grant.id} busy={dialog.busyId === grant.id}
                onRole={(role) => void dialog.changeRole(grant.id, role)} onRevoke={() => setConfirming({ kind: 'grant', grant })} />)}
              {invitations.map((invitation) => <InvitationRow key={invitation.id} invitation={invitation} canManage={dialog.canManage}
                busy={dialog.busyId === invitation.id} onRevoke={() => setConfirming({ kind: 'invitation', invitation })} />)}
            </ul>
            {grants.length === 0 && invitations.length === 0 ? <p className="mt-3 text-sm text-muted">Only the owner has access so far.</p> : null}
            {dialog.canManage && invitations.length > 0 ? <p className="mt-3 text-xs leading-5 text-muted">To change a pending invite’s role, revoke it and invite again.</p> : null}
            {dialog.canManage ? null : <p className="mt-3 text-sm text-muted">Only the owner can invite people or change who has access.</p>}
          </> : null}
      </div>
      {dialog.actionError ? <div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger bg-danger-surface px-4 py-3 text-sm text-danger">
        <span className="min-w-0 flex-1 basis-48">{apiErrorMessage(dialog.actionError)}</span>
        <button type="button" onClick={dialog.clearActionError} className="min-h-11 rounded-lg px-3 font-semibold hover:bg-raised">Dismiss</button>
      </div> : null}
    </section>

    {dialog.canManage ? <>
      <section aria-labelledby="share-invite" className="mt-8">
        <h3 id="share-invite" className="text-sm font-semibold text-foreground">Invite by email</h3>
        <form onSubmit={invite} className="mt-3 space-y-3" noValidate>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <label className={labelClass}>Email address
              <input type="email" inputMode="email" autoComplete="email" value={dialog.email} maxLength={254}
                onChange={(event) => dialog.setEmail(event.target.value)} placeholder="ada@example.com"
                aria-invalid={Boolean(dialog.inviteError) || undefined} aria-describedby={dialog.inviteError ? emailErrorId : undefined}
                className={inputClass} />
            </label>
            <label className={labelClass}>Role
              <select value={dialog.role} onChange={(event) => dialog.setRole(event.target.value as GrantRole)}
                title={roleDescription(dialog.role)} className={`${inputClass} sm:w-36`}>
                {GRANT_ROLES.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}
              </select>
            </label>
          </div>
          <p className="text-xs leading-5 text-muted">{roleDescription(dialog.role)}. They get access at once, or an invitation email if they’re new to Incantly.</p>
          {dialog.inviteError ? <p id={emailErrorId} role="alert" className="text-sm text-danger">{dialog.inviteError}</p> : null}
          {dialog.inviteFailed ? <div role="alert" className="rounded-xl border border-danger bg-danger-surface px-4 py-3 text-sm text-danger">
            <p id={inviteFailedId}>{apiErrorMessage(dialog.inviteFailed)}</p>
            {dialog.inviteLimitReached ? <button type="button" onClick={openPlans} className={`${buttonSecondary} mt-3`} aria-describedby={inviteFailedId}>View plans</button> : null}
          </div> : null}
          {dialog.inviteNotice ? <p role="status" className="flex items-center gap-2 text-sm text-muted"><AppIcon name="checkCircle" className="size-4 shrink-0" />{dialog.inviteNotice}</p> : null}
          <div><button type="submit" disabled={dialog.inviting || !dialog.online} className={buttonPrimary}>
            <AppIcon name="share" className="size-4" />{dialog.inviting ? 'Inviting…' : 'Invite'}
          </button></div>
        </form>
      </section>

      <section aria-labelledby="share-links" className="mt-8">
        <h3 id="share-links" className="text-sm font-semibold text-foreground">View-only links</h3>
        <p className="mt-1 text-sm leading-6 text-muted">Anyone with a link can read this note — no sign-in needed. Links always expire.</p>
        <div className="mt-3"><button type="button" onClick={() => void dialog.createLink()} disabled={dialog.creatingLink || !dialog.online} className={buttonSecondary}>
          <AppIcon name="link" className="size-4" />{dialog.creatingLink ? 'Creating…' : 'Create link'}
        </button></div>
        {dialog.linkError ? <div role="alert" className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger bg-danger-surface px-4 py-3 text-sm text-danger">
          <span className="min-w-0 flex-1 basis-48">{typeof dialog.linkError === 'string' ? dialog.linkError : apiErrorMessage(dialog.linkError)}</span>
          <button type="button" onClick={dialog.clearLinkError} className="min-h-11 rounded-lg px-3 font-semibold hover:bg-raised">Dismiss</button>
        </div> : null}
        {dialog.links.length ? <>
          <ul className="mt-3 divide-y divide-default border-y border-default">
            {dialog.links.map((link) => <li key={link.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
              <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface text-muted"><AppIcon name="link" className="size-4" /></span>
              <span className="min-w-0 flex-1 basis-40">
                <span className="block text-sm font-medium text-foreground">View-only link</span>
                <span className="mt-0.5 block truncate text-xs text-muted">Expires {formatShareDate(link.expiresAt)}</span>
              </span>
              <button type="button" onClick={() => void dialog.copyLink(link)} className={buttonSecondary} aria-label={dialog.copiedId === link.id ? 'Copied' : 'Copy link'}>
                <AppIcon name={dialog.copiedId === link.id ? 'check' : 'copy'} className="size-4" />{dialog.copiedId === link.id ? 'Copied' : 'Copy'}
              </button>
              <button type="button" onClick={() => setConfirming({ kind: 'link', link })} disabled={dialog.busyId === link.id} className={buttonSecondary}>
                {dialog.busyId === link.id ? 'Revoking…' : 'Revoke'}
              </button>
            </li>)}
          </ul>
          <p className="mt-3 text-xs leading-5 text-muted">These links stay listed until you sign out or reload — the token is shown once, so copy each link now.</p>
        </> : <p className="mt-3 text-sm text-muted">No links yet. Create one to share a read-only copy.</p>}
      </section>
    </> : null}

    <ConfirmDialog open={confirming !== null} onClose={() => setConfirming(null)} destructive
      title={confirmCopy?.title ?? ''} body={confirmCopy?.body ?? ''} confirmLabel={confirmCopy?.confirmLabel ?? ''} onConfirm={() => void confirm()} />
  </>
}

/** The note share dialog: who has access, invite by email, and view-only links. Mounted once, in `WorkspaceDialogs`. */
export function ShareDialog() {
  const { shareDialogNoteId, closeShareDialog } = useSharing()
  return <Dialog open={shareDialogNoteId !== null} onClose={closeShareDialog} title="Share this note" description="Invite people by email, or send a view-only link.">
    {shareDialogNoteId ? <ShareDialogBody key={shareDialogNoteId} noteId={shareDialogNoteId} /> : null}
  </Dialog>
}
