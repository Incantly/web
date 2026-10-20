'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { authClient, googleAuthEnabled } from '../../lib/auth-client'
import { type AuthClientError, type AuthProblem, describeAuthError, describeNetworkError, retryAfterSeconds } from '../../lib/auth-errors'
import { GrowthShader } from '../landing/GrowthShader'

type Mode = 'login' | 'signup'
const titles: Record<Mode, string> = { login: 'Welcome back.', signup: 'Get started.' }
const intros: Record<Mode, string> = {
  login: 'Sign in with a one-time code sent to your email. No password needed.',
  signup: 'Create your Incantly account. We’ll email you a code to confirm it’s you.',
}
const actions: Record<Mode, string> = { login: 'Continue with email', signup: 'Create account' }

const inputBase = 'mt-2 min-h-12 w-full rounded-xl border bg-surface px-4 text-base text-foreground placeholder:text-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-60'
const inputClass = (invalid: boolean) => `${inputBase} ${invalid ? 'border-danger' : 'border-default'}`
const primaryButton = 'flex min-h-12 w-full items-center justify-center rounded-xl bg-button px-5 font-semibold text-inverse transition-colors hover:bg-button-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-60'
const secondaryButton = 'inline-flex min-h-11 items-center justify-center rounded-xl border border-default bg-canvas px-4 text-sm font-semibold text-foreground transition-colors hover:border-strong hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-60'
const quietButton = 'inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-button transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:text-muted disabled:hover:bg-transparent'
const navLink = 'inline-flex min-h-11 items-center rounded-lg px-2 text-sm text-muted no-underline transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-focus'

function safeNext() {
  const value = new URLSearchParams(window.location.search).get('next')
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/notes'
  const url = new URL(value, window.location.origin)
  return url.origin === window.location.origin ? url.pathname + url.search : '/notes'
}

/** Runs one Better Auth call and turns every failure mode into an AuthProblem. */
async function attempt(step: 'send' | 'verify' | 'google', run: (onError: (context: { response: Response }) => void) => Promise<{ error: AuthClientError | null }>): Promise<AuthProblem | null> {
  let retryAfter: number | undefined
  try {
    const result = await run(({ response }) => { retryAfter = retryAfterSeconds(response) })
    return result.error ? describeAuthError(result.error, step, retryAfter) : null
  } catch (cause) {
    return describeNetworkError(cause)
  }
}

function ErrorIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="mt-0.5 size-5 flex-none" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="10" cy="10" r="8" />
      <path d="M10 6v4.5M10 13.5v.5" strokeLinecap="round" />
    </svg>
  )
}

