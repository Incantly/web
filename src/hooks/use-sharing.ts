'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useCurrentUser } from '@/components/product/SessionGate'
import { createFeatureContext, useFeatureContext } from '@/components/product/features/createFeatureContext'
import { sharedWithMeKey } from '@/components/product/workspace/useNotes'
import { buildShareRequest, canManageSharing, isNoteOwner, sharedViewPath, validateShareEmail } from '@/components/product/workspace/sharingModel'
import type { ListStatus } from '@/components/product/workspace/views'
import { isApiError } from '@/lib/api/errors'
import { newIdempotencyKey } from '@/lib/api/idempotency'
import { sharingApi, type CollaboratorsDto, type CreateGrantDto, type GrantRole, type MyInvitationDto, type ShareLinkDto } from '@/lib/api/sharing'

export const collaboratorsKey = (noteId: string) => ['note-collaborators', noteId] as const
export const invitationsKey = (userId: string) => ['note-invitations', userId] as const

/** The browser's connection state, for the offline copy on sharing lists. */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine)
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update) }
  }, [])
  return online
}

/** A share link created this session. Tokens are returned once and cannot be listed: memory only, never persisted. */
export type CreatedShareLink = { noteId: string; link: ShareLinkDto }

export type AcceptedInvitation = { invitationId: string; noteId: string; title: string }

export type SharingValue = {
  invitations: MyInvitationDto[]
  invitationsStatus: ListStatus
  /** Invitations accepted this session, so the view can offer to open the note. */
  accepted: AcceptedInvitation[]
  dismissAccepted: (invitationId: string) => void
  /** The invitation id an accept is running for, if any. */
  acceptingId: string | null
  /** Accept and land the note in Shared-with-me. Stays on errors for the view to render. */
  acceptInvitation: (invitation: MyInvitationDto) => Promise<void>
  acceptError: unknown
  clearAcceptError: () => void
  /** The note the share dialog is open for, if any. */
  shareDialogNoteId: string | null
  openShareDialog: (noteId: string) => void
  closeShareDialog: () => void
  /** Links created this session (in memory only). */
  createdLinks: CreatedShareLink[]
  rememberLink: (noteId: string, link: ShareLinkDto) => void
  forgetLink: (noteId: string, linkId: string) => void
}

export const SharingContext = createFeatureContext<SharingValue>('Sharing')

/** `GET /v1/note-invitations` plus accepting, the share dialog, and this session's share links. Runs once, in `SharingProvider`. */
export function useSharingState(): SharingValue {
  const user = useCurrentUser()
  const client = useQueryClient()
  const query = useQuery({
    queryKey: invitationsKey(user.id),
    queryFn: ({ signal }) => sharingApi.myInvitations(signal),
    meta: { silentErrors: true },
  })
  const { isPending, isError, error, refetch } = query
  const accept = useMutation({
    mutationFn: (invitationId: string) => sharingApi.acceptInvitation(invitationId),
    meta: { silentErrors: true },
  })
  const [acceptingId, setAcceptingId] = useState<string | null>(null)
  const [acceptError, setAcceptError] = useState<unknown>(null)
  const [accepted, setAccepted] = useState<AcceptedInvitation[]>([])
  const [shareDialogNoteId, setShareDialogNoteId] = useState<string | null>(null)
  const [createdLinks, setCreatedLinks] = useState<CreatedShareLink[]>([])

  const acceptInvitation = useCallback(async (invitation: MyInvitationDto) => {
    if (acceptingId) return
    setAcceptingId(invitation.id)
    setAcceptError(null)
    try {
      await accept.mutateAsync(invitation.id)
      // The grant is live: the note belongs in Shared-with-me now, and the invitation is gone.
      setAccepted((current) => current.some((item) => item.invitationId === invitation.id)
        ? current
        : [...current, { invitationId: invitation.id, noteId: invitation.note.id, title: invitation.note.title }])
      void client.invalidateQueries({ queryKey: invitationsKey(user.id) })
      void client.invalidateQueries({ queryKey: sharedWithMeKey(user.id) })
    } catch (failure) {
      // Final states leave the list: a dead invitation refetches away instead of lingering.
      if (isApiError(failure, 'INVITATION_INVALID')) void client.invalidateQueries({ queryKey: invitationsKey(user.id) })
      setAcceptError(failure)
    } finally {
      setAcceptingId(null)
    }
  }, [acceptingId, accept, client, user.id])

  const clearAcceptError = useCallback(() => setAcceptError(null), [])
  const dismissAccepted = useCallback((invitationId: string) => {
    setAccepted((current) => current.filter((item) => item.invitationId !== invitationId))
  }, [])
  const openShareDialog = useCallback((noteId: string) => setShareDialogNoteId(noteId), [])
  const closeShareDialog = useCallback(() => setShareDialogNoteId(null), [])
  const rememberLink = useCallback((noteId: string, link: ShareLinkDto) => {
    setCreatedLinks((current) => (current.some((item) => item.link.id === link.id) ? current : [...current, { noteId, link }]))
  }, [])
  const forgetLink = useCallback((noteId: string, linkId: string) => {
    setCreatedLinks((current) => current.filter((item) => !(item.noteId === noteId && item.link.id === linkId)))
  }, [])

  return useMemo<SharingValue>(() => ({
    invitations: query.data ?? [],
    invitationsStatus: { loading: isPending, error: isError ? error : null, retry: () => void refetch() },
    accepted,
    dismissAccepted,
    acceptingId,
    acceptInvitation,
    acceptError,
    clearAcceptError,
    shareDialogNoteId,
    openShareDialog,
    closeShareDialog,
    createdLinks,
    rememberLink,
    forgetLink,
  }), [query.data, isPending, isError, error, refetch, accepted, dismissAccepted, acceptingId, acceptInvitation, acceptError, clearAcceptError, shareDialogNoteId, openShareDialog, closeShareDialog, createdLinks, rememberLink, forgetLink])
}

