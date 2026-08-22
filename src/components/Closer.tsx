'use client'

import Link from 'next/link'
import { appHref } from '@/lib/app-url'
import DecodeText from './DecodeText'
import { useInView } from '../hooks'

export default function Closer() {
  const { ref, inView } = useInView<HTMLElement>(0.3)

  return (
    <section className={`closer${inView ? ' closer--in' : ''}`} id="access" ref={ref}>
      <div className="closer-band">
        <div className="closer-copy">
          <p className="kicker kicker--on-accent">Get early access</p>
          <h2 className="closer-title">
            <DecodeText
              text="You don't need more apps. You need the right interface, right now —"
              start={inView}
              stagger={70}
            />
            <br />
            <em className="closer-twist">and then not even that.</em>
          </h2>
          <div className="closer-form">
            <Link href={appHref('/auth?mode=signup')} className="btn-primary btn-primary--ink">
              Sign up with Google or email <span aria-hidden>→</span>
            </Link>
            <Link href={appHref('/auth')} className="closer-signin">
              Already have an account? Sign in
            </Link>
          </div>
        </div>
        <div className="closer-graphic" aria-hidden>
          <span />
          <span />
          <span />
          <span />
        </div>
      </div>
    </section>
  )
}