export function AuthScreen({ initialMode = 'login', oauthFailed = false }: { initialMode?: Mode; oauthFailed?: boolean }) {
  const router = useRouter()
  const session = authClient.useSession()
  const [mode, setMode] = useState<Mode>(initialMode)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState('')
  const [problem, setProblem] = useState<AuthProblem | null>(oauthFailed ? { message: 'Google sign-in was cancelled or didn’t finish. Please try again or use email.' } : null)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const codeRef = useRef<HTMLInputElement>(null)
  const errorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!cooldown) return
    const timer = setTimeout(() => setCooldown(value => Math.max(0, value - 1)), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  useEffect(() => { if (codeSent) codeRef.current?.focus() }, [codeSent])
  useEffect(() => { if (problem && !problem.field) errorRef.current?.focus() }, [problem])

  const normalizedEmail = email.trim().toLowerCase()
  const emailInvalid = problem?.field === 'email'
  const otpInvalid = problem?.field === 'otp'

  function reset(next: Partial<{ mode: Mode; keepEmail: boolean }> = {}) {
    if (next.mode) setMode(next.mode)
    setCodeSent(false); setMessage(''); setProblem(null)
    if (!next.keepEmail) setEmail('')
  }

  async function requestCode() {
    const failure = await attempt('send', onError => authClient.emailOtp.sendVerificationOtp({ email: normalizedEmail, type: 'sign-in', fetchOptions: { onError } }))
    if (failure) { setProblem(failure); return false }
    setCodeSent(true); setCooldown(30)
    setMessage(`We sent a six-digit code to ${normalizedEmail}. It expires in 5 minutes.`)
    return true
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setPending(true); setProblem(null)
    try {
      if (!codeSent) {
        if (mode === 'signup') setName(`${String(data.get('firstName') ?? '').trim()} ${String(data.get('lastName') ?? '').trim()}`.trim())
        await requestCode()
        return
      }
      const otp = String(data.get('otp') ?? '').replace(/\s/g, '')
      if (!/^\d{6}$/.test(otp)) { setProblem({ field: 'otp', message: 'Enter the six-digit code from your email.' }); return }
      const failure = await attempt('verify', onError => authClient.signIn.emailOtp({ email: normalizedEmail, otp, ...(mode === 'signup' ? { name } : {}), fetchOptions: { onError } }))
      if (failure) { setProblem(failure); return }
      router.replace(safeNext()); router.refresh()
    } finally { setPending(false) }
  }

  async function resend() {
    setPending(true); setProblem(null)
    try { await requestCode() } finally { setPending(false) }
  }

  async function google() {
    setPending(true); setProblem(null)
    const failure = await attempt('google', onError => authClient.signIn.social({ provider: 'google', callbackURL: window.location.origin + safeNext(), errorCallbackURL: window.location.origin + '/auth?error=oauth', fetchOptions: { onError } }))
    if (failure) { setProblem(failure); setPending(false) }
  }

  async function signOut() {
    setPending(true); setProblem(null)
    try {
      const result = await authClient.signOut()
      if (result.error) setProblem({ message: 'We couldn’t sign you out. Please try again.' })
      else await session.refetch()
    } catch (cause) { setProblem(describeNetworkError(cause)) }
    finally { setPending(false) }
  }

  const signedInUser = session.data?.user
  const heading = signedInUser ? 'You’re signed in.' : codeSent ? 'Check your email.' : titles[mode]

  return (
    <main className="grid min-h-svh bg-canvas lg:grid-cols-2">
      <section className="relative hidden flex-col justify-between overflow-hidden border-r border-default bg-surface p-12 lg:flex [&>a]:relative [&>div:last-child]:relative">
        <GrowthShader />
        <Link href="/" className="flex items-center gap-2 font-display text-3xl text-foreground no-underline"><Image src="/incantly-logo.svg" alt="" width={24} height={33} />incantly</Link>
        <div><h1 className="font-display text-5xl leading-tight text-foreground">A quiet place for ideas to become more.</h1><p className="mt-6 text-muted">Write, research, and follow every question.</p></div>
      </section>

      <section className="flex min-w-0 flex-col px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:px-10">
        <header className="flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 font-display text-2xl text-foreground no-underline lg:invisible" aria-label="Incantly home"><Image src="/incantly-logo.svg" alt="" width={18} height={25} />incantly</Link>
          <Link href="/" className={navLink}><span aria-hidden="true" className="mr-1">←</span>Back to home</Link>
        </header>

        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
          <h2 className="font-display text-[clamp(2rem,6vw,2.5rem)] leading-tight text-foreground">{heading}</h2>

          {signedInUser ? (
            <div className="mt-4">
              <p className="break-words text-muted">You’re signed in as <span className="font-semibold text-foreground">{signedInUser.email}</span>.</p>
              <div className="mt-7 grid gap-3">
                <button type="button" disabled={pending} onClick={() => { router.replace(safeNext()); router.refresh() }} className={primaryButton}>Continue to Incantly</button>
                <button type="button" disabled={pending} onClick={signOut} className={`${secondaryButton} min-h-12 w-full`}>{pending ? 'Signing out…' : 'Sign out'}</button>
              </div>
            </div>
          ) : (
            <>
              <p className="mt-3 break-words text-muted">{codeSent ? message : intros[mode]}</p>

              {!codeSent && googleAuthEnabled ? <>
                <button type="button" disabled={pending} onClick={google} className={`${secondaryButton} mt-7 min-h-12 w-full gap-3 text-base`}><Image src="/google-icon.svg" alt="" width={20} height={20} />Continue with Google</button>
                <div className="mt-6 flex items-center gap-4 text-sm text-muted"><span className="h-px flex-1 border-t border-default" /><span>or use email</span><span className="h-px flex-1 border-t border-default" /></div>
              </> : null}

              <form onSubmit={submit} noValidate={codeSent} className="mt-7">
                <fieldset disabled={pending} className="space-y-4">
                  <legend className="sr-only">{codeSent ? 'Enter your code' : mode === 'login' ? 'Sign in' : 'Create an account'}</legend>
                  {mode === 'signup' && !codeSent ? <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block text-sm font-semibold text-foreground">First name<input name="firstName" autoComplete="given-name" required maxLength={80} className={inputClass(false)} /></label>
                    <label className="block text-sm font-semibold text-foreground">Last name<input name="lastName" autoComplete="family-name" required maxLength={80} className={inputClass(false)} /></label>
                  </div> : null}

                  {!codeSent ? (
                    <label className="block text-sm font-semibold text-foreground">Email address
                      <input key="email" name="email" type="email" autoComplete="email" required placeholder="you@example.com" value={email}
                        onChange={event => { setEmail(event.target.value); if (emailInvalid) setProblem(null) }}
                        aria-invalid={emailInvalid || undefined} aria-describedby={emailInvalid ? 'auth-error' : undefined} className={inputClass(emailInvalid)} />
                    </label>
                  ) : (
                    <label className="block text-sm font-semibold text-foreground">Six-digit code
                      <input key="otp" ref={codeRef} name="otp" type="text" inputMode="numeric" autoComplete="one-time-code" required maxLength={6} placeholder="000000"
                        onChange={() => { if (otpInvalid) setProblem(null) }}
                        aria-invalid={otpInvalid || undefined} aria-describedby={otpInvalid ? 'auth-error' : undefined}
                        className={`${inputClass(otpInvalid)} text-center font-mono text-2xl tracking-[0.5em]`} />
                    </label>
                  )}

                  {problem ? (
                    <div ref={errorRef} id="auth-error" role="alert" tabIndex={-1} className="flex gap-3 rounded-xl border border-danger bg-danger-surface px-4 py-3 text-sm text-danger focus:outline-none">
                      <ErrorIcon /><p className="m-0 min-w-0 break-words">{problem.message}</p>
                    </div>
                  ) : null}

                  <button className={primaryButton} type="submit">{pending ? 'Please wait…' : codeSent ? 'Verify and continue' : actions[mode]}</button>
                </fieldset>
              </form>

              {codeSent ? (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
                  <span className="flex flex-wrap items-center">Didn’t get it?
                    <button type="button" disabled={pending || cooldown > 0} onClick={resend} className={quietButton}>{cooldown ? `Resend in ${cooldown}s` : 'Resend code'}</button>
                  </span>
                  <button type="button" disabled={pending} onClick={() => reset({ keepEmail: true })} className={quietButton}>Use a different email</button>
                </div>
              ) : null}

              <div className="mt-8 flex flex-wrap items-center justify-center gap-x-1 gap-y-2 border-t border-default pt-6 text-sm text-muted">
                <span>{mode === 'login' ? 'New to Incantly?' : 'Already have an account?'}</span>
                <button type="button" disabled={pending} onClick={() => reset({ mode: mode === 'login' ? 'signup' : 'login', keepEmail: true })} className={quietButton}>
                  {mode === 'login' ? 'Create an account' : 'Sign in instead'}
                </button>
              </div>
            </>
          )}
        </div>

        <footer className="mx-auto w-full max-w-md text-center text-xs leading-relaxed text-muted">
          {!signedInUser ? <p className="m-0">By continuing, you agree to Incantly’s <Link href="/terms" className="font-semibold text-foreground underline-offset-2 hover:underline">Terms of Service</Link> and <Link href="/privacy" className="font-semibold text-foreground underline-offset-2 hover:underline">Privacy Policy</Link>.</p> : null}
          <nav aria-label="Legal" className="mt-3 flex flex-wrap items-center justify-center gap-x-2">
            <span>© {new Date().getFullYear()} Incantly</span>
            <span aria-hidden="true">·</span>
            <Link href="/privacy" className={navLink}>Privacy</Link>
            <Link href="/terms" className={navLink}>Terms</Link>
          </nav>
        </footer>
      </section>
    </main>
  )
}
