'use client'

import { useNotifications } from '@/hooks/use-notifications'

/** A settings-style email toggle: checked means email flows, unchecked means muted. */
function EmailToggle({ checked, saving, label, onChange }: { checked: boolean; saving: boolean; label: string; onChange: (enabled: boolean) => void }) {
  return <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-muted">
    <input type="checkbox" checked={checked} disabled={saving} onChange={(event) => onChange(event.target.checked)} className="size-5 accent-button" />
    {label}
  </label>
}

/** The master switch for all collaboration email. The in-app inbox is unaffected. */
export function CollaborationEmailToggle() {
  const { emailEnabledAll, savingAll, setEmailEnabledAll } = useNotifications()
  if (emailEnabledAll === null) return <span className="text-sm text-muted">—</span>
  return <EmailToggle checked={emailEnabledAll} saving={savingAll} onChange={setEmailEnabledAll} label={emailEnabledAll ? 'On' : 'Off'} />
}

/** Email for one note. Only offered on notes the user can open (mute needs read access). */
export function NoteEmailToggle({ noteId }: { noteId: string }) {
  const { preferences, muting, noteMuted, toggleNoteMute } = useNotifications()
  if (!preferences) return <span className="text-sm text-muted">—</span>
  const muted = noteMuted(noteId)
  return <EmailToggle checked={!muted} saving={muting} onChange={() => toggleNoteMute(noteId)} label={muted ? 'Muted' : 'On'} />
}

/** Email for one comment thread. A thread without its note cannot be toggled here. */
export function ThreadEmailToggle({ noteId, threadId }: { noteId: string | null; threadId: string }) {
  const { preferences, muting, threadMuted, toggleThreadMute } = useNotifications()
  if (!preferences || !noteId) return <span className="text-sm text-muted">—</span>
  const muted = threadMuted(threadId)
  return <EmailToggle checked={!muted} saving={muting} onChange={() => toggleThreadMute(noteId, threadId)} label={muted ? 'Muted' : 'On'} />
}
