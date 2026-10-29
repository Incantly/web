'use client'

// Adapted from beui.dev/components/agents/prompt-input on the app's tokens: auto-growing textarea,
// Enter to send (Shift+Enter for a new line, ignored mid-IME), a "+" menu of actions, and a send
// button that becomes stop while a request runs. The model picker is replaced by `leadingAction`
// (the scope pill), since the server picks the model.

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { AppIcon, type IconName } from '../AppIcon'

export type PromptAction = { value: string; label: ReactNode; description?: ReactNode; icon?: IconName; disabled?: boolean }

type PromptInputProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'defaultValue' | 'onChange' | 'onSubmit' | 'children'> & {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  actions?: PromptAction[]
  onAction?: (action: string) => void
  onSubmit?: (value: string) => void
  /** Send becomes stop. */
  loading?: boolean
  onStop?: () => void
  minRows?: number
  maxRows?: number
  leadingAction?: ReactNode
  /** Shown above the text, e.g. the active mode chip. */
  header?: ReactNode
  /** Why sending is blocked, announced and shown under the field. */
  hint?: ReactNode
  canSubmit?: boolean
  className?: string
}

const LINE = 24

export function PromptInput({ value, defaultValue = '', onValueChange, actions = [], onAction, onSubmit, loading = false, onStop, minRows = 1, maxRows = 8, leadingAction, header, hint, canSubmit: allowed = true, className = '', disabled, placeholder = 'Ask about your notes…', 'aria-label': ariaLabel = 'Message', onKeyDown, ...textareaProps }: PromptInputProps) {
  const textarea = useRef<HTMLTextAreaElement>(null)
  const measure = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const hintId = useId()
  const [internal, setInternal] = useState(defaultValue)
  const [menuOpen, setMenuOpen] = useState(false)
  const current = value ?? internal
  const canSubmit = Boolean(current.trim()) && allowed && !disabled && !loading

  const resize = useCallback(() => {
    const field = textarea.current
    const box = measure.current
    if (!field || !box) return
    const height = `${Math.min(Math.max(box.scrollHeight, minRows * LINE), maxRows * LINE)}px`
    if (field.style.height !== height) field.style.height = height
  }, [minRows, maxRows])
  useLayoutEffect(resize, [resize, current])
  useEffect(() => {
    const field = textarea.current
    if (!field || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(resize)
    observer.observe(field)
    return () => observer.disconnect()
  }, [resize])

  useEffect(() => {
    if (!menuOpen) return
    const onPointer = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false) }
    const onKey = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); setMenuOpen(false); menuRef.current?.querySelector<HTMLButtonElement>('[aria-haspopup]')?.focus() } }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey, true)
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus()
    return () => { document.removeEventListener('pointerdown', onPointer); document.removeEventListener('keydown', onKey, true) }
  }, [menuOpen])

  function setValue(next: string) { if (value === undefined) setInternal(next); onValueChange?.(next) }

  function submit(event?: FormEvent) {
    event?.preventDefault()
    const prompt = current.trim()
    if (!prompt || !canSubmit) return
    onSubmit?.(prompt)
    if (value === undefined) setInternal('')
    textarea.current?.focus({ preventScroll: true })
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    onKeyDown?.(event)
    if (event.defaultPrevented || event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    submit()
  }

  function onMenuKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const items = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [])]
    const index = items.indexOf(document.activeElement as HTMLButtonElement)
    items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus()
  }

  return <form onSubmit={submit} className={`relative w-full rounded-2xl border border-default bg-raised p-2 shadow-sm transition-[border-color,box-shadow] focus-within:border-strong focus-within:ring-4 focus-within:ring-button/10 motion-reduce:transition-none ${disabled ? 'opacity-60' : ''} ${className}`}>
    {header}
    <div className="relative">
      {/* Mirror of the text used to measure the wrapped height. */}
      <div ref={measure} aria-hidden="true" className="pointer-events-none invisible absolute inset-x-0 top-0 whitespace-pre-wrap break-words px-2 py-1.5 text-base leading-6 sm:text-[0.9375rem]">{`${current}​`}</div>
      <textarea ref={textarea} value={current} disabled={disabled} placeholder={placeholder} aria-label={ariaLabel} aria-describedby={hint ? hintId : undefined} rows={minRows} {...textareaProps}
        onChange={(event) => setValue(event.target.value)} onKeyDown={handleKeyDown}
        // The form draws the focus ring, so the field drops its own outline.
        className="block w-full resize-none overflow-y-auto bg-transparent px-2 py-1.5 text-base leading-6 text-foreground outline-none placeholder:text-subtle focus-visible:outline-none sm:text-[0.9375rem]" />
    </div>
    {hint ? <p id={hintId} className="px-2 pb-1 text-xs text-muted">{hint}</p> : null}
    <div className="mt-1 flex min-w-0 items-center gap-1">
      {actions.length ? <div ref={menuRef} className="relative shrink-0">
        <button type="button" aria-haspopup="menu" aria-expanded={menuOpen} aria-controls={menuId} aria-label="More options" disabled={disabled || loading} onClick={() => setMenuOpen((open) => !open)}
          className="grid size-11 place-items-center rounded-xl text-muted transition-colors hover:bg-surface hover:text-foreground disabled:opacity-50">
          <AppIcon name="plus" className={`size-5 transition-transform duration-200 motion-reduce:transition-none ${menuOpen ? 'rotate-45' : ''}`} />
        </button>
        {menuOpen ? <div id={menuId} role="menu" aria-label="Options" onKeyDown={onMenuKey}
          className="absolute bottom-full left-0 z-30 mb-2 w-64 max-w-[calc(100vw-3rem)] origin-bottom-left animate-[menu-in_160ms_ease-out] rounded-xl border border-default bg-raised p-1.5 shadow-lg motion-reduce:animate-none">
          {actions.map((action) => <button key={action.value} type="button" role="menuitem" disabled={action.disabled} onClick={() => { onAction?.(action.value); setMenuOpen(false); textarea.current?.focus() }}
            className="flex min-h-11 w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left outline-none transition-colors hover:bg-surface focus-visible:bg-surface disabled:pointer-events-none disabled:opacity-50">
            {action.icon ? <AppIcon name={action.icon} className="mt-0.5 size-4 shrink-0 text-muted" /> : null}
            <span className="min-w-0"><span className="block text-sm text-foreground">{action.label}</span>{action.description ? <span className="mt-0.5 block text-xs leading-4 text-muted">{action.description}</span> : null}</span>
          </button>)}
        </div> : null}
      </div> : null}
      <div className="flex min-w-0 flex-1 items-center gap-1">{leadingAction}</div>
      <button type={loading ? 'button' : 'submit'} disabled={loading ? !onStop : !canSubmit} aria-label={loading ? 'Stop' : 'Send'} onClick={loading ? onStop : undefined}
        className="grid size-11 shrink-0 place-items-center rounded-xl bg-button text-inverse transition-[background-color,opacity,scale] hover:bg-button-hover active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none">
        <span key={loading ? 'stop' : 'send'} className="grid animate-[icon-swap_180ms_ease-out] place-items-center motion-reduce:animate-none">
          <AppIcon name={loading ? 'stop' : 'arrowUp'} className="size-5" strokeWidth={2} />
        </span>
      </button>
    </div>
  </form>
}
