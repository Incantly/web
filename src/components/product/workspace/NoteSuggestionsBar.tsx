'use client'

import type { useNoteSuggestions } from '@/hooks/use-note-suggestions'
import { AppIcon } from '../AppIcon'
import { suggestionCountLabel } from './suggestionModel'

type Review = ReturnType<typeof useNoteSuggestions>

const small = 'inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors disabled:cursor-progress disabled:opacity-50'

/**
 * Floats at the bottom of the note while the assistant's suggestions are open, or right after a
 * decision: steps through the changes, accepts or rejects them all, and undoes the last accept.
 * Undo fades after 4 seconds (paused while the pointer or focus is on the bar).
 * Each change also has its own Accept and Reject in the note.
 */
export function NoteSuggestionsBar({ review }: { review: Review }) {
  const { count, notice, canUndo } = review
  if (!count && !notice && !canUndo) return null
  return <div className="pointer-events-none sticky bottom-0 z-20 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
    <div role="region" aria-label="Suggested changes"
      onPointerEnter={() => review.hold(true)} onPointerLeave={() => review.hold(false)}
      onFocus={() => review.hold(true)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) review.hold(false) }}
      className="pointer-events-auto flex w-full max-w-[46rem] flex-col gap-1 rounded-2xl border border-default bg-raised p-1.5 shadow-lg">
      {notice ? <p role="status" className={`flex items-start gap-2 px-2.5 pt-1.5 text-sm leading-6 ${notice.tone === 'warning' ? 'text-danger' : 'text-muted'}`}>
        <AppIcon name={notice.tone === 'warning' ? 'alert' : 'checkCircle'} className="mt-1 size-4 shrink-0" />
        <span className="min-w-0 flex-1">{notice.text}</span>
        <button type="button" onClick={review.dismissNotice} aria-label="Dismiss" className="-my-2.5 -mr-1 grid size-11 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface hover:text-foreground"><AppIcon name="close" className="size-4" /></button>
      </p> : null}
      <div className="flex min-w-0 flex-wrap items-center gap-1">
        {count ? <>
          <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-feature-research text-accent"><AppIcon name="sparkles" className="size-4" /></span>
          <p className="min-w-0 flex-1 px-1.5">
            <span className="block truncate text-sm font-medium text-foreground">{suggestionCountLabel(count)}{review.position ? <span className="font-normal text-muted"> · {review.position} of {count}</span> : null}</span>
            {review.summary || review.fromWeb ? <span className="block truncate text-xs text-muted">{review.fromWeb ? 'Includes web content · ' : ''}{review.summary}</span> : null}
          </p>
          <span className="flex shrink-0 items-center">
            <button type="button" onClick={review.previous} aria-label="Previous suggestion" className="grid size-11 place-items-center rounded-lg text-muted hover:bg-surface hover:text-foreground"><AppIcon name="chevron" className="size-4 rotate-180" /></button>
            <button type="button" onClick={review.next} aria-label="Next suggestion" className="grid size-11 place-items-center rounded-lg text-muted hover:bg-surface hover:text-foreground"><AppIcon name="chevron" className="size-4" /></button>
          </span>
        </> : <span className="min-w-0 flex-1" />}
        <span className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-1">
          {canUndo ? <button type="button" disabled={review.busy} onClick={review.undo} title="Undo (⌘Z)" className={`${small} text-foreground hover:bg-surface`}><AppIcon name="restore" className="size-4" />Undo</button> : null}
          {count ? <>
            <button type="button" disabled={review.busy} onClick={review.rejectAll} className={`${small} border border-default text-foreground hover:border-strong hover:bg-surface`}>Reject all</button>
            <button type="button" disabled={review.busy} onClick={review.acceptAll} className={`${small} bg-button text-inverse hover:bg-button-hover`}>{review.busy ? 'Applying…' : 'Accept all'}</button>
          </> : null}
        </span>
      </div>
    </div>
  </div>
}
