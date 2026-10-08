'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function AuthScreen() {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const signIn = async () => {
    setPending(true)
    const next = new URLSearchParams(window.location.search).get('next') ?? '/notes'
    await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ next }) })
    router.push(next.startsWith('/') ? next : '/notes')
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
          <h2 id="auth-heading" className="mt-3 font-display text-[clamp(2.5rem,6vw,4rem)] font-normal leading-[0.95] tracking-[-0.055em] text-foreground">Welcome back.</h2>
          <p className="mt-4 leading-7 text-muted">Sign in to open your notes and documents.</p>
          <button type="button" onClick={signIn} disabled={pending} className="mt-9 min-h-12 w-full rounded-xl bg-button px-5 font-semibold text-inverse transition hover:bg-button-hover disabled:opacity-60">{pending ? 'Signing in…' : 'Log in'}</button>
          <p className="mt-6 text-center text-xs leading-5 text-subtle">This demo uses a simple private session gate.</p>
        </div>
      </section>
    </main>
  )
}
