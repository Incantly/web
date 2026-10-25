import Image from 'next/image'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { legalEntity } from '../../lib/legal/company'
import { IncantlyFooter } from '../landing/Footer'

export type LegalSection = { id: string; title: string; body: ReactNode }

const pages = [
  { href: '/terms', label: 'Terms of Service' },
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/cookies', label: 'Cookie Policy' },
] as const

/** A company detail, or a clearly marked gap until it is known. */
export function Detail({ value, missing }: { value: string | null; missing: string }) {
  return value ? <>{value}</> : <mark className="rounded bg-surface px-1 text-foreground">[to be confirmed: {missing}]</mark>
}

export function Email({ value, missing }: { value: string | null; missing: string }) {
  return value ? <a href={`mailto:${value}`}>{value}</a> : <Detail value={null} missing={missing} />
}

/** A plain-language summary shown before the binding text of a section. */
export function InShort({ children }: { children: ReactNode }) {
  return <p className="mt-0! rounded-xl border border-default bg-surface px-4 py-3 text-sm! leading-6! text-muted"><strong className="text-foreground">In short:</strong> {children}</p>
}

/** A horizontally scrollable table that never widens the page. */
export function LegalTable({ label, head, rows }: { label: string; head: string[]; rows: ReactNode[][] }) {
  return <div role="region" aria-label={label} tabIndex={0} className="mt-4 overflow-x-auto rounded-xl border border-default focus-visible:outline-2 focus-visible:outline-focus">
    <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
      <thead className="bg-surface"><tr>{head.map((cell) => <th key={cell} scope="col" className="px-3 py-2.5 font-semibold text-foreground">{cell}</th>)}</tr></thead>
      <tbody>{rows.map((row, index) => <tr key={index} className="border-t border-default align-top">{row.map((cell, column) => <td key={column} className="px-3 py-2.5 leading-6 text-muted">{cell}</td>)}</tr>)}</tbody>
    </table>
  </div>
}

const prose = [
  '[&_p]:mt-4 [&_p]:text-base [&_p]:leading-7 [&_p]:text-muted',
  '[&_ul]:mt-4 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6 [&_ol]:mt-4 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-6',
  '[&_li]:text-base [&_li]:leading-7 [&_li]:text-muted [&_li]:marker:text-subtle',
  '[&_h3]:mt-8 [&_h3]:font-display [&_h3]:text-xl [&_h3]:font-normal [&_h3]:text-foreground',
  '[&_strong]:font-semibold [&_strong]:text-foreground',
  '[&_a]:font-semibold [&_a]:text-button [&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:text-button-hover',
].join(' ')

export function LegalDocument({ title, intro, sections, current }: { title: string; intro: ReactNode; sections: LegalSection[]; current: (typeof pages)[number]['href'] }) {
  const contents = <ol className="m-0 list-none space-y-0.5 p-0">
    {sections.map((section, index) => <li key={section.id}>
      <a href={`#${section.id}`} className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm text-muted no-underline hover:bg-surface hover:text-foreground lg:min-h-9">
        <span className="w-6 shrink-0 tabular-nums text-subtle">{index + 1}.</span><span className="min-w-0">{section.title}</span>
      </a>
    </li>)}
  </ol>

  return <>
    <header className="border-b border-default bg-canvas pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex max-w-[76rem] flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] sm:px-6">
        <Link href="/" className="flex min-h-11 items-center gap-2 font-display text-[1.6rem] tracking-[-0.04em] text-foreground no-underline" aria-label="Incantly home">
          <Image src="/incantly-logo.svg" alt="" width={20} height={28} className="h-7 w-auto" /> incantly
        </Link>
        <nav aria-label="Legal documents" className="-mx-2 flex flex-wrap">
          {pages.map((page) => <Link key={page.href} href={page.href} aria-current={page.href === current ? 'page' : undefined}
            className="flex min-h-11 items-center rounded-lg px-2 text-sm text-muted no-underline hover:text-foreground aria-[current=page]:font-semibold aria-[current=page]:text-foreground">{page.label}</Link>)}
        </nav>
      </div>
    </header>

    <main className="mx-auto max-w-[76rem] pb-16 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[clamp(2rem,6vw,4rem)] sm:px-6">
      <div className="max-w-[46rem]">
        <p className="m-0 text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-subtle">Legal · {legalEntity.product}</p>
        <h1 className="mt-3 font-display text-[clamp(2.25rem,6vw,3.75rem)] font-normal leading-[1.02] tracking-[-0.04em] text-foreground">{title}</h1>
        <p className="mt-4 text-sm text-muted">Last updated {legalEntity.lastUpdated}</p>
        <div className={`mt-6 ${prose}`}>{intro}</div>
      </div>

      <div className="mt-10 grid gap-10 lg:grid-cols-[15rem_minmax(0,46rem)] lg:gap-14">
        <nav aria-label="On this page" className="lg:sticky lg:top-6 lg:max-h-[calc(100svh-3rem)] lg:self-start lg:overflow-y-auto">
          <details className="rounded-xl border border-default lg:hidden">
            <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm font-semibold text-foreground">On this page</summary>
            <div className="border-t border-default p-2">{contents}</div>
          </details>
          <div className="hidden lg:block">
            <p className="m-0 mb-2 px-2 text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-subtle">On this page</p>
            {contents}
          </div>
        </nav>

        <article className="min-w-0">
          {sections.map((section, index) => <section key={section.id} id={section.id} aria-labelledby={`${section.id}-title`} className={`scroll-mt-6 ${index ? 'mt-12 border-t border-default pt-10' : ''}`}>
            <h2 id={`${section.id}-title`} className="m-0 mb-4 font-display text-[clamp(1.5rem,3vw,2rem)] font-normal leading-tight tracking-[-0.02em] text-foreground">
              <span className="mr-2 text-subtle">{index + 1}.</span>{section.title}
            </h2>
            <div className={prose}>{section.body}</div>
          </section>)}
        </article>
      </div>
    </main>
    <IncantlyFooter />
  </>
}
