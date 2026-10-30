'use client'

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useAssistant } from '@/hooks/use-assistant'
import { isApiError } from '../../../lib/api/errors'
import { displayName } from '../../../lib/identity'
import { AppIcon, type IconName } from '../AppIcon'
import { useCurrentUser } from '../SessionGate'
import { SignOutButton } from '../SignOutButton'
import { iconButton } from './ui'

type Row = { id: string; label: string; description?: string; keywords?: string; control: ReactNode }
type Section = { id: string; label: string; icon: IconName; rows: Row[] }

/** The keyboard shortcuts the workspace actually handles. */
const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ['⌘', 'K'], label: 'Search' },
  { keys: ['⌘', 'J'], label: 'Open or close the chat' },
  { keys: ['⌘', '\\'], label: 'Collapse or expand the sidebar' },
  { keys: ['⌘', 'F'], label: 'Find in note' },
  { keys: ['⌘', ','], label: 'Open settings' },
]

function Keys({ keys }: { keys: string[] }) {
  return <span className="flex shrink-0 items-center gap-1">{keys.map((key) => <kbd key={key} className="grid min-w-7 place-items-center rounded-md border border-default bg-surface px-1.5 py-0.5 font-sans text-xs text-muted">{key}</kbd>)}</span>
}

function Value({ children }: { children: ReactNode }) {
  return <span className="min-w-0 break-words text-sm text-muted">{children}</span>
}

function resetTime(iso: string) {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function useSections(): Section[] {
  const user = useCurrentUser()
  const { allowance } = useAssistant()
  const resets = allowance.data ? resetTime(allowance.data.resetsAt) : null
  const allowanceValue = allowance.isPending ? 'Checking…'
    : allowance.data ? `$${allowance.data.remainingUsd.toFixed(2)} left today`
    : isApiError(allowance.error, 'AI_ALLOWANCE_UNAVAILABLE') ? 'Not available right now' : 'Couldn’t load'

  return [
    {
      id: 'general', label: 'General', icon: 'settings', rows: [
        { id: 'editor', label: 'Note editor', description: 'Notes open in the Incantly document editor.', keywords: 'writing document', control: <Value>Incantly editor</Value> },
        ...SHORTCUTS.map((shortcut) => ({ id: `shortcut-${shortcut.label}`, label: shortcut.label, description: undefined, keywords: 'keyboard shortcut', control: <Keys keys={shortcut.keys} /> })),
      ],
    },
    {
      id: 'account', label: 'Account', icon: 'user', rows: [
        { id: 'name', label: 'Name', keywords: 'profile', control: <Value>{displayName(user)}</Value> },
        { id: 'email', label: 'Email', keywords: 'profile address', control: <Value>{user.email}</Value> },
        { id: 'sign-in', label: 'Sign-in', description: 'Connect Google for faster sign-in, or sign out of this device.', keywords: 'google sign out logout', control: <SignOutButton /> },
      ],
    },
    {
      id: 'usage', label: 'Usage', icon: 'sparkles', rows: [
        { id: 'allowance', label: 'AI allowance', description: allowance.data?.limitedBy === 'global' ? 'Limited by overall service demand today.' : 'An estimate of what the assistant can still spend today.', keywords: 'chat assistant limit quota', control: <Value>{allowanceValue}</Value> },
        { id: 'reset', label: 'Resets', description: 'Your allowance renews every day.', keywords: 'limit', control: <Value>{resets ?? '—'}</Value> },
      ],
    },
  ]
}

function SettingRow({ row }: { row: Row }) {
  return <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-default py-4 last:border-b-0">
    <div className="min-w-0 flex-1 basis-48">
      <p className="text-sm text-foreground">{row.label}</p>
      {row.description ? <p className="mt-0.5 text-sm leading-6 text-muted">{row.description}</p> : null}
    </div>
    <div className="flex min-w-0 max-w-full items-center">{row.control}</div>
  </div>
}

/**
 * Settings as a modal over the workspace: sections on the left (a row of tabs on small screens),
 * label-and-control rows on the right, and a search that filters rows across every section.
 */
export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [active, setActive] = useState('general')
  const [query, setQuery] = useState('')
  const search = useRef<HTMLInputElement>(null)
  const sections = useSections()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    // Opening a modal focuses its first control (Close); start in Search instead.
    if (open && !dialog.open) { dialog.showModal(); search.current?.focus() }
    if (!open && dialog.open) dialog.close()
  }, [open])

  const term = query.trim().toLowerCase()
  const matches = term
    ? sections.map((section) => ({ ...section, rows: section.rows.filter((row) => `${section.label} ${row.label} ${row.description ?? ''} ${row.keywords ?? ''}`.toLowerCase().includes(term)) })).filter((section) => section.rows.length)
    : sections.filter((section) => section.id === active)

  return <dialog ref={ref} aria-labelledby={titleId} onClose={onClose} onCancel={(event) => { event.preventDefault(); onClose() }}
    onClick={(event) => { if (event.target === ref.current) onClose() }}
    className="m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden border-default bg-raised p-0 text-foreground shadow-xl backdrop:bg-foreground/30 open:flex open:flex-col sm:m-auto sm:h-[min(42rem,calc(100dvh-2rem))] sm:w-[min(60rem,calc(100vw-2rem))] sm:rounded-[1.15rem] sm:border">
    {open ? <>
      <header className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-default pl-5 pr-2 pt-[env(safe-area-inset-top)] sm:pt-0">
        <h2 id={titleId} className="font-display text-xl text-foreground">Settings</h2>
        <button type="button" onClick={onClose} className={iconButton} aria-label="Close settings"><AppIcon name="close" className="size-5" /></button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <nav aria-label="Settings sections" className="shrink-0 border-b border-default p-3 md:w-60 md:border-b-0 md:border-r">
          <label className="flex min-h-11 items-center gap-2 rounded-xl border border-default bg-surface px-3 transition-[border-color,box-shadow] focus-within:border-button focus-within:ring-4 focus-within:ring-button/15 motion-reduce:transition-none">
            <AppIcon name="search" className="size-4 shrink-0 text-muted" />
            <input ref={search} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" aria-label="Search settings"
              className="min-h-11 min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-subtle focus-visible:outline-none sm:text-sm" />
          </label>
          <p className="mb-1 mt-5 hidden px-3 text-xs text-muted md:block">Preferences</p>
          <ul className="mt-2 flex gap-1 overflow-x-auto md:mt-0 md:flex-col md:overflow-visible">
            {sections.map((section) => {
              const selected = !term && section.id === active
              return <li key={section.id} className="shrink-0">
                <button type="button" aria-current={selected ? 'page' : undefined} onClick={() => { setActive(section.id); setQuery('') }}
                  className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm transition-colors ${selected ? 'bg-surface font-medium text-foreground' : 'text-muted hover:bg-surface hover:text-foreground'}`}>
                  <AppIcon name={section.icon} className="size-[1.125rem] shrink-0" />{section.label}
                </button>
              </li>
            })}
          </ul>
        </nav>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5 md:px-8">
          {matches.length ? matches.map((section) => <section key={section.id} aria-labelledby={`settings-${section.id}`} className="mb-8 last:mb-0">
            <h3 id={`settings-${section.id}`} className="font-display text-lg text-foreground">{section.label}</h3>
            <div className="mt-2">{section.rows.map((row) => <SettingRow key={row.id} row={row} />)}</div>
          </section>) : <p role="status" className="py-10 text-center text-sm text-muted">No settings match “{query.trim()}”.</p>}
        </div>
      </div>
    </> : null}
  </dialog>
}
