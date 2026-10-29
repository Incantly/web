'use client'

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AppIcon } from '../AppIcon'
import { Dialog, iconButton } from './ui'

/** Matches the project `lg` breakpoint: from here a right panel docks beside the content box and pushes it. */
export const DOCK_QUERY = '(min-width: 1024px)'
/** Width of every docked right panel. */
export const SIDE_PANEL_WIDTH = 'w-[24rem]'

export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (onChange) => { const list = window.matchMedia(query); list.addEventListener('change', onChange); return () => list.removeEventListener('change', onChange) },
    () => window.matchMedia(query).matches,
    () => false,
  )
}

type Registry = { slot: HTMLElement | null; push: (id: string) => void; remove: (id: string) => void }
const RegistryContext = createContext<Registry | null>(null)
const TopContext = createContext<string | null>(null)

/**
 * Owns the right-hand column. Panels stack: the newest open one shows, and closing it reveals the
 * one beneath. `open` tells the shell to make room (animate the column in and push the content box).
 */
export function useSidePanelHost() {
  const [stack, setStack] = useState<string[]>([])
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  const push = useCallback((id: string) => setStack((current) => (current.includes(id) ? current : [...current, id])), [])
  const remove = useCallback((id: string) => setStack((current) => (current.includes(id) ? current.filter((item) => item !== id) : current)), [])
  const registry = useMemo(() => ({ slot, push, remove }), [slot, push, remove])
  const top = stack.at(-1) ?? null
  return { open: stack.length > 0, setSlot, registry, top }
}

export function SidePanelProvider({ registry, top, children }: { registry: Registry; top: string | null; children: ReactNode }) {
  return <RegistryContext.Provider value={registry}><TopContext.Provider value={top}>{children}</TopContext.Provider></RegistryContext.Provider>
}

type SidePanelProps = { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; footer?: ReactNode
  /** The children draw their own header and fill the panel edge to edge; `title` still names it for assistive tech. */
  bare?: boolean }

/**
 * A right-hand panel. From `lg` up it docks in the shell's right column and pushes the content
 * box narrower (like the sidebar on the left), so the page stays usable beside it. On smaller
 * screens there is no room to push, so it opens as a full-height sheet instead.
 */
export function SidePanel(props: SidePanelProps) {
  const registry = useContext(RegistryContext)
  const top = useContext(TopContext)
  const docked = useMediaQuery(DOCK_QUERY) && registry !== null
  const id = useId()
  const { open } = props
  useEffect(() => {
    if (!docked || !registry) return
    if (open) registry.push(id)
    else registry.remove(id)
  }, [open, docked, registry, id])
  useEffect(() => () => registry?.remove(id), [registry, id])

  if (!docked) return <Dialog variant="drawer" {...props} />
  if (!open || top !== id || !registry?.slot) return null
  return createPortal(<DockedPanel {...props} />, registry.slot)
}

function DockedPanel({ onClose, title, description, children, footer, bare }: SidePanelProps) {
  const titleId = useId()
  const heading = useRef<HTMLHeadingElement>(null)
  // Take focus when it opens and hand it back when it closes, like a dialog, without trapping it.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    heading.current?.focus({ preventScroll: true })
    return () => { if (previous?.isConnected) previous.focus({ preventScroll: true }) }
  }, [])
  return <section aria-labelledby={titleId} onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); onClose() } }}
    className="flex h-full min-h-0 flex-col overflow-hidden rounded-[1.15rem] border border-default bg-raised text-foreground">
    {bare ? <><h2 ref={heading} id={titleId} tabIndex={-1} className="sr-only">{title}</h2>{children}</> : <>
    <header className="flex items-start justify-between gap-3 border-b border-default px-5 pb-4 pt-4">
      <div className="min-w-0">
        <h2 ref={heading} id={titleId} tabIndex={-1} className="break-words font-display text-2xl leading-tight text-foreground outline-none">{title}</h2>
        {description ? <p className="mt-1 text-sm leading-6 text-muted">{description}</p> : null}
      </div>
      <button type="button" onClick={onClose} className={iconButton} aria-label="Close"><AppIcon name="close" className="size-5" /></button>
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">{children}</div>
    {footer ? <footer className="flex flex-wrap justify-end gap-2 border-t border-default px-5 pb-4 pt-4">{footer}</footer> : null}
    </>}
  </section>
}