/** Note sharing: invitations, the share dialog, and share links. Must be used inside `WorkspaceProviders`. */
export function useSharing(): SharingValue {
  return useFeatureContext(SharingContext)
}

export type ShareDialogValue = {
  online: boolean
  collaborators: CollaboratorsDto | undefined
  status: { loading: boolean; error: unknown; retry: () => void }
  isOwner: boolean
  canManage: boolean
  email: string
  setEmail: (email: string) => void
  role: GrantRole
  setRole: (role: GrantRole) => void
  /** Client-side validation message for the invite form, if any. */
  inviteError: string | null
  /** The last invite failure from the server, if any. */
  inviteFailed: unknown
  inviteLimitReached: boolean
  inviteNotice: string | null
  inviting: boolean
  submitInvite: () => Promise<void>
  changingId: string | null
  changeRole: (grantId: string, next: GrantRole) => Promise<void>
  busyId: string | null
  revokeGrant: (grantId: string) => Promise<void>
  revokeInvitation: (invitationId: string) => Promise<void>
  actionError: unknown
  clearActionError: () => void
  links: ShareLinkDto[]
  creatingLink: boolean
  createLink: () => Promise<void>
  copiedId: string | null
  copyLink: (link: ShareLinkDto) => Promise<void>
  linkError: unknown
  clearLinkError: () => void
  revokeLink: (linkId: string) => Promise<void>
}

/**
 * Everything the share dialog does for one note: collaborators, invites, role changes,
 * revocations, and share links. The dialog itself only draws this state.
 */
