'use client'

import Link from 'next/link'
import { WaitlistButton } from '../WaitlistButton'
import { authClient } from '../../lib/auth-client'
import { signInOpen } from '../../lib/signIn'

const primary = 'inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-[0.625rem] border border-button bg-button px-[0.9rem] py-2.5 text-[0.8125rem] font-medium text-inverse no-underline transition-[background-color,color,transform] duration-[180ms] hover:bg-button-hover focus-visible:bg-button-hover sm:px-[1.15rem]'

/** The header's end: "Open app" once signed in, otherwise Sign in and the waitlist. */
export function HeaderAccount() {
  const open = signInOpen()
  const session = authClient.useSession()
  if (open && session.data?.user) return <Link href="/notes" className={primary}>Open app</Link>
  return <>
    {open ? <a className="hidden min-h-11 items-center px-2 text-[0.8125rem] font-medium text-foreground no-underline underline-offset-4 hover:underline focus-visible:underline sm:inline-flex" href="/auth">Sign in</a> : null}
    <WaitlistButton className={primary}>Join waitlist</WaitlistButton>
  </>
}
