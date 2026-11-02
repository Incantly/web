import { eyebrowClass } from '../../lib/ui'

const questions = [
  { q: 'Is tax included?', a: 'No. Prices are before tax; tax for your country is added at checkout.' },
  { q: 'Can I cancel anytime?', a: 'Yes. You keep your plan until the end of the period you paid for, then move to Free. Nothing is deleted.' },
  { q: 'Can I get a refund?', a: 'Yes, a full refund within 5 days of a payment. A refund ends the paid plan straight away.' },
  { q: 'What happens if a payment fails?', a: 'You keep access for 2 days while we retry. Update your card from Manage billing.' },
  { q: 'What happens to my files if I downgrade?', a: 'They stay. If you are over a Free limit, new uploads pause until you are under it or upgrade.' },
  { q: 'How does AI usage reset?', a: 'Every 4 hours and every week, automatically. You can always see how much you have used.' },
  { q: 'Who handles payments?', a: 'Polar, our payment provider and merchant of record. Receipts and invoices come from Polar.' },
] as const

/** Common billing questions. */
export function PricingFaq() {
  return <section className="mx-auto grid max-w-[76rem] gap-8 pb-[clamp(3rem,8vw,5rem)] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[clamp(4rem,9vw,6.5rem)] sm:px-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-14" aria-labelledby="faq-heading">
    <div>
      <p className={eyebrowClass}>Questions</p>
      <h2 id="faq-heading" className="mt-3 font-display text-[clamp(2rem,5vw,3rem)] font-normal leading-[1.05] tracking-[-0.04em] text-foreground text-balance">Before you choose</h2>
    </div>
    <div className="border-t border-default">
      {questions.map((item) => <details key={item.q} className="group border-b border-default">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 text-base font-medium text-foreground [&::-webkit-details-marker]:hidden">
          {item.q}
          <span aria-hidden="true" className="font-display text-2xl leading-none text-subtle transition-transform duration-[180ms] group-open:rotate-45 motion-reduce:transition-none">+</span>
        </summary>
        <p className="m-0 max-w-[40rem] pb-5 text-base leading-7 text-muted">{item.a}</p>
      </details>)}
    </div>
  </section>
}