export function useShareDialog(noteId: string): ShareDialogValue {
  const user = useCurrentUser()
  const client = useQueryClient()
  const { createdLinks, rememberLink, forgetLink } = useSharing()
  const online = useOnlineStatus()
  const query = useQuery({
    queryKey: collaboratorsKey(noteId),
    queryFn: ({ signal }) => sharingApi.collaborators(noteId, signal),
    meta: { silentErrors: true },
  })
  const { isPending, isError, error, refetch } = query
  const refresh = useCallback(() => {
    // Roles, revocations and leaves apply immediately: never trust the cached list after a mutation.
    void client.invalidateQueries({ queryKey: collaboratorsKey(noteId) })
  }, [client, noteId])

  const [email, setEmailState] = useState('')
  const [role, setRole] = useState<GrantRole>('EDITOR')
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteFailed, setInviteFailed] = useState<unknown>(null)
  const [inviteNotice, setInviteNotice] = useState<string | null>(null)
  const [inviting, setInviting] = useState(false)
  const [changingId, setChangingId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<unknown>(null)
  const [creatingLink, setCreatingLink] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [linkError, setLinkError] = useState<unknown>(null)

  const setEmail = useCallback((next: string) => {
    setEmailState(next)
    setInviteError(null)
  }, [])
  const clearActionError = useCallback(() => setActionError(null), [])
  const clearLinkError = useCallback(() => setLinkError(null), [])

  const submitInvite = useCallback(async () => {
    if (inviting) return
    const problem = validateShareEmail(email)
    if (problem) { setInviteError(problem); return }
    const address = email.trim()
    if (address.toLowerCase() === user.email.trim().toLowerCase()) {
      setInviteError('That’s your own address — the note is already yours.')
      return
    }
    setInviting(true)
    setInviteFailed(null)
    setInviteNotice(null)
    try {
      // One key per click, reused unchanged if the request itself retries.
      const body: CreateGrantDto = buildShareRequest(address, role)
      const result = await sharingApi.share(noteId, body, newIdempotencyKey())
      setEmailState('')
      setInviteNotice(result.type === 'grant'
        ? `${address} now has access to this note.`
        : `Invitation sent to ${address}. They’ll get access when they accept.`)
      refresh()
    } catch (failure) {
      setInviteFailed(failure)
    } finally {
      setInviting(false)
    }
  }, [inviting, email, role, noteId, user.email, refresh])

  const changeRole = useCallback(async (grantId: string, next: GrantRole) => {
    if (changingId) return
    setChangingId(grantId)
    setActionError(null)
    try {
      await sharingApi.changeRole(noteId, grantId, { role: next })
      refresh()
    } catch (failure) {
      setActionError(failure)
    } finally {
      setChangingId(null)
    }
  }, [changingId, noteId, refresh])

  const revokeGrant = useCallback(async (grantId: string) => {
    if (busyId) return
    setBusyId(grantId)
    setActionError(null)
    try {
      await sharingApi.revokeGrant(noteId, grantId)
      refresh()
    } catch (failure) {
      setActionError(failure)
    } finally {
      setBusyId(null)
    }
  }, [busyId, noteId, refresh])

  const revokeInvitation = useCallback(async (invitationId: string) => {
    if (busyId) return
    setBusyId(invitationId)
    setActionError(null)
    try {
      await sharingApi.revokeInvitation(noteId, invitationId)
      refresh()
    } catch (failure) {
      setActionError(failure)
    } finally {
      setBusyId(null)
    }
  }, [busyId, noteId, refresh])

  const createLink = useCallback(async () => {
    if (creatingLink) return
    setCreatingLink(true)
    setLinkError(null)
    try {
      const link = await sharingApi.createShareLink(noteId, {})
      // The token is returned once: keep it in memory for copy/revoke, never persist it.
      rememberLink(noteId, link)
      setCopiedId(null)
    } catch (failure) {
      setLinkError(failure)
    } finally {
      setCreatingLink(false)
    }
  }, [creatingLink, noteId, rememberLink])

  const copyLink = useCallback(async (link: ShareLinkDto) => {
    setLinkError(null)
    try {
      // The clipboard is the only place the full link goes; it is never rendered as text.
      await navigator.clipboard.writeText(new URL(sharedViewPath(link.token), window.location.origin).href)
      setCopiedId(link.id)
    } catch {
      setLinkError('Copying didn’t work here. Try again, or copy the link from a desktop browser.')
    }
  }, [])

  const revokeLink = useCallback(async (linkId: string) => {
    if (busyId) return
    setBusyId(linkId)
    setLinkError(null)
    try {
      await sharingApi.revokeShareLink(noteId, linkId)
      forgetLink(noteId, linkId)
    } catch (failure) {
      setLinkError(failure)
    } finally {
      setBusyId(null)
    }
  }, [busyId, noteId, forgetLink])

  const links = useMemo(
    () => createdLinks.filter((item) => item.noteId === noteId).map((item) => item.link),
    [createdLinks, noteId],
  )
  const collaborators = query.data

  return useMemo<ShareDialogValue>(() => ({
    online,
    collaborators,
    status: { loading: isPending, error: isError ? error : null, retry: () => void refetch() },
    isOwner: isNoteOwner(collaborators, user.id),
    canManage: canManageSharing(collaborators, user.id),
    email,
    setEmail,
    role,
    setRole,
    inviteError,
    inviteFailed,
    inviteLimitReached: isApiError(inviteFailed, 'COLLABORATOR_LIMIT_REACHED'),
    inviteNotice,
    inviting,
    submitInvite,
    changingId,
    changeRole,
    busyId,
    revokeGrant,
    revokeInvitation,
    actionError,
    clearActionError,
    links,
    creatingLink,
    createLink,
    copiedId,
    copyLink,
    linkError,
    clearLinkError,
    revokeLink,
  }), [online, collaborators, isPending, isError, error, refetch, user.id, email, setEmail, role, inviteError, inviteFailed, inviteNotice, inviting, submitInvite, changingId, changeRole, busyId, revokeGrant, revokeInvitation, actionError, clearActionError, links, creatingLink, createLink, copiedId, copyLink, linkError, clearLinkError, revokeLink])
}
