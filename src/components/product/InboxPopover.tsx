'use client'

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { AppIcon } from './AppIcon'

export type InboxItem = { id: string; title: string; detail: string; when: string }

const tabs = [
  { id: 'all', label: 'All', empty: ['You’re all caught up', 'Quick thoughts and updates will show up here.'] },
  { id: 'today', label: 'Today', empty: ['Nothing new today', 'Anything that arrives today will show up here.'] },
  { id: 'earlier', label: 'Earlier', empty: ['Nothing waiting', 'Older updates you haven’t handled will stay here.'] },
] as const
type TabId = (typeof tabs)[number]['id']

function inTab(item: InboxItem, tab: TabId) {
  if (tab === 'today') return item.when === 'Today'
  if (tab === 'earlier') return item.when !== 'Today'
  return true
}

export function InboxPopover({ items, createFrom, dismiss }: { items: InboxItem[]; createFrom: (item: InboxItem) => void; dismiss: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<TabId>('all')
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const tabRefs = useRef<Record<TabId, HTMLButtonElement | null>>({ all: null, today: null, earlier: null })
  const baseId = useId()
  const visible = items.filter((item) => inTab(item, tab))
  const active = tabs.find((candidate) => candidate.id === tab) ?? tabs[0]

  useEffect(() => {
    if (!open) return
    tabRefs.current[tab]?.focus()
    const onPointerDown = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false) }
    const onKey = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); triggerRef.current?.focus() } }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onPointerDown); document.removeEventListener('keydown', onKey) }
    // Focus the selected tab only when the popover opens, not on every tab change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function onTabKey(event: KeyboardEvent<HTMLButtonElement>) {
    const index = tabs.findIndex((candidate) => candidate.id === tab)
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (!step) return
    event.preventDefault()
    const next = tabs[(index + step + tabs.length) % tabs.length].id
    setTab(next)
    tabRefs.current[next]?.focus()
  }

  return <div ref={rootRef} className="relative">
    <button
      ref={triggerRef}
      type="button"
      onClick={() => setOpen((current) => !current)}
      aria-expanded={open}
      aria-controls={`${baseId}-inbox`}
      aria-label={items.length ? `Inbox, ${items.length} new` : 'Inbox'}
      className={`relative grid size-11 place-items-center rounded-lg transition-colors hover:bg-surface hover:text-foreground ${open ? 'bg-surface text-foreground' : 'text-muted'}`}
    >
      <AppIcon name="inbox" className="size-5" />
      {items.length ? <span aria-hidden="true" className="absolute right-2.5 top-2.5 size-2 rounded-full bg-button ring-2 ring-raised" /> : null}
    </button>

    <div
      id={`${baseId}-inbox`}
      role="dialog"
      aria-label="Inbox"
      inert={!open}
      className={`absolute right-0 top-full z-50 mt-2 w-[min(24rem,calc(100vw-1.5rem))] origin-top-right rounded-[1.15rem] border border-default bg-raised shadow-lg duration-200 ease-out motion-reduce:transition-none ${open ? 'visible scale-100 opacity-100 transition-[opacity,scale]' : 'pointer-events-none invisible scale-95 opacity-0 transition-[opacity,scale,visibility]'}`}
    >
      <div role="tablist" aria-label="Filter inbox" className="flex gap-1 border-b border-default px-4 pt-2">
        {tabs.map((candidate) => {
          const selected = candidate.id === tab
          const count = items.filter((item) => inTab(item, candidate.id)).length
          return <button
            key={candidate.id}
            ref={(node) => { tabRefs.current[candidate.id] = node }}
            type="button"
            role="tab"
            id={`${baseId}-tab-${candidate.id}`}
            aria-selected={selected}
            aria-controls={`${baseId}-panel`}
            tabIndex={selected ? 0 : -1}
            onClick={() => setTab(candidate.id)}
            onKeyDown={onTabKey}
            className={`-mb-px flex min-h-11 items-center gap-1.5 border-b-2 px-2.5 text-sm transition-colors ${selected ? 'border-foreground font-medium text-foreground' : 'border-transparent text-muted hover:text-foreground'}`}
          >
            {candidate.label}
            {count ? <span className="text-xs text-subtle">{count}</span> : null}
          </button>
        })}
      </div>

      <div role="tabpanel" id={`${baseId}-panel`} aria-labelledby={`${baseId}-tab-${tab}`} className="h-[min(26rem,60svh)] overflow-y-auto overscroll-contain">
        {visible.length ? <ul className="divide-y divide-default px-4">
          {visible.map((item) => <li key={item.id} className="py-3.5">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="min-w-0 break-words text-sm font-medium text-foreground">{item.title}</h3>
              <span className="shrink-0 text-xs text-subtle">{item.when}</span>
            </div>
            <p className="mt-1 line-clamp-2 break-words text-sm leading-5 text-muted">{item.detail}</p>
            <div className="-mx-2.5 mt-1 flex flex-wrap">
              <button type="button" onClick={() => { setOpen(false); createFrom(item) }} className="min-h-11 rounded-lg px-2.5 text-xs font-semibold text-button transition-colors hover:bg-surface">Make a note</button>
              <button type="button" onClick={() => dismiss(item.id)} className="min-h-11 rounded-lg px-2.5 text-xs font-semibold text-muted transition-colors hover:bg-surface hover:text-foreground">Mark done</button>
            </div>
          </li>)}
        </ul> : <div className="flex h-full flex-col items-center justify-center px-6 py-8 text-center">
          <span className="grid size-14 place-items-center rounded-full bg-surface text-muted"><AppIcon name="inbox" className="size-6" /></span>
          <p className="mt-4 text-base font-medium text-foreground">{active.empty[0]}</p>
          <p className="mt-1.5 max-w-[16rem] text-sm leading-5 text-muted">{active.empty[1]}</p>
        </div>}
      </div>
    </div>
  </div>
}
