'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import { authClient, googleAuthEnabled } from '../../lib/auth-client'

type AuthStep =
  | { kind: 'email' }
  | { kind: 'code'; email: string; resendAvailableAt: number }

const RESEND_DELAY_MS = 30_000

function getSafeNextPath(): string {
  const next = new URLSearchParams(window.location.search).get('next')
  return next?.startsWith('/') && !next.startsWith('//') ? next : '/notes'
}

export function AuthScreen() {
  const router = useRouter()
  const [step, setStep] = useState<AuthStep>({ kind: 'email' })
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const resendSeconds = useMemo(
    () => step.kind === 'code' ? Math.max(0, Math.ceil((step.resendAvailableAt - now) / 1000)) : 0,
    [now, step],
  )

  useEffect(() => {
    if (step.kind !== 'code' || resendSeconds === 0) return
    const timer = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [resendSeconds, step.kind])

  const requestCode = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault()
    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail) {
      setError('Enter your email address to continue.')
      return
    }

    setPending(true)
    setError('')
    setMessage('')
    const result = await authClient.emailOtp.sendVerificationOtp({
      email: normalizedEmail,
      type: 'sign-in',
    })
    setPending(false)

    if (result.error) {
      setError('We could not send a code. Please try again in a moment.')
      return
    }

    setEmail(normalizedEmail)
    setOtp('')
    setStep({ kind: 'code', email: normalizedEmail, resendAvailableAt: Date.now() + RESEND_DELAY_MS })
    setMessage('If this email can sign in, a six-digit code is on its way.')
  }

  const verifyCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (step.kind !== 'code') return

    const code = otp.replace(/\s/g, '')
    if (code.length !== 6) {
      setError('Enter the six-digit code from your email.')
      return
    }

    setPending(true)
    setError('')
    setMessage('')
    const result = await authClient.signIn.emailOtp({
      email: step.email,
      otp: code,
    })
    setPending(false)

    if (result.error) {
      setError('That code could not be verified. Request a new code and try again.')
      return
    }

    router.replace(getSafeNextPath())
    router.refresh()
  }

  const signInWithGoogle = async () => {
    setPending(true)
    setError('')
    const result = await authClient.signIn.social({
      provider: 'google',
      callbackURL: getSafeNextPath(),
    })
    if (result.error) {
      setPending(false)
      setError('Google sign-in could not start. Please try again.')
    }
  }

  return (
    <main className="grid min-h-svh bg-canvas lg:grid-cols-[minmax(0,1.08fr)_minmax(28rem,0.92fr)]">
      <section className="relative hidden min-h-svh overflow-hidden border-r border-default bg-surface lg:flex lg:flex-col lg:justify-between lg:p-10 xl:p-14" aria-label="Incantly introduction">
        <div className="absolute inset-0 bg-gradient-to-b from-canvas/10 via-canvas/20 to-canvas/85" />
        <Link href="/" className="relative z-10 flex w-fit items-center gap-2 font-display text-[1.7rem] tracking-[-0.055em] text-foreground no-underline">
          <Image src="/incantly-logo.svg" alt="" width={24} height={33} className="h-7 w-auto" /> incantly
        </Link>
        <div className="relative z-10 max-w-[38rem]">
          <h1 className="font-display text-[clamp(3.25rem,6vw,6.25rem)] font-normal leading-[0.9] tracking-[-0.065em] text-foreground">A quiet place for ideas to become more.</h1>
          <p className="mt-7 max-w-[30rem] text-lg leading-7 text-muted">Write, research, visualize, and follow every question without losing the note that started it.</p>
        </div>
      </section>

      <section className="flex min-h-svh items-center justify-center px-5 py-10 sm:px-10" aria-labelledby="auth-heading">
        <div className="w-full max-w-[28rem]">
          <Link href="/" className="mb-14 flex w-fit items-center gap-2 font-display text-[1.5rem] tracking-[-0.05em] text-foreground no-underline lg:hidden">
            <Image src="/incantly-logo.svg" alt="" width={22} height={30} className="h-7 w-auto" /> incantly
          </Link>
          <p className="text-[0.7rem] font-bold uppercase tracking-[0.14em] text-button">Private workspace</p>
          <h2 id="auth-heading" className="mt-3 font-display text-[clamp(2.5rem,6vw,4rem)] font-normal leading-[0.95] tracking-[-0.055em] text-foreground">{step.kind === 'email' ? 'Welcome back.' : 'Check your email.'}</h2>
          <p className="mt-4 leading-7 text-muted">{step.kind === 'email' ? `Use${googleAuthEnabled ? ' Google or' : ''} a one-time email code to open your notes and documents.` : `We sent a sign-in code to ${step.email}.`}</p>

          {step.kind === 'email' ? (
            <>
              <form className="mt-9 space-y-4" onSubmit={requestCode}>
                <label className="block text-sm font-medium text-foreground" htmlFor="email">Email address</label>
                <input id="email" name="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} disabled={pending} required className="min-h-12 w-full rounded-xl border border-default bg-surface px-4 text-foreground outline-none placeholder:text-subtle focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-60" placeholder="you@example.com" />
                <button type="submit" disabled={pending} className="min-h-12 w-full rounded-xl bg-button px-5 font-semibold text-inverse transition hover:bg-button-hover disabled:opacity-60">{pending ? 'Sending code…' : 'Continue with email'}</button>
              </form>
              {googleAuthEnabled ? (
                <>
                  <div className="my-6 flex items-center gap-3 text-xs text-subtle" aria-hidden="true"><span className="h-px flex-1 bg-default" />or<span className="h-px flex-1 bg-default" /></div>
                  <button type="button" onClick={signInWithGoogle} disabled={pending} className="min-h-12 w-full rounded-xl border border-default bg-surface px-5 font-semibold text-foreground transition hover:border-strong disabled:opacity-60">Continue with Google</button>
                </>
              ) : null}
            </>
          ) : (
            <form className="mt-9 space-y-4" onSubmit={verifyCode}>
              <label className="block text-sm font-medium text-foreground" htmlFor="otp">Six-digit code</label>
              <input id="otp" name="otp" type="text" inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} disabled={pending} required className="min-h-12 w-full rounded-xl border border-default bg-surface px-4 text-center font-mono text-lg tracking-[0.35em] text-foreground outline-none placeholder:text-subtle focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-60" placeholder="000000" />
              <button type="submit" disabled={pending} className="min-h-12 w-full rounded-xl bg-button px-5 font-semibold text-inverse transition hover:bg-button-hover disabled:opacity-60">{pending ? 'Verifying…' : 'Verify and continue'}</button>
              <div className="flex items-center justify-between gap-4 text-sm">
                <button type="button" onClick={() => { setStep({ kind: 'email' }); setError(''); setMessage('') }} disabled={pending} className="min-h-11 text-muted underline hover:text-foreground disabled:opacity-60">Use a different email</button>
                <button type="button" onClick={() => requestCode()} disabled={pending || resendSeconds > 0} className="min-h-11 text-button underline hover:text-foreground disabled:text-subtle">{resendSeconds > 0 ? `Resend in ${resendSeconds}s` : 'Resend code'}</button>
              </div>
            </form>
          )}
          {message ? <p className="mt-5 text-sm leading-6 text-muted" role="status">{message}</p> : null}
          {error ? <p className="mt-5 text-sm leading-6 text-foreground" role="alert">{error}</p> : null}
          <p className="mt-6 text-center text-xs leading-5 text-subtle">We never use a password. A new email code is the account-recovery flow.</p>
        </div>
      </section>
    </main>
  )
}
