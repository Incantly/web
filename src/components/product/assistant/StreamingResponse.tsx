'use client'

// Adapted from beui.dev/components/agents/streaming-response on the app's tokens. The feedback
// thumbs are left out until the backend has somewhere to record them.

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { AppIcon } from '../AppIcon'
import { CitationList, CitationStack, Disclosure, type CitationItem } from './Citations'

export type StreamingResponseStatus = 'streaming' | 'complete' | 'error'

function ResponseAction({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return <button type="button" aria-label={label} title={label} onClick={onClick}
    className="grid size-11 place-items-center rounded-lg text-muted transition-[color,background-color,scale] hover:bg-surface hover:text-foreground active:scale-90 motion-reduce:transition-none">
    {children}
  </button>
}

export function StreamingResponse({ children, status = 'streaming', copyText, onRetry, sources = [], sourcesOpen, onSourcesOpenChange, sourceIdPrefix, announce = true, className = '' }: {
  children: ReactNode
  status?: StreamingResponseStatus
  /** Plain-text value copied by the copy action. */
  copyText?: string
  onRetry?: () => void
  sources?: CitationItem[]
  sourcesOpen?: boolean
  onSourcesOpenChange?: (open: boolean) => void
  /** Must match the `idPrefix` used by inline `Citation` markers. */
  sourceIdPrefix: string
  /** Set false when a surrounding log already announces the text. */
  announce?: boolean
  className?: string
}) {
  const contentId = useId()
  const [copied, setCopied] = useState(false)
  const [internalOpen, setInternalOpen] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const open = sourcesOpen ?? internalOpen
  const streaming = status === 'streaming'
  const showActions = !streaming && (Boolean(copyText) || Boolean(onRetry) || sources.length > 0)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  async function copy() {
    if (!copyText) return
    await navigator.clipboard?.writeText(copyText).catch(() => {})
    setCopied(true)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setCopied(false), 1600)
  }
  function setOpen(next: boolean) { if (sourcesOpen === undefined) setInternalOpen(next); onSourcesOpenChange?.(next) }

  return <div data-state={status} aria-busy={streaming} className={`w-full ${className}`}>
    <div aria-live={announce ? 'polite' : 'off'} className="break-words text-[0.9375rem] leading-7 text-foreground">{children}</div>
    {showActions ? <div className="mt-2 animate-[citation-in_220ms_ease-out] motion-reduce:animate-none">
      <div className="flex flex-wrap items-center gap-0.5">
        {copyText ? <ResponseAction label={copied ? 'Copied' : 'Copy response'} onClick={() => void copy()}><AppIcon name={copied ? 'check' : 'copy'} className="size-4" /></ResponseAction> : null}
        {onRetry ? <ResponseAction label="Ask again" onClick={onRetry}><AppIcon name="restore" className="size-4" /></ResponseAction> : null}
        {sources.length ? <button type="button" aria-expanded={open} aria-controls={contentId} onClick={() => setOpen(!open)}
          className="ml-1 inline-flex min-h-11 items-center gap-2 rounded-lg px-1.5 text-xs text-muted transition-colors hover:text-foreground">
          <CitationStack citations={sources} />
          <span className="tabular-nums">{sources.length} {sources.length === 1 ? 'source' : 'sources'}</span>
          <AppIcon name="chevron" className={`size-3 transition-transform duration-200 motion-reduce:transition-none ${open ? '-rotate-90' : 'rotate-90'}`} />
        </button> : null}
      </div>
      {sources.length ? <Disclosure id={contentId} open={open}><CitationList citations={sources} idPrefix={sourceIdPrefix} className="mt-2 rounded-xl bg-surface p-1.5" /></Disclosure> : null}
    </div> : null}
  </div>
}
