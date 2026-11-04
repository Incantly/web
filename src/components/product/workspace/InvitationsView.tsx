'use client'

import { AppIcon } from '../AppIcon'
import { apiErrorMessage } from '../../../lib/api/errors'
import { useNavigation } from '@/hooks/use-navigation'
import { useOnlineStatus, useSharing } from '@/hooks/use-sharing'
import { roleDescription, roleLabel } from './sharingModel'
import { updatedLabel } from './SpaceViews'
import { EmptyState, ErrorState, ListSkeleton, PageFrame, PageHeading, buttonPrimary, buttonSecondary } from './ui'

/** Pending note invitations, each with one accept button. Accepting lands the note in Shared-with-me. */
export function InvitationsView() {
  const { invitations, invitationsStatus, accepted, dismissAccepted, acceptingId, acceptInvitation, acceptError, clearAcceptError } = useSharing()
  const { openNote, navigate } = useNavigation()
  const online = useOnlineStatus()
  const pending = invitations.filter((invitation) => !accepted.some((item) => item.invitationId === invitation.id))

  return <PageFrame>
    <PageHeading title="Invitations" subtitle="Notes people invited you to. Accept one and it shows up in Shared with me." />
    {online ? null : <p role="status" className="mt-6 flex items-center gap-2 rounded-xl bg-surface px-4 py-3 text-sm text-muted">
      <AppIcon name="alert" className="size-4 shrink-0" />You’re offline. Invitations will load when you reconnect.
    </p>}
    {acceptError ? <div role="alert" className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger bg-danger-surface px-4 py-3 text-sm text-danger">
      <span className="min-w-0 flex-1 basis-48">{apiErrorMessage(acceptError)}</span>
      <button type="button" onClick={clearAcceptError} className="min-h-11 rounded-lg px-3 font-semibold hover:bg-raised">Dismiss</button>
    </div> : null}
    {accepted.length ? <div className="mt-6 grid gap-3">
      {accepted.map((item) => <div key={item.invitationId} role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-default bg-surface px-4 py-3 text-sm text-foreground">
        <span className="flex min-w-0 items-center gap-2"><AppIcon name="checkCircle" className="size-4 shrink-0 text-muted" /><span className="truncate">“{item.title || 'Untitled note'}” is now in Shared with me.</span></span>
        <span className="flex gap-2">
          <button type="button" onClick={() => openNote(item.noteId)} className={buttonPrimary}>Open note</button>
          <button type="button" onClick={() => dismissAccepted(item.invitationId)} className={buttonSecondary}>Dismiss</button>
        </span>
      </div>)}
    </div> : null}
    <div className="mt-8">
      {invitationsStatus.loading ? <ListSkeleton rows={4} label="Loading invitations" />
        : invitationsStatus.error ? <ErrorState message={apiErrorMessage(invitationsStatus.error)} onRetry={invitationsStatus.retry} />
        : pending.length ? <ul className="divide-y divide-default border-y border-default">
        {pending.map((invitation) => {
          const accepting = acceptingId === invitation.id
          return <li key={invitation.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface text-muted"><AppIcon name="inbox" className="size-4" /></span>
            <span className="min-w-0 flex-1 basis-48">
              <span className="block truncate text-sm font-medium text-foreground">{invitation.note.title || 'Untitled note'}</span>
              <span className="mt-0.5 block truncate text-xs text-muted">
                Invited by {invitation.inviter.name} · {roleLabel(invitation.role)} ({roleDescription(invitation.role).toLowerCase()}) · Sent {updatedLabel(Date.parse(invitation.createdAt) || 0)}
              </span>
            </span>
            <button type="button" onClick={() => void acceptInvitation(invitation)} disabled={accepting || acceptingId !== null}
              className={buttonPrimary} aria-label={accepting ? `Accepting ${invitation.note.title || 'note'}` : `Accept ${invitation.note.title || 'note'}`}>
              {accepting ? 'Accepting…' : 'Accept'}
            </button>
          </li>
        })}
      </ul> : accepted.length ? <p className="text-sm text-muted">That’s everything for now. <button type="button" onClick={() => navigate('shared')} className="min-h-11 font-semibold text-button hover:underline">Open Shared with me</button></p>
        : <EmptyState icon="inbox" title="No invitations" body="When someone invites you to a note, it shows up here." />}
    </div>
  </PageFrame>
}
