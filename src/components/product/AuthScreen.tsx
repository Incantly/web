'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Dithering } from '@paper-design/shaders-react'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'

export function AuthScreen() {
  const router = useRouter()
  const [mode, setMode] = useState<'signin' | 'signup'>('signup')
  const [email, setEmail] = useState('')
  const [codeSent, setCodeSent] = useState(false)

  const sendCode = (event: FormEvent) => {
    event.preventDefault()
    if (email.trim()) setCodeSent(true)
  }

  const verifyCode = (event: FormEvent) => {
    event.preventDefault()
    router.push('/notes')
  }

  const continueWithGoogle = () => {
    router.push('/notes')
  }

  return (
    <main className="grid min-h-svh bg-canvas lg:grid-cols-[minmax(0,1.08fr)_minmax(28rem,0.92fr)]">
      <section className="relative hidden min-h-svh overflow-hidden border-r border-default bg-surface lg:flex lg:flex-col lg:justify-between lg:p-10 xl:p-14" aria-label="Incantly introduction">
        <div aria-hidden="true" className="absolute inset-0 hidden opacity-90 motion-safe:block">
          <Dithering
            speed={0.25}
            shape="warp"
            type="4x4"
            size={4}
            scale={1}
            frame={5929.724999967142}
            colorBack="#00000000"
            colorFront="#99CDFC"
            style={{ width: '100%', height: '100%' }}
          />
        </div>
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
          <p className="text-[0.7rem] font-bold uppercase tracking-[0.14em] text-button">Welcome to Incantly</p>
          <h2 id="auth-heading" className="mt-3 font-display text-[clamp(2.5rem,6vw,4rem)] font-normal leading-[0.95] tracking-[-0.055em] text-foreground">{mode === 'signup' ? 'Begin with a thought.' : 'Welcome back.'}</h2>
          <p className="mt-4 leading-7 text-muted">{mode === 'signup' ? 'Create your space and keep every note, paper, and journal connected.' : 'Continue where your curiosity left off.'}</p>

          <button type="button" onClick={continueWithGoogle} className="mt-9 flex min-h-12 w-full items-center justify-center gap-3 rounded-xl border border-default bg-raised px-4 font-semibold text-foreground transition hover:border-strong hover:bg-surface">
            <span className="grid size-6 place-items-center rounded-full border border-default text-sm font-bold text-button">G</span>
            Continue with Google
          </button>
          <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-[0.12em] text-subtle"><span className="h-px flex-1 bg-default" />or<span className="h-px flex-1 bg-default" /></div>

          {codeSent ? (
            <form className="grid gap-4" onSubmit={verifyCode}>
              <p className="text-sm leading-6 text-muted">Enter the code we sent to <span className="font-semibold text-foreground">{email}</span>.</p>
              <label className="grid gap-2 text-sm font-medium text-foreground">Code<input required inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="min-h-12 rounded-xl border border-default bg-raised px-4 text-base font-normal tracking-[0.3em] outline-none placeholder:text-subtle focus:border-button" placeholder="000000" /></label>
              <button type="submit" className="mt-2 min-h-12 rounded-xl bg-button px-5 font-semibold text-inverse transition hover:bg-button-hover">Verify code</button>
              <p className="text-center text-sm text-muted">Wrong address? <button type="button" onClick={() => setCodeSent(false)} className="min-h-11 px-1 font-semibold text-button underline-offset-4 hover:underline">Use a different email</button></p>
            </form>
          ) : (
            <form className="grid gap-4" onSubmit={sendCode}>
              <label className="grid gap-2 text-sm font-medium text-foreground">Email address<input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="min-h-12 rounded-xl border border-default bg-raised px-4 text-base font-normal outline-none placeholder:text-subtle focus:border-button" placeholder="you@company.com" /></label>
              <button type="submit" className="mt-2 min-h-12 rounded-xl bg-button px-5 font-semibold text-inverse transition hover:bg-button-hover">Send code</button>
            </form>
          )}
          <p className="mt-7 text-center text-sm text-muted">{mode === 'signup' ? 'Already have an account?' : 'New to Incantly?'} <button type="button" onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setCodeSent(false) }} className="min-h-11 px-1 font-semibold text-button underline-offset-4 hover:underline">{mode === 'signup' ? 'Sign in' : 'Create an account'}</button></p>
          <p className="mt-6 text-center text-xs leading-5 text-subtle">By continuing, you agree to our <Link href="#terms" className="text-button underline-offset-4 hover:underline">Terms of Service</Link> and <Link href="#privacy" className="text-button underline-offset-4 hover:underline">Privacy Policy</Link>.</p>
        </div>
      </section>
    </main>
  )
}
