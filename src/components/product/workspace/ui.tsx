'use client'

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { stageLabel } from './sourceStatus'
import { AppIcon, type IconName } from '../AppIcon'
import type { SourceStatus } from './model'

export const buttonPrimary = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-button px-4 text-sm font-semibold text-inverse transition-colors hover:bg-button-hover disabled:cursor-not-allowed disabled:opacity-60'
export const buttonSecondary = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-default bg-canvas px-4 text-sm font-semibold text-foreground transition-colors hover:border-strong hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60'
export const buttonQuiet = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium text-muted transition-colors hover:bg-surface hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60'
export const buttonDanger = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-danger px-4 text-sm font-semibold text-inverse transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60'
export const iconButton = 'grid size-11 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-foreground'
export const inputClass = 'mt-1.5 min-h-11 w-full rounded-xl border border-default bg-surface px-3.5 text-base text-foreground placeholder:text-subtle focus-visible:border-strong'
export const labelClass = 'block text-sm font-semibold text-foreground'

export function PageFrame({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return <div className={`mx-auto w-full ${wide ? 'max-w-[76rem]' : 'max-w-[64rem]'} px-4 py-6 sm:px-8 lg:px-12 lg:py-10`}>{children}</div>
}

export function PageHeading({ eyebrow, title, subtitle, actions, icon }: { eyebrow?: ReactNode; title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; icon?: ReactNode }) {
  return <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
    <div className="flex min-w-0 items-start gap-4">
      {icon}
      <div className="min-w-0">
        {eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{eyebrow}</p> : null}
        <h1 className="mt-1 break-words font-display text-[clamp(2rem,4.5vw,3.25rem)] font-normal leading-[1.05] tracking-[-0.045em] text-foreground">{title}</h1>
        {subtitle ? <p className="mt-2.5 max-w-[42rem] break-words text-sm leading-6 text-muted">{subtitle}</p> : null}
      </div>
    </div>
    {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
  </header>
}

/** A Space's icon: its emoji when set, otherwise the Space glyph. */
export function SpaceGlyph({ icon, size = 'md' }: { icon: string | null; size?: 'sm' | 'md' | 'lg' }) {
  const box = size === 'lg' ? 'size-14 text-[1.75rem] rounded-2xl' : size === 'md' ? 'size-9 text-lg rounded-lg' : 'size-6 text-sm rounded-md'
  return <span aria-hidden="true" className={`grid shrink-0 place-items-center bg-surface text-muted ${box}`}>
    {icon ? <span className="leading-none">{icon}</span> : <AppIcon name="space" className={size === 'lg' ? 'size-6' : 'size-4'} />}
  </span>
}

export function EmptyState({ icon, title, body, action }: { icon: IconName; title: string; body?: string; action?: ReactNode }) {
  return <div className="flex flex-col items-center rounded-[1.15rem] border border-dashed border-default px-6 py-12 text-center">
    <span className="grid size-12 place-items-center rounded-full bg-surface text-muted"><AppIcon name={icon} className="size-5" /></span>
    <p className="mt-4 text-base font-medium text-foreground">{title}</p>
    {body ? <p className="mt-1.5 max-w-[22rem] text-sm leading-6 text-muted">{body}</p> : null}
    {action ? <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div> : null}
  </div>
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div role="alert" className="flex flex-col items-center rounded-[1.15rem] border border-danger bg-danger-surface px-6 py-10 text-center text-danger">
    <AppIcon name="alert" className="size-6" />
    <p className="mt-3 max-w-[24rem] text-sm leading-6">{message}</p>
    {onRetry ? <button type="button" onClick={onRetry} className={`${buttonSecondary} mt-4`}>Try again</button> : null}
  </div>
}

export function ListSkeleton({ rows = 4, label = 'Loading' }: { rows?: number; label?: string }) {
  return <div role="status" aria-label={label} className="divide-y divide-default border-y border-default">
    {Array.from({ length: rows }, (_, index) => <div key={index} className="flex items-center gap-4 py-4">
      <span className="size-9 shrink-0 animate-pulse rounded-lg bg-surface motion-reduce:animate-none" />
      <span className="flex-1 space-y-2"><span className="block h-3.5 w-2/5 animate-pulse rounded bg-surface motion-reduce:animate-none" /><span className="block h-3 w-3/5 animate-pulse rounded bg-surface motion-reduce:animate-none" /></span>
    </div>)}
  </div>
}

export function OfflineBanner() {
  return <div role="status" className="flex items-center gap-2 border-b border-default bg-surface px-4 py-2 text-xs text-muted sm:px-5">
    <AppIcon name="alert" className="size-4 shrink-0" />You’re offline. Changes will sync when you reconnect.
  </div>
}

const statusStyles: Record<SourceStatus, { label: string; className: string; icon: IconName }> = {
  PENDING: { label: 'Waiting', className: 'bg-surface text-muted', icon: 'clock' },
  PROCESSING: { label: 'Processing', className: 'bg-surface text-muted', icon: 'clock' },
  READY: { label: 'Ready', className: 'bg-feature-research text-accent', icon: 'checkCircle' },
  PARTIALLY_READY: { label: 'Partly ready', className: 'bg-feature-research text-accent', icon: 'checkCircle' },
  FAILED: { label: 'Failed', className: 'bg-danger-surface text-danger', icon: 'alert' },
  QUARANTINED: { label: 'Blocked', className: 'bg-danger-surface text-danger', icon: 'alert' },
  ARCHIVED: { label: 'Archived', className: 'bg-surface text-subtle', icon: 'archive' },
  DELETED: { label: 'Deleted', className: 'bg-surface text-subtle', icon: 'trash' },
}

/** Source status; while processing it names the stage, and images parked without a processor read "Not searchable". */
export function StatusChip({ status, stage }: { status: SourceStatus; stage?: string | null }) {
  const style = statusStyles[status] ?? statusStyles.PENDING
  const label = stage === 'AWAITING_PROCESSOR' ? 'Not searchable' : status === 'PROCESSING' ? stageLabel(stage) ?? style.label : style.label
  return <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${stage === 'AWAITING_PROCESSOR' ? 'bg-surface text-muted' : style.className}`}><AppIcon name={stage === 'AWAITING_PROCESSOR' ? 'checkCircle' : style.icon} className="size-3.5" />{label}</span>
}

/**
 * Accessible modal built on the native `<dialog>`: focus trap, Escape and background inertness
 * come from the browser. `variant="drawer"` docks it to the right edge as a full-height panel.
 */
export function Dialog({ open, onClose, title, description, children, footer, variant = 'modal' }: { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; footer?: ReactNode; variant?: 'modal' | 'drawer' }) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  const shape = variant === 'drawer'
    ? 'ml-auto mr-0 h-dvh max-h-none max-w-none w-[min(30rem,100vw)] rounded-none sm:rounded-l-[1.15rem]'
    : 'm-auto max-h-[min(44rem,calc(100dvh-2rem))] w-[min(34rem,calc(100vw-2rem))] rounded-[1.15rem]'

  return <dialog ref={ref} aria-labelledby={titleId} onClose={onClose} onCancel={(event) => { event.preventDefault(); onClose() }}
    onClick={(event) => { if (event.target === ref.current) onClose() }}
    className={`${shape} border border-default bg-raised p-0 text-foreground shadow-xl backdrop:bg-foreground/30 open:flex open:flex-col`}>
    <header className="flex items-start justify-between gap-3 border-b border-default px-5 pb-4 pt-[max(1.1rem,env(safe-area-inset-top))]">
      <div className="min-w-0">
        <h2 id={titleId} className="break-words font-display text-2xl leading-tight text-foreground">{title}</h2>
        {description ? <p className="mt-1 text-sm leading-6 text-muted">{description}</p> : null}
      </div>
      <button type="button" onClick={onClose} className={iconButton} aria-label="Close"><AppIcon name="close" className="size-5" /></button>
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">{children}</div>
    {footer ? <footer className="flex flex-wrap justify-end gap-2 border-t border-default px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">{footer}</footer> : null}
  </dialog>
}

export function ConfirmDialog({ open, onClose, onConfirm, title, body, confirmLabel, destructive = false }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; body: string; confirmLabel: string; destructive?: boolean }) {
  return <Dialog open={open} onClose={onClose} title={title}
    footer={<><button type="button" onClick={onClose} className={buttonSecondary}>Cancel</button><button type="button" onClick={() => { onConfirm(); onClose() }} className={destructive ? buttonDanger : buttonPrimary}>{confirmLabel}</button></>}>
    <p className="text-sm leading-6 text-muted">{body}</p>
  </Dialog>
}

/** Underline tabs with arrow-key navigation. The caller renders the active panel. */
export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (id: T) => void; label: string }) {
  const refs = useRef<Partial<Record<T, HTMLButtonElement | null>>>({})
  function onKey(event: KeyboardEvent<HTMLButtonElement>) {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (!step) return
    event.preventDefault()
    const index = tabs.findIndex((tab) => tab.id === value)
    const next = tabs[(index + step + tabs.length) % tabs.length].id
    onChange(next)
    refs.current[next]?.focus()
  }
  return <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto border-b border-default">
    {tabs.map((tab) => {
      const selected = tab.id === value
      return <button key={tab.id} ref={(node) => { refs.current[tab.id] = node }} type="button" role="tab" aria-selected={selected} tabIndex={selected ? 0 : -1} onClick={() => onChange(tab.id)} onKeyDown={onKey}
        className={`-mb-px flex min-h-11 shrink-0 items-center gap-1.5 border-b-2 px-3 text-sm transition-colors ${selected ? 'border-foreground font-medium text-foreground' : 'border-transparent text-muted hover:text-foreground'}`}>
        {tab.label}{tab.count !== undefined ? <span className="text-xs text-subtle">{tab.count}</span> : null}
      </button>
    })}
  </div>
}

/** A simple dropdown menu of actions anchored to a trigger. */
export function ActionMenu({ label, items, align = 'right' }: { label: string; items: { label: string; icon?: IconName; onSelect: () => void; destructive?: boolean; disabled?: boolean; hint?: string }[]; align?: 'left' | 'right' }) {
  const ref = useRef<HTMLDetailsElement>(null)
  // Prefer the requested side, then nudge the open menu so it stays 8px inside the screen.
  const [shift, setShift] = useState(0)
  function onToggle() {
    if (!ref.current?.open) { setShift(0); return }
    // `toggle` fires after the open menu is laid out, so it can be measured directly.
    const menu = ref.current.querySelector('ul')?.getBoundingClientRect()
    if (!menu) return
    const overRight = menu.right - (window.innerWidth - 8)
    const overLeft = 8 - menu.left
    setShift(overRight > 0 ? -overRight : overLeft > 0 ? overLeft : 0)
  }
  useEffect(() => {
    const onPointer = (event: PointerEvent) => { if (ref.current?.open && !ref.current.contains(event.target as Node)) ref.current.open = false }
    const onKey = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape' && ref.current?.open) { ref.current.open = false; ref.current.querySelector('summary')?.focus() } }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onPointer); document.removeEventListener('keydown', onKey) }
  }, [])
  return <details ref={ref} onToggle={onToggle} className="group relative">
    <summary aria-label={label} className={`${iconButton} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}><AppIcon name="more" className="size-5" /></summary>
    <ul style={shift ? { translate: `${shift}px 0` } : undefined} className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} top-full z-30 mt-1 w-56 max-w-[calc(100vw-1rem)] rounded-xl border border-default bg-raised p-1 shadow-lg`}>
      {items.map((item) => <li key={item.label}>
        <button type="button" disabled={item.disabled} onClick={() => { if (ref.current) ref.current.open = false; item.onSelect() }}
          className={`flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50 ${item.destructive ? 'text-danger' : 'text-foreground'}`}>
          {item.icon ? <AppIcon name={item.icon} className="size-4 shrink-0" /> : null}
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          {item.hint ? <span className="shrink-0 text-xs text-subtle">{item.hint}</span> : null}
        </button>
      </li>)}
    </ul>
  </details>
}
