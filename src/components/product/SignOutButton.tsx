'use client'
import { useState } from 'react'
import { authClient, googleAuthEnabled } from '../../lib/auth-client'
import { useSignOut } from '@/hooks/use-sign-out'
import { ConfirmDialog } from './workspace/ui'

const UNSAVED_COPY = {
  title: 'Sign out with unsaved changes?',
  body: 'Some of your note edits haven’t reached the server yet. Signing out deletes them from this device. Cancel and wait for the note to say Saved to keep them.',
  confirmLabel: 'Sign out anyway',
}

export function SignOutButton() {
  const [linking, setLinking] = useState(false)
  const [linkError, setLinkError] = useState(false)
  // Note bodies never outlive the session on this device; full navigation then drops every in-memory cache.
  const signOut = useSignOut(() => window.location.replace(new URL('/auth', window.location.origin).href))
  async function linkGoogle() {
    setLinking(true); setLinkError(false)
    try {
      const result = await authClient.linkSocial({ provider: 'google', callbackURL: window.location.origin + '/workspace' })
      if (result.error) throw new Error()
    } catch { setLinkError(true); setLinking(false) }
  }
  const pending = linking || signOut.pending
  const buttonClass = 'inline-flex min-h-11 items-center rounded-lg border border-default bg-canvas px-4 text-sm font-semibold text-foreground transition-colors hover:border-strong hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-60'
  return <div className="ml-auto flex flex-wrap items-center gap-2">
    {googleAuthEnabled ? <button type="button" disabled={pending} onClick={linkGoogle} className={buttonClass}>Connect Google</button> : null}
    <button type="button" disabled={pending} onClick={() => void signOut.signOut()} className={buttonClass}>{signOut.pending ? 'Signing out…' : 'Sign out'}</button>
    {linkError || signOut.error ? <span role="alert" className="text-sm text-danger">Something went wrong. Try again.</span> : null}
    <ConfirmDialog open={signOut.confirming} onClose={signOut.cancel} onConfirm={signOut.confirm} destructive {...UNSAVED_COPY} />
  </div>
}
