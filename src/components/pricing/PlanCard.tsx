import { AppIcon } from '../product/AppIcon'
import type { PricingCard } from '@/hooks/use-pricing'
import { PlanAction } from './PlanAction'

/** One plan: name, price for the chosen period, its button and what it includes. `compact` tightens it for the Plans dialog. */
export function PlanCard({ card, compact = false }: { card: PricingCard; compact?: boolean }) {
  const { plan, copy, price, current, note } = card
  const headingId = `plan-${plan.plan.toLowerCase()}`
  return <article aria-labelledby={headingId} className={`relative flex min-w-0 flex-col rounded-[1.15rem] border bg-raised ${compact ? 'p-5' : 'p-[clamp(1.25rem,3vw,1.75rem)]'} ${copy.popular ? 'border-button shadow-[0_1px_0_var(--ui-border),0_18px_40px_-28px_var(--ui-text)]' : 'border-default'}`}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 id={headingId} className={`m-0 font-display ${compact ? 'text-2xl' : 'text-[1.75rem]'} font-normal leading-none tracking-[-0.03em] text-foreground`}>{plan.name}</h2>
      {current ? <span className="rounded-full bg-surface px-2.5 py-1 text-xs font-semibold text-foreground">Your plan</span>
        : copy.popular ? <span className="inline-flex items-center gap-1 rounded-full bg-feature-research px-2.5 py-1 text-xs font-semibold text-accent"><span aria-hidden="true" className="[font-variant-emoji:text]">✳&#xFE0E;</span>Most popular</span> : null}
    </div>
    <p className={compact ? 'mt-1.5 min-h-10 text-[0.8125rem] leading-5 text-muted' : 'mt-2 min-h-[3rem] text-sm leading-6 text-muted'}>{copy.tagline}</p>

    <p className={`${compact ? 'mt-3' : 'mt-5'} flex items-baseline gap-1`}>
      <span className={`font-display ${compact ? 'text-[2.5rem]' : 'text-[clamp(2.75rem,6vw,3.5rem)]'} leading-none tracking-[-0.05em] text-foreground`}>{price.amount}</span>
      <span className="text-sm text-muted">{price.period}</span>
    </p>
    <p className={compact ? 'mt-1 text-xs text-muted' : 'mt-2 text-sm text-muted'}>{price.billed}{plan.prices.month ? <><span aria-hidden="true"> · </span><span className="sr-only">, </span>plus applicable tax</> : null}</p>

    <div className={compact ? 'mt-4' : 'mt-6'}><PlanAction card={card} compact={compact} /></div>
    {note ? <p className="mt-2 text-center text-sm text-muted">{note}</p> : null}

    <div className={`border-t border-default ${compact ? 'mt-4 pt-4' : 'mt-6 pt-5'}`}>
      {copy.lead ? <p className={`m-0 font-semibold text-foreground ${compact ? 'text-[0.8125rem]' : 'text-sm'}`}>{copy.lead}</p> : null}
      <ul className={`m-0 list-none p-0 ${compact ? 'mt-2 space-y-1.5' : 'mt-3 space-y-3'}`}>
        {copy.features.map((feature) => <li key={feature} className={`flex gap-2.5 text-muted ${compact ? 'text-[0.8125rem] leading-5' : 'text-sm leading-6'}`}>
          <AppIcon name="check" className={`${compact ? 'mt-0.5' : 'mt-1'} size-4 shrink-0 text-accent`} />{feature}
        </li>)}
      </ul>
    </div>
  </article>
}
