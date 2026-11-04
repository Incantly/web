'use client'

import { useState } from 'react'
import { notificationsApi } from '../../lib/api/notifications'
import { apiErrorMessage, isApiError } from '../../lib/api/errors'
import { AppIcon } from './AppIcon'

type Phase =
  | { name: 'confirm' }
  | { name: 'working' }
  | { name: 'done' }
  | { name: 'failed'; message: string; invalid: boolean }

/**
 * Email unsubscribe confirmation. Never fetches on load — the `GET` email
 * link redeems on open, so unsubscribing always takes an explicit press of
 * the button below, which lands on `POST /v1/email/unsubscribe`. Public;
 * the token authenticates.
 */
export function UnsubscribeView({ token }: { token: string | null }) {
  const [phase, setPhase] = useState<Phase>({ name: 'confirm' })

  async function confirm() {
    if (!token || phase.name === 'working' || phase.name === 'done') return
    setPhase({ name: 'working' })
    try {
      await notificationsApi.unsubscribe(token)
      setPhase({ name: 'done' })
    } catch (error) {
      const invalid = isApiError(error, 'UNSUBSCRIBE_LINK_INVALID')
      setPhase({ name: 'failed', message: apiErrorMessage(error), invalid })
    }
  }

  return <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col items-center justify-center px-5 py-16 text-center">
    <span className="grid size-14 place-items-center rounded-full bg-surface text-muted"><AppIcon name="bell" className="size-6" /></span>
    {token == null ? <>
      <h1 className="mt-4 font-display text-2xl text-foreground">This link isn’t complete</h1>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted">The unsubscribe link needs its token. Open the link from your email again — if it still doesn’t work, ask us for a fresh one.</p>
    </> : phase.name === 'done' ? <>
      <h1 className="mt-4 font-display text-2xl text-foreground">You’re unsubscribed</h1>
      <p role="status" className="mt-2 max-w-md text-sm leading-6 text-muted">You won’t get this email any more. Your notification bell here is unaffected, and you can turn emails back on any time from Settings → Notifications.</p>
    </> : phase.name === 'failed' && phase.invalid ? <>
      <h1 className="mt-4 font-display text-2xl text-foreground">This link has expired</h1>
      <p role="alert" className="mt-2 max-w-md text-sm leading-6 text-muted">{phase.message} Open the newest email for a fresh link, or change emails from Settings → Notifications.</p>
    </> : <>
      <h1 className="mt-4 font-display text-2xl text-foreground">Unsubscribe from this email?</h1>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted">This stops the email you came from. Your notification bell here is unaffected, and you can turn emails back on any time from Settings → Notifications.</p>
      {phase.name === 'failed' ? <p role="alert" className="mt-4 w-full max-w-md rounded-xl border border-danger bg-danger-surface px-4 py-3 text-sm text-danger">{phase.message}</p> : null}
      <button
        type="button"
        onClick={() => void confirm()}
        disabled={phase.name === 'working'}
        className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-button px-6 text-sm font-semibold text-inverse transition-colors hover:bg-button-hover disabled:cursor-not-allowed disabled:opacity-60"
      >{phase.name === 'working' ? 'Unsubscribing…' : phase.name === 'failed' ? 'Try again' : 'Yes, unsubscribe me'}</button>
    </>}
  </main>
}
