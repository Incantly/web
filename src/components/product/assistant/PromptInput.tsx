'use client'

// Adapted from beui.dev/components/agents/prompt-input on the app's tokens: auto-growing textarea,
// Enter to send (Shift+Enter for a new line, ignored mid-IME), a "+" menu of actions, and a send
// button that becomes stop while a request runs. The model picker is replaced by `leadingAction`
// (the scope pill), since the server picks the model.

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { AppIcon, type IconName } from '../AppIcon'

export type PromptAction = { value: string; label: ReactNode; description?: ReactNode; icon?: IconName; disabled?: boolean }

/** Removes the @ at `trigger` when it is still there: it opened the menu, so it is never question text. */
function takeTrigger(text: string, trigger: number) {
  return text[trigger] === '@' ? text.slice(0, trigger) + text.slice(trigger + 1) : text
}

const COPIED_STYLE = ['font-family', 'font-size', 'font-weight', 'font-style', 'letter-spacing', 'line-height', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width', 'box-sizing', 'word-break', 'overflow-wrap', 'tab-size']

/**
 * Where the character at `upto` sits inside the field, via a hidden mirror with the same text
 * metrics. Anchors the @-menu at the trigger; a few pixels off is fine.
 */
function caretOffset(field: HTMLTextAreaElement, upto: number) {
  const mirror = document.createElement('div')
  const style = window.getComputedStyle(field)
  for (const property of COPIED_STYLE) mirror.style.setProperty(property, style.getPropertyValue(property))
  mirror.style.setProperty('position', 'absolute')
  mirror.style.setProperty('visibility', 'hidden')
  mirror.style.setProperty('top', '0')
  mirror.style.setProperty('left', '0')
  mirror.style.setProperty('white-space', 'pre-wrap')
  mirror.style.setProperty('width', `${field.clientWidth}px`)
  mirror.textContent = field.value.slice(0, upto)
  const marker = document.createElement('span')
  marker.textContent = '\u200b'
  mirror.appendChild(marker)
  field.parentElement?.appendChild(mirror)
  const left = marker.offsetLeft
  const top = marker.offsetTop - field.scrollTop
  mirror.remove()
  return { left, top }
}

type PromptInputProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'defaultValue' | 'onChange' | 'onSubmit' | 'children'> & {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  actions?: PromptAction[]
  onAction?: (action: string) => void
  /** @-menu options: typing @ offers them at the caret, and a pick reports its value. */
  mentions?: PromptAction[]
  onMention?: (value: string) => void
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

export function PromptInput({ value, defaultValue = '', onValueChange, actions = [], onAction, mentions = [], onMention, onSubmit, loading = false, onStop, minRows = 1, maxRows = 8, leadingAction, header, hint, canSubmit: allowed = true, className = '', disabled, placeholder = 'Ask about your notes…', 'aria-label': ariaLabel = 'Message', onKeyDown, ...textareaProps }: PromptInputProps) {
  const textarea = useRef<HTMLTextAreaElement>(null)
  const measure = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const mentionId = useId()
  const hintId = useId()
  const [internal, setInternal] = useState(defaultValue)
  const [menuOpen, setMenuOpen] = useState(false)
  /** The open @-menu: the trigger's index in the text, the highlighted option, and its anchor. */
  const [mention, setMention] = useState<{ trigger: number; index: number; left: number; bottom: number | '100%' } | null>(null)
  const pendingCaret = useRef<number | null>(null)
  const current = value ?? internal
  const canSubmit = Boolean(current.trim()) && allowed && !disabled && !loading

  // The caret to restore after the @-menu rewrites the text (it always consumes its trigger @).
  // Every strip verifies the @ is still at the trigger, so a stale menu can never eat typed text.
  useLayoutEffect(() => {
    if (pendingCaret.current === null) return
    const at = pendingCaret.current
    pendingCaret.current = null
    textarea.current?.setSelectionRange(at, at)
  }, [current])

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
    setMention(null)
    const prompt = current.trim()
    if (!prompt || !canSubmit) return
    onSubmit?.(prompt)
    if (value === undefined) setInternal('')
    textarea.current?.focus({ preventScroll: true })
  }

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
    const next = event.target.value
    // A change event's native event is typed as Event (only keyboard events promise isComposing).
    if ('isComposing' in event.nativeEvent && event.nativeEvent.isComposing === true) {
      if (mention) { setMention(null); setValue(takeTrigger(next, mention.trigger)) }
      else setValue(next)
      return
    }
    const caret = event.target.selectionStart ?? next.length
    if (mention) {
      // Any edit while the menu is open dismisses it — and the trigger @ with it, so it never submits.
      const trigger = mention.trigger
      setMention(null)
      pendingCaret.current = next[trigger] === '@' && caret > trigger ? caret - 1 : caret
      setValue(takeTrigger(next, trigger))
      return
    }
    setValue(next)
    // @ at the start or after whitespace opens the menu; a mid-word @ (an email address) stays text.
    const at = caret - 1
    if (!mentions.length || at < 0 || next[at] !== '@' || (at > 0 && !/\s/.test(next[at - 1]))) return
    const field = textarea.current
    const wrap = wrapRef.current
    let left = 4
    let bottom: number | '100%' = '100%'
    if (field && wrap) {
      const caretPos = caretOffset(field, at)
      left = Math.min(Math.max(caretPos.left - 2, 4), Math.max(4, wrap.clientWidth - 260))
      bottom = wrap.clientHeight - caretPos.top + 6
    }
    setMention({ trigger: at, index: 0, left, bottom })
  }

  function pickMention(index: number) {
    const action = mentions[index]
    const trigger = mention?.trigger ?? -1
    if (!action || trigger < 0) return
    setMention(null)
    pendingCaret.current = trigger
    setValue(takeTrigger(current, trigger))
    onMention?.(action.value)
    textarea.current?.focus({ preventScroll: true })
  }

  function handleBlur() {
    if (!mention) return
    setMention(null)
    setValue(takeTrigger(current, mention.trigger))
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    onKeyDown?.(event)
    if (mention && !event.defaultPrevented) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const step = event.key === 'ArrowDown' ? 1 : -1
        setMention({ ...mention, index: (mention.index + step + mentions.length) % mentions.length })
        return
      }
      if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
        event.preventDefault()
        pickMention(mention.index)
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        setMention(null)
        pendingCaret.current = mention.trigger
        setValue(takeTrigger(current, mention.trigger))
        return
      }
    }
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
    <div ref={wrapRef} className="relative">
      {/* Mirror of the text used to measure the wrapped height. */}
      <div ref={measure} aria-hidden="true" className="pointer-events-none invisible absolute inset-x-0 top-0 whitespace-pre-wrap break-words px-2 py-1.5 text-base leading-6 sm:text-[0.9375rem]">{`${current}​`}</div>
      <textarea ref={textarea} value={current} disabled={disabled} placeholder={placeholder} aria-label={ariaLabel} aria-describedby={hint ? hintId : undefined} role={mention ? 'combobox' : undefined} aria-expanded={mention ? true : undefined} aria-controls={mention ? mentionId : undefined} aria-activedescendant={mention ? `${mentionId}-${mention.index}` : undefined} rows={minRows} {...textareaProps}
        onChange={handleChange} onKeyDown={handleKeyDown} onBlur={handleBlur}
        // The form draws the focus ring, so the field drops its own outline.
        className="block w-full resize-none overflow-y-auto bg-transparent px-2 py-1.5 text-base leading-6 text-foreground outline-none placeholder:text-subtle focus-visible:outline-none sm:text-[0.9375rem]" />
      {mention && mentions.length ? <div id={mentionId} role="listbox" aria-label="Search scope" style={{ left: mention.left, bottom: mention.bottom }}
        className={`absolute z-30 w-64 max-w-[calc(100%-0.5rem)] origin-bottom-left animate-[menu-in_160ms_ease-out] rounded-xl border border-default bg-raised p-1.5 shadow-lg motion-reduce:animate-none ${mention.bottom === '100%' ? 'mb-2' : ''}`}>
        {mentions.map((item, index) => <button key={item.value} type="button" role="option" tabIndex={-1} id={`${mentionId}-${index}`} aria-selected={index === mention.index}
          onMouseDown={(event) => { event.preventDefault(); pickMention(index) }}
          onMouseMove={() => { if (mention.index !== index) setMention({ ...mention, index }) }}
          className={`flex min-h-11 w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left outline-none transition-colors hover:bg-surface ${index === mention.index ? 'bg-surface' : ''}`}>
          {item.icon ? <AppIcon name={item.icon} className="mt-0.5 size-4 shrink-0 text-muted" /> : null}
          <span className="min-w-0"><span className="block text-sm text-foreground">{item.label}</span>{item.description ? <span className="mt-0.5 block text-xs leading-4 text-muted">{item.description}</span> : null}</span>
        </button>)}
      </div> : null}
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
