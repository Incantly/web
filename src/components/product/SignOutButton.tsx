'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { authClient, googleAuthEnabled } from '../../lib/auth-client'

export function SignOutButton() {
  const router = useRouter()
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
      router.replace('/auth')
      router.refresh()
    } catch { setError(true); setPending(false) }
  }
  return <div className="ml-auto flex flex-wrap items-center gap-2">{googleAuthEnabled ? <button disabled={pending} onClick={linkGoogle} className="min-h-11 px-3 text-sm text-button underline">Connect Google</button> : null}<button disabled={pending} onClick={signOut} className="min-h-11 px-3 text-sm text-button underline">{pending ? 'Please wait…' : 'Sign out'}</button>{error ? <span role="alert" className="text-sm text-foreground">Try again.</span> : null}</div>
}
