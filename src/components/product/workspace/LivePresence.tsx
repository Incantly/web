'use client'

import { LIVE_CONNECTION_COPY } from './liveCollabModel'
import { AppIcon } from '../AppIcon'
import { useLiveCollab } from '@/hooks/use-live-collab'

const MAX_AVATARS = 3

/**
 * The note header's live presence: a Live/connecting pill plus the collaborator
 * avatar stack. Hidden on unshared notes and whenever the room is unavailable.
 * Names are untrusted text (rendered as text, never HTML); avatars are initials.
 */
export function LivePresence() {
  const { noteId, connection, collaborators } = useLiveCollab()
  if (!noteId || connection === 'unavailable') return null
  // One avatar per user: the same account can hold several room connections
  // (two tabs, a reconnect overlap), which would otherwise duplicate React keys.
  const seen = new Set<string>()
  const unique = collaborators.filter((person) => (seen.has(person.id) ? false : (seen.add(person.id), true)))
  const shown = unique.slice(0, MAX_AVATARS)
  const extra = unique.length - shown.length
  const names = unique.map((person) => person.name).join(', ')
  return <span role="status" aria-label={collaborators.length ? `${LIVE_CONNECTION_COPY[connection]}. Also here: ${names}` : LIVE_CONNECTION_COPY[connection]}
    className="flex min-h-11 shrink-0 items-center gap-1.5 px-1.5">
    <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${connection === 'live' ? 'bg-added motion-safe:animate-pulse motion-reduce:animate-none' : 'bg-disabled'}`} />
    <span className="hidden text-xs font-semibold text-muted sm:inline">{LIVE_CONNECTION_COPY[connection]}</span>
    {shown.length ? <span role="group" aria-hidden="true" className="flex items-center">
      {shown.map((person, index) => <span key={person.id} title={person.name}
        className={`grid size-7 place-items-center rounded-full bg-surface text-[11px] font-semibold text-muted ring-2 ring-canvas ${index > 0 ? '-ml-1.5' : ''}`}>
        {person.initials}
      </span>)}
      {extra > 0 ? <span className="-ml-1.5 grid size-7 place-items-center rounded-full bg-surface text-[11px] font-semibold text-muted ring-2 ring-canvas">+{extra}</span> : null}
    </span> : null}
  </span>
}

/**
 * The one live-collaboration notice at most per note: a pause, a full room, or
 * a restore. Inline and dismissible, with a retry that re-runs the join.
 */
export function LiveCollabNotice() {
  const { noteId, connection, notice, dismissNotice, retry } = useLiveCollab()
  if (!noteId || !notice) return null
  return <p role="status" className="mx-auto mt-2 flex w-fit max-w-full flex-wrap items-center justify-center gap-x-1 gap-y-0.5 rounded-2xl bg-surface py-1 pl-3 pr-1 text-xs text-muted">
    <span className="min-w-0 break-words">{notice}</span>
    {connection === 'unavailable' ? <button type="button" onClick={retry} className="min-h-11 shrink-0 rounded-lg px-2 font-semibold text-foreground hover:bg-raised">Try again</button> : null}
    <button type="button" onClick={dismissNotice} aria-label="Dismiss" className="grid size-11 shrink-0 place-items-center rounded-lg hover:bg-raised hover:text-foreground"><AppIcon name="close" className="size-3.5" /></button>
  </p>
}
