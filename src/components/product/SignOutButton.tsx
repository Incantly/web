'use client'
import { useState } from 'react'
import { authClient, googleAuthEnabled } from '../../lib/auth-client'

export function SignOutButton() {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(false)
  async function linkGoogle() {
    setPending(true); setError(false)
    try {
      const result = await authClient.linkSocial({ provider: 'google', callbackURL: window.location.origin + '/workspace' })
      if (result.error) throw new Error()
    } catch { setError(true); setPending(false) }
  }
  async function signOut() {
    setPending(true); setError(false)
    try {
      const result = await authClient.signOut()
      if (result.error) throw new Error()
      // Full navigation drops every in-memory cache (queries, toasts, diagnostics, editor state).
      // Per-user IndexedDB queues stay on the device and are only read for their own user.
      window.location.replace(new URL('/auth', window.location.origin).href)
    } catch { setError(true); setPending(false) }
  }
  const buttonClass = 'inline-flex min-h-11 items-center rounded-lg border border-default bg-canvas px-4 text-sm font-semibold text-foreground transition-colors hover:border-strong hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-60'
  return <div className="ml-auto flex flex-wrap items-center gap-2">{googleAuthEnabled ? <button type="button" disabled={pending} onClick={linkGoogle} className={buttonClass}>Connect Google</button> : null}<button type="button" disabled={pending} onClick={signOut} className={buttonClass}>{pending ? 'Signing out…' : 'Sign out'}</button>{error ? <span role="alert" className="text-sm text-danger">Something went wrong. Try again.</span> : null}</div>
}
