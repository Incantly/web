'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type FormEvent, useState, useEffect } from 'react'
import { authClient, googleAuthEnabled } from '../../lib/auth-client'
import { GrowthShader } from '../landing/GrowthShader'

type Mode = 'login' | 'signup'
const titles: Record<Mode, string> = { login: 'Welcome back.', signup: 'Get started.' }
const actions: Record<Mode, string> = { login: 'Continue with email', signup: 'Create account' }
const inputClass = 'min-h-12 w-full rounded-xl border border-default bg-surface px-4 text-foreground focus-visible:outline-focus disabled:opacity-60'

function safeNext() {
  const value = new URLSearchParams(window.location.search).get('next')
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/notes'
  const url = new URL(value, window.location.origin)
  return url.origin === window.location.origin ? url.pathname + url.search : '/notes'
}

export function AuthScreen({ initialMode = 'login' }: { initialMode?: Mode }) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>(initialMode)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [email, setEmail] = useState('')

  const [codeSent, setCodeSent] = useState(false)
  const [name, setName] = useState('')
  const [cooldown, setCooldown] = useState(0)
  useEffect(() => {
    if (!cooldown) return
    const timer = setTimeout(() => setCooldown(value => Math.max(0, value - 1)), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  function changeMode(next: Mode) { setMode(next); setCodeSent(false); setMessage(''); setError('') }

  async function requestCode() {
    const result = await authClient.emailOtp.sendVerificationOtp({ email: email.trim().toLowerCase(), type: 'sign-in' })
    if (result.error) throw new Error('Could not send a code. Please try again shortly.')
    setCodeSent(true); setCooldown(30)
    setMessage('Check your email for a six-digit code.')
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setPending(true); setError(''); setMessage('')
    try {
      if (!codeSent) {
        if (mode === 'signup') setName(String(data.get('firstName') ?? '').trim() + ' ' + String(data.get('lastName') ?? '').trim())
        await requestCode()
      } else {
        const result = await authClient.signIn.emailOtp({ email: email.trim().toLowerCase(), otp: String(data.get('otp') ?? ''), ...(mode === 'signup' ? { name } : {}) })
        if (result.error) throw new Error('That code is invalid or expired. Please try again.')
        router.replace(safeNext()); router.refresh()
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Please try again shortly.') }
    finally { setPending(false) }
  }

  async function google() {
    setPending(true); setError('')
    try {
      const result = await authClient.signIn.social({ provider: 'google', callbackURL: window.location.origin + safeNext(), errorCallbackURL: window.location.origin + '/auth?error=oauth' })
      if (result.error) throw new Error()
    } catch { setError('Google sign-in could not start. Please try again.'); setPending(false) }
  }

  return (
    <main className="grid min-h-svh bg-canvas lg:grid-cols-2">
      <section className="relative hidden flex-col justify-between overflow-hidden border-r border-default bg-surface p-12 lg:flex [&>a]:relative [&>div:last-child]:relative">
        <GrowthShader />
        <Link href="/" className="flex items-center gap-2 font-display text-3xl text-foreground"><Image src="/incantly-logo.svg" alt="" width={24} height={33} />incantly</Link>
        <div><h1 className="font-display text-5xl leading-tight text-foreground">A quiet place for ideas to become more.</h1><p className="mt-6 text-muted">Write, research, and follow every question.</p></div>
      </section>
      <section className="flex min-w-0 items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-md">
          <Link href="/" className="mb-8 block font-display text-2xl text-foreground lg:hidden">incantly</Link>
          <h2 className="font-display text-4xl text-foreground">{codeSent ? 'Check your email.' : titles[mode]}</h2>
          {!codeSent && googleAuthEnabled ? <>
            <button type="button" disabled={pending} onClick={google} className="mt-7 flex min-h-12 w-full items-center justify-center gap-3 rounded-xl border border-default bg-surface px-5 font-semibold text-foreground disabled:opacity-60"><Image src="/google-icon.svg" alt="" width={20} height={20} />Continue with Google</button>
            <div className="mt-6 flex items-center gap-4 text-sm text-muted"><span className="h-px flex-1 border-t border-default" /><span>or continue with email</span><span className="h-px flex-1 border-t border-default" /></div>
          </> : null}
          <form onSubmit={submit} className="mt-7 space-y-4">
            <fieldset disabled={pending} className="space-y-4">
              {mode === 'signup' && !codeSent ? <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm text-foreground">First name<input name="firstName" autoComplete="given-name" required maxLength={80} className={inputClass} /></label>
                <label className="block text-sm text-foreground">Last name<input name="lastName" autoComplete="family-name" required maxLength={80} className={inputClass} /></label>
              </div> : null}
              {!codeSent ? <label className="block text-sm text-foreground">Email address<input name="email" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} className={inputClass} /></label> : null}
              {codeSent ? <label className="block text-sm text-foreground">Six-digit code<input name="otp" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required maxLength={6} className={inputClass} /></label> : null}
              <button className="min-h-12 w-full rounded-xl bg-button px-5 font-semibold text-inverse hover:bg-button-hover disabled:opacity-60" type="submit">{pending ? 'Please wait…' : codeSent ? 'Verify and continue' : actions[mode]}</button>
            </fieldset>
          </form>
          {codeSent ? <button disabled={pending || cooldown > 0} onClick={async () => {
            setPending(true); setError('')
            try { await requestCode() } catch { setError('Could not resend the code. Try again shortly.') }
            finally { setPending(false) }
          }} className="mt-3 min-h-11 text-sm text-button underline">{cooldown ? 'Resend in ' + cooldown + 's' : 'Resend code'}</button> : null}
          <button disabled={pending} onClick={() => changeMode(mode === 'login' ? 'signup' : 'login')} className="mt-5 min-h-11 text-sm text-button underline">{mode === 'login' ? 'New here? Create an account' : 'Back to sign in'}</button>
          {message ? <p role="status" className="mt-4 break-words text-sm text-muted">{message}</p> : null}
          {error ? <p role="alert" className="mt-4 break-words text-sm text-foreground">{error}</p> : null}
        </div>
      </section>
    </main>
  )
}
