'use client'

import { Fragment } from 'react'
import { eyebrowClass } from '../../lib/ui'
import { usePricing } from '@/hooks/use-pricing'

/** Every limit, plan by plan. Rows not launched yet say so. Scrolls inside itself on narrow screens. */
export function PlanComparison() {
  const { sections, planNames, canManageBilling, manageBilling, busy } = usePricing()
  return <section className="mx-auto max-w-[76rem] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[clamp(4rem,9vw,6.5rem)] sm:px-6" aria-labelledby="compare-heading">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className={eyebrowClass}>Compare plans</p>
        <h2 id="compare-heading" className="mt-3 font-display text-[clamp(2rem,5vw,3rem)] font-normal leading-[1.05] tracking-[-0.04em] text-foreground">What each plan includes</h2>
      </div>
      {canManageBilling ? <button type="button" disabled={busy} onClick={manageBilling} className="inline-flex min-h-11 items-center rounded-[0.625rem] border border-default bg-canvas px-4 text-sm font-medium text-foreground hover:border-strong hover:bg-surface disabled:opacity-60">Manage billing</button> : null}
    </div>

    <div role="region" aria-label="Plan comparison" tabIndex={0} className="mt-8 overflow-x-auto rounded-[1.15rem] border border-default focus-visible:outline-2 focus-visible:outline-focus">
      <table className="w-full min-w-[38rem] border-collapse text-left text-sm">
        <thead className="bg-surface">
          <tr>
            <th scope="col" className="w-[40%] px-4 py-3 font-semibold text-foreground"><span className="sr-only">Feature</span></th>
            {planNames.map((name) => <th key={name} scope="col" className="px-4 py-3 font-display text-lg font-normal text-foreground">{name}</th>)}
          </tr>
        </thead>
        {sections.map((section) => <Fragment key={section.id}>
          <tbody>
            <tr className="border-t border-default">
              <th scope="colgroup" colSpan={planNames.length + 1} className="px-4 pb-2 pt-6 text-left">
                <span className="block font-display text-xl font-normal text-foreground">{section.title}</span>
                {section.note ? <span className="mt-1 block max-w-[40rem] text-sm font-normal leading-6 text-muted">{section.note}</span> : null}
              </th>
            </tr>
            {section.rows.map((row) => <tr key={row.label} className="border-t border-default align-top">
              <th scope="row" className="px-4 py-3 font-normal leading-6 text-foreground">
                {row.label}
                {row.soon ? <span className="ml-2 inline-block rounded-full bg-surface px-2 py-0.5 align-middle text-xs font-medium text-muted">Coming soon</span> : null}
              </th>
              {row.values.map((value, index) => <td key={planNames[index]} className="px-4 py-3 leading-6 text-muted">
                {value === '✓' ? <><span aria-hidden="true" className="text-accent">✓</span><span className="sr-only">Included</span></>
                  : value === '–' ? <><span aria-hidden="true">–</span><span className="sr-only">Not included</span></> : value}
              </td>)}
            </tr>)}
          </tbody>
        </Fragment>)}
      </table>
    </div>
    <p className="mt-4 text-sm leading-6 text-muted">Prices are in US dollars, before tax. Tax for your country is added at checkout.</p>
  </section>
}
