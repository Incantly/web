'use client'

import Link from 'next/link'
import { useEffect, useId, useState, useSyncExternalStore, type ReactNode } from 'react'
import { acceptAll, hasConsent, OPEN_SETTINGS_EVENT, openCookieSettings, optionalCategories, readConsent, rejectAll, saveConsent, subscribeConsent, type ConsentCategory, type ConsentChoices, type OptionalCategory } from '../../lib/consent/consent'
import { buttonSecondary, Dialog } from '../product/workspace/ui'

/**
 * The cookie banner and settings panel, mounted once in the root layout. Accept and reject are
 * equally prominent and one click each, as the EDPB and ICO require; nothing optional is pre-ticked.
 */

const categoryCopy: Record<ConsentCategory, { title: string; body: string }> = {
  necessary: { title: 'Strictly necessary', body: 'Keep you signed in, keep the service secure, remember these cookie choices, and store your notes in this browser so they work offline. Incantly can’t work without them, so they’re always on.' },
  preferences: { title: 'Preferences', body: 'Remember settings you choose, such as layout and display options, between visits.' },
  analytics: { title: 'Analytics', body: 'Help us understand how Incantly is used, such as which features people open and where things go wrong, so we can improve it. We use aggregated, pseudonymous data.' },
  marketing: { title: 'Marketing', body: 'Measure whether our campaigns work and show you relevant Incantly ads on other sites. We never sell your personal data. Your browser’s Global Privacy Control signal turns this off.' },
}

/** `undefined` until mounted, so the server render and first client render agree. */
const useDecision = () => useSyncExternalStore(subscribeConsent, () => readConsent(), () => undefined)

function Switch({ checked, disabled, onChange, labelledBy, describedBy }: { checked: boolean; disabled?: boolean; onChange?: (next: boolean) => void; labelledBy: string; describedBy: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-labelledby={labelledBy} aria-describedby={describedBy} disabled={disabled} onClick={() => onChange?.(!checked)}
    className="relative inline-flex h-11 w-14 shrink-0 items-center justify-center rounded-full disabled:cursor-not-allowed">
    <span aria-hidden="true" className={`flex h-7 w-12 items-center rounded-full p-0.5 transition-colors motion-reduce:transition-none ${checked ? 'bg-button' : 'bg-disabled'} ${disabled ? 'opacity-60' : ''}`}>
      <span className={`size-6 rounded-full bg-canvas shadow transition-transform motion-reduce:transition-none ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
    </span>
  </button>
}

function CategoryRow({ category, checked, onChange }: { category: ConsentCategory; checked: boolean; onChange?: (next: boolean) => void }) {
  const id = useId()
  const copy = categoryCopy[category]
  return <li className="flex items-start justify-between gap-4 border-b border-default py-4 last:border-b-0">
    <div className="min-w-0">
      <p id={`${id}-title`} className="m-0 text-sm font-semibold text-foreground">{copy.title}{category === 'necessary' ? <span className="ml-2 font-normal text-muted">Always on</span> : null}</p>
      <p id={`${id}-body`} className="m-0 mt-1 text-sm leading-6 text-muted">{copy.body}</p>
    </div>
    <Switch checked={checked} disabled={category === 'necessary'} onChange={onChange} labelledBy={`${id}-title`} describedBy={`${id}-body`} />
  </li>
}

const choiceButton = 'inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-button px-4 text-sm font-semibold text-inverse transition-colors hover:bg-button-hover sm:flex-none'

export function CookieConsent() {
  const decision = useDecision()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [draft, setDraft] = useState<ConsentChoices>(rejectAll)

  useEffect(() => {
    const open = () => { setDraft(readConsent()?.choices ?? rejectAll); setSettingsOpen(true) }
    window.addEventListener(OPEN_SETTINGS_EVENT, open)
    return () => window.removeEventListener(OPEN_SETTINGS_EVENT, open)
  }, [])

  const decide = (choices: ConsentChoices) => { saveConsent(choices); setSettingsOpen(false) }
  const showBanner = decision === null && !settingsOpen

  return <>
    {showBanner ? <section aria-label="Cookie consent" className="fixed inset-x-0 bottom-0 z-[60] px-[max(0.75rem,env(safe-area-inset-left))] pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-6">
      <div className="mx-auto flex max-w-[60rem] flex-col gap-4 rounded-[1.15rem] border border-default bg-raised p-4 shadow-xl sm:p-5 md:flex-row md:items-center">
        <div className="min-w-0 flex-1">
          <h2 className="m-0 font-display text-lg leading-tight text-foreground">Your privacy, your choice</h2>
          <p className="m-0 mt-1.5 text-sm leading-6 text-muted">
            We use strictly necessary cookies and browser storage to run Incantly. With your permission we’d also use cookies for preferences, analytics and marketing. You can change your mind any time in Cookie settings. Read our <Link href="/cookies" className="font-semibold text-foreground underline underline-offset-2">Cookie Policy</Link>.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 md:shrink-0">
          <button type="button" onClick={() => decide(rejectAll)} className={choiceButton}>Reject all</button>
          <button type="button" onClick={() => decide(acceptAll)} className={choiceButton}>Accept all</button>
          <button type="button" onClick={openCookieSettings} className={`${buttonSecondary} flex-1 sm:flex-none`}>Customize</button>
        </div>
      </div>
    </section> : null}

    <Dialog open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Cookie settings" description="Choose which optional cookies Incantly may use. Strictly necessary ones are always on."
      footer={<>
        <button type="button" onClick={() => decide(rejectAll)} className={buttonSecondary}>Reject all</button>
        <button type="button" onClick={() => decide(acceptAll)} className={buttonSecondary}>Accept all</button>
        <button type="button" onClick={() => decide(draft)} className={choiceButton}>Save choices</button>
      </>}>
      <ul className="m-0 list-none p-0">
        <CategoryRow category="necessary" checked />
        {optionalCategories.map((category: OptionalCategory) => <CategoryRow key={category} category={category} checked={draft[category]} onChange={(next) => setDraft((current) => ({ ...current, [category]: next }))} />)}
      </ul>
      <p className="m-0 mt-4 text-sm leading-6 text-muted">Details of every cookie and storage item are in our <Link href="/cookies" className="font-semibold text-foreground underline underline-offset-2">Cookie Policy</Link>. To see how we use personal data, read the <Link href="/privacy" className="font-semibold text-foreground underline underline-offset-2">Privacy Policy</Link>.</p>
    </Dialog>
  </>
}

/** A button that reopens the settings panel, for footers and the Cookie Policy. */
export function CookieSettingsButton({ className, children = 'Cookie settings' }: { className?: string; children?: ReactNode }) {
  return <button type="button" onClick={openCookieSettings} className={className}>{children}</button>
}

/** Renders its children only once the visitor has allowed the category, e.g. an analytics script. */
export function ConsentGate({ category, children }: { category: ConsentCategory; children: ReactNode }) {
  const decision = useDecision()
  return decision !== undefined && hasConsent(category) ? <>{children}</> : null
}
