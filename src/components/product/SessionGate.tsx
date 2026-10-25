'use client'

import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { authClient } from '../../lib/auth-client'

export type CurrentUser = { id: string; name: string; email: string }

const CurrentUserContext = createContext<CurrentUser | null>(null)

/** The signed-in user. Only usable inside `SessionGate`. */
export function useCurrentUser(): CurrentUser {
  const user = useContext(CurrentUserContext)
  if (!user) throw new Error('useCurrentUser must be used inside SessionGate')
  return user
}

/** Supplies a fixed user without a session check, for read-only previews like the landing showcase. */
export function CurrentUserProvider({ user, children }: { user: CurrentUser; children: ReactNode }) {
  return <CurrentUserContext.Provider value={user}>{children}</CurrentUserContext.Provider>
}

function signInUrl() {
  const next = window.location.pathname + window.location.search
  return new URL(`/auth?next=${encodeURIComponent(next)}`, window.location.origin).href
}

function GateScreen({ children }: { children: ReactNode }) {
  return <main className="grid min-h-svh place-items-center bg-surface px-4">{children}</main>
}

/**
 * Renders protected UI only after `GET /api/auth/get-session` confirms a session.
 * The proxy cookie check is only an early redirect; this is the real gate in the browser.
 */
export function SessionGate({ children }: { children: ReactNode }) {
  const session = authClient.useSession()
  const user = session.data?.user
  const signedOut = !session.isPending && !session.error && !user

  useEffect(() => {
    if (signedOut) window.location.replace(signInUrl())
  }, [signedOut])

  if (user) {
    const current: CurrentUser = { id: user.id, name: user.name ?? '', email: user.email }
    return <CurrentUserContext.Provider value={current}>{children}</CurrentUserContext.Provider>
  }

  if (session.error) {
    return <GateScreen>
      <div className="max-w-sm text-center">
        <p className="font-display text-2xl text-foreground">We couldn’t load your workspace.</p>
        <p className="mt-2 text-sm text-muted">Check your connection, then try again.</p>
        <button type="button" onClick={() => { void session.refetch() }} className="mt-6 min-h-11 rounded-xl bg-button px-5 text-sm font-semibold text-inverse hover:bg-button-hover">Try again</button>
      </div>
    </GateScreen>
  }

  return <GateScreen>
    <p role="status" className="flex items-center gap-3 text-sm text-muted">
      <span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-default border-t-foreground motion-reduce:animate-none" />
      {signedOut ? 'Taking you to sign in…' : 'Loading your workspace…'}
    </p>
  </GateScreen>
}
