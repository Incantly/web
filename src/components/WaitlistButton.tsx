'use client'

import { useId, useState, type FormEvent, type ReactNode } from 'react'
import { apiErrorMessage } from '../lib/api/errors'
import { waitlistApi } from '../lib/api/waitlist'
import { buttonPrimary, buttonSecondary, Dialog, inputClass, labelClass } from './product/workspace/ui'

type Step = { kind: 'form'; error?: string } | { kind: 'sending' } | { kind: 'joined'; email: string }

/** A button that opens the waitlist form. Sign-up is invite-only while the waitlist is on. */
export function WaitlistButton({ className, children = 'Join waitlist' }: { className?: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>({ kind: 'form' })
  const formId = useId()
  const errorId = useId()

  function close() {
    setOpen(false)
    // Keep a failed or half-filled form; start fresh only after a successful join.
    if (step.kind === 'joined') setStep({ kind: 'form' })
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const name = String(form.get('name') ?? '').trim()
    const email = String(form.get('email') ?? '').trim()
    setStep({ kind: 'sending' })
    try {
      await waitlistApi.join({ name, email })
      setStep({ kind: 'joined', email })
    } catch (error) {
      setStep({ kind: 'form', error: apiErrorMessage(error) })
    }
  }

  const joined = step.kind === 'joined'
  const sending = step.kind === 'sending'
  const error = step.kind === 'form' ? step.error : undefined

  return (
    <>
      <button type="button" className={className} aria-haspopup="dialog" onClick={() => setOpen(true)}>{children}</button>
      <Dialog
        open={open}
        onClose={close}
        title={joined ? 'You’re on the list' : 'Join the waitlist'}
        description={joined ? undefined : 'Incantly is opening in waves. Leave your name and email and we’ll let you know when your spot is ready.'}
        footer={joined
          ? <button type="button" onClick={close} className={buttonPrimary}>Done</button>
          : <>
            <button type="button" onClick={close} className={buttonSecondary}>Cancel</button>
            <button type="submit" form={formId} disabled={sending} className={buttonPrimary}>{sending ? 'Joining…' : 'Join waitlist'}</button>
          </>}
      >
        {joined ? (
          <p className="break-words text-base leading-7 text-muted">
            Thanks for joining. We’ll email <span className="font-semibold text-foreground">{step.email}</span> as soon as your spot opens.
          </p>
        ) : (
          <form id={formId} onSubmit={submit}>
            <fieldset disabled={sending} className="grid gap-4">
              <legend className="sr-only">Your details</legend>
              <label className={labelClass}>Name
                <input name="name" autoComplete="name" autoFocus required maxLength={100} className={inputClass} />
              </label>
              <label className={labelClass}>Email address
                <input name="email" type="email" autoComplete="email" required maxLength={254} placeholder="you@example.com"
                  aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined} className={inputClass} />
              </label>
              {error ? <p id={errorId} role="alert" className="m-0 break-words rounded-xl border border-danger bg-danger-surface px-4 py-3 text-sm text-danger">{error}</p> : null}
            </fieldset>
          </form>
        )}
      </Dialog>
    </>
  )
}
