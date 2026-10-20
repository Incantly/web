'use client'

import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { AppIcon } from '../AppIcon'
import { apiErrorMessage } from '../../../lib/api/errors'
import { uploadErrorMessage } from '../../../lib/assets/upload'
import type { NoteRecord, SpaceRecord, SourceKind } from './model'
import { sensitivities, sourceKinds } from './model'
import { type AddSourceFields, type AddSourceInput, toInput, validateSource } from './sourceInput'
import type { AddProgress } from './useLibrary'
import { Dialog, SpaceGlyph, Tabs, buttonPrimary, buttonSecondary, inputClass, labelClass } from './ui'

const spaceIcons = ['📚', '🧪', '🧠', '💡', '🎓', '🌍', '📐', '🎨', '✍️', '🔬', '🧭', '🎵']

export type SpaceDraft = { name: string; description: string; icon: string }

function friendly(error: unknown) {
  if (error instanceof Error && error.message === 'NOTE_HAS_NO_REVISION') return 'That note has no saved version yet. Write something in it first.'
  return uploadErrorMessage(error) ?? apiErrorMessage(error)
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? <p id={id} className="mt-1.5 text-sm text-danger">{message}</p> : null
}

/** Create or edit a Space. `onSubmit` saves to the server; the dialog stays open with the error if it fails. */
export function SpaceFormDialog({ open, onClose, initial, onSubmit }: { open: boolean; onClose: () => void; initial?: SpaceRecord; onSubmit: (draft: SpaceDraft) => Promise<void> }) {
  return <Dialog open={open} onClose={onClose} title={initial ? 'Edit Space' : 'New Space'} description={initial ? undefined : 'A Space holds the notes and Library sources for one course, topic or project.'}>
    {open ? <SpaceForm key={initial?.id ?? 'new'} initial={initial} onCancel={onClose} onSubmit={async (draft) => { await onSubmit(draft); onClose() }} /> : null}
  </Dialog>
}

function SpaceForm({ initial, onCancel, onSubmit }: { initial?: SpaceRecord; onCancel: () => void; onSubmit: (draft: SpaceDraft) => Promise<void> }) {
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [icon, setIcon] = useState(initial?.icon ?? '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const errorId = useId()

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (saving) return
    if (!name.trim()) return setError('Give your Space a name.')
    if (name.trim().length > 120) return setError('Keep the name under 120 characters.')
    if (description.length > 1000) return setError('Keep the description under 1,000 characters.')
    setSaving(true)
    try { await onSubmit({ name, description, icon }) } catch (cause) { setError(friendly(cause)); setSaving(false) }
  }

  return <form onSubmit={submit} className="space-y-5" noValidate>
    <label className={labelClass}>Name
      <input autoFocus value={name} onChange={(event) => { setName(event.target.value); setError('') }} maxLength={120} placeholder="e.g. Biology 101" aria-invalid={Boolean(error) || undefined} aria-describedby={error ? errorId : undefined} className={inputClass} />
    </label>
    <FieldError id={errorId} message={error} />
    <label className={labelClass}>Description <span className="font-normal text-muted">(optional)</span>
      <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} rows={3} placeholder="What is this Space for?" className={`${inputClass} py-2.5`} />
    </label>
    <fieldset className="min-w-0">
      <legend className={labelClass}>Icon <span className="font-normal text-muted">(optional)</span></legend>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button type="button" aria-pressed={!icon} onClick={() => setIcon('')} className={`grid size-11 place-items-center rounded-lg border ${!icon ? 'border-strong bg-surface' : 'border-default'}`} aria-label="No icon"><SpaceGlyph icon={null} size="sm" /></button>
        {spaceIcons.map((choice) => <button key={choice} type="button" aria-pressed={icon === choice} onClick={() => setIcon(choice)} className={`grid size-11 place-items-center rounded-lg border text-lg ${icon === choice ? 'border-strong bg-surface' : 'border-default'}`} aria-label={`Icon ${choice}`}>{choice}</button>)}
      </div>
    </fieldset>
    <div className="flex flex-wrap justify-end gap-2 pt-1">
      <button type="button" onClick={onCancel} className={buttonSecondary}>Cancel</button>
      <button type="submit" disabled={saving} className={buttonPrimary}>{saving ? 'Saving…' : initial ? 'Save changes' : 'Create Space'}</button>
    </div>
  </form>
}

const emptyFields = (kind: SourceKind, spaceIds: string[]): AddSourceFields => ({ kind, title: '', sensitivity: 'PRIVATE', spaceIds, file: null, captions: null, url: '', youtubeUrl: '', text: '', noteId: '', consent: false })

type SubmitSource = (input: AddSourceInput, options: { signal: AbortSignal; onProgress: (progress: AddProgress) => void }) => Promise<void>

/** Uploads (with progress) and adds the Source; stays open with the error if anything fails. Cancel stops an upload. */
export function AddSourceDialog({ open, onClose, spaces, notes, defaultSpaceId, onSubmit }: { open: boolean; onClose: () => void; spaces: SpaceRecord[]; notes: NoteRecord[]; defaultSpaceId?: string; onSubmit: SubmitSource }) {
  const busyRef = useRef<AbortController | null>(null)
  const close = () => { busyRef.current?.abort(); busyRef.current = null; onClose() }
  return <Dialog open={open} onClose={close} title="Add to Library" description="Sources are study material your notes and Spaces can draw on. Add once, use in any Space.">
    {open ? <AddSourceForm key={defaultSpaceId ?? 'library'} spaces={spaces} notes={notes} defaultSpaceId={defaultSpaceId} onCancel={close} busyRef={busyRef}
      onSubmit={async (input, options) => { await onSubmit(input, options); busyRef.current = null; onClose() }} /> : null}
  </Dialog>
}

function AddSourceForm({ spaces, notes, defaultSpaceId, onCancel, onSubmit, busyRef }: { spaces: SpaceRecord[]; notes: NoteRecord[]; defaultSpaceId?: string; onCancel: () => void; onSubmit: SubmitSource; busyRef: React.RefObject<AbortController | null> }) {
  const [fields, setFields] = useState<AddSourceFields>(() => emptyFields('FILE', defaultSpaceId ? [defaultSpaceId] : []))
  const [problem, setProblem] = useState<{ field: keyof AddSourceFields; message: string } | null>(null)
  const [progress, setProgress] = useState<AddProgress | null>(null)
  const [failure, setFailure] = useState('')
  const failureId = useId()
  useEffect(() => () => busyRef.current?.abort(), [busyRef])
  const ids = { error: useId() }
  const activeSpaces = useMemo(() => spaces.filter((space) => space.status === 'ACTIVE'), [spaces])
  const set = <K extends keyof AddSourceFields>(key: K, value: AddSourceFields[K]) => { setFields((current) => ({ ...current, [key]: value })); if (problem?.field === key) setProblem(null) }
  const invalid = (field: keyof AddSourceFields) => (problem?.field === field ? { 'aria-invalid': true as const, 'aria-describedby': ids.error } : {})
  const error = (field: keyof AddSourceFields) => (problem?.field === field ? <FieldError id={ids.error} message={problem.message} /> : null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (progress) return
    const found = validateSource(fields)
    if (found) return setProblem(found)
    const controller = new AbortController()
    busyRef.current = controller
    setFailure('')
    setProgress({ phase: 'adding' })
    try {
      await onSubmit(toInput(fields, notes.find((note) => note.id === fields.noteId)?.title), { signal: controller.signal, onProgress: setProgress })
    } catch (cause) {
      if (controller.signal.aborted) return
      setFailure(friendly(cause))
      setProgress(null)
    }
  }
  const percent = progress?.phase === 'uploading' && progress.total ? Math.round((progress.loaded / progress.total) * 100) : null

  let kindFields: ReactNode
  switch (fields.kind) {
    case 'FILE': kindFields = <>
      <label className={labelClass}>File
        <input type="file" accept=".pdf,.txt,.md,.markdown,application/pdf,text/plain,text/markdown" onChange={(event) => set('file', event.target.files?.[0] ?? null)} {...invalid('file')} className={`${inputClass} py-2 file:mr-3 file:rounded-lg file:border-0 file:bg-raised file:px-3 file:py-1.5 file:text-sm`} />
      </label>
      {error('file')}
      <p className="text-xs leading-5 text-muted">PDF, text or Markdown, up to 250 MB. Scanned PDFs without a text layer can’t be searched.</p>
    </>; break
    case 'AUDIO_TRANSCRIPT': kindFields = <>
      <label className={labelClass}>Recording
        <input type="file" accept="audio/*" onChange={(event) => set('file', event.target.files?.[0] ?? null)} {...invalid('file')} className={`${inputClass} py-2 file:mr-3 file:rounded-lg file:border-0 file:bg-raised file:px-3 file:py-1.5 file:text-sm`} />
      </label>
      {error('file')}
      <p className="text-xs leading-5 text-muted">MP3, WAV, M4A or OGG up to 200 MB. Long recordings take a few minutes to transcribe.</p>
      <label className="flex items-start gap-3 rounded-xl border border-default p-3 text-sm text-foreground">
        <input type="checkbox" checked={fields.consent} onChange={(event) => set('consent', event.target.checked)} {...invalid('consent')} className="mt-0.5 size-5 shrink-0 accent-[var(--ui-button)]" />
        I have permission to record and transcribe this audio.
      </label>
      {error('consent')}
    </>; break
    case 'YOUTUBE_TRANSCRIPT': kindFields = <>
      <label className={labelClass}>YouTube video link
        <input type="url" inputMode="url" value={fields.youtubeUrl} onChange={(event) => set('youtubeUrl', event.target.value)} placeholder="https://www.youtube.com/watch?v=…" {...invalid('youtubeUrl')} className={inputClass} />
      </label>
      {error('youtubeUrl')}
      <label className={labelClass}>Caption file
        <input type="file" accept=".vtt,.srt,text/vtt,application/x-subrip" onChange={(event) => set('captions', event.target.files?.[0] ?? null)} {...invalid('captions')} className={`${inputClass} py-2 file:mr-3 file:rounded-lg file:border-0 file:bg-raised file:px-3 file:py-1.5 file:text-sm`} />
      </label>
      {error('captions')}
      <p className="rounded-xl bg-surface p-3 text-xs leading-5 text-muted">Incantly never downloads from YouTube. Add the video’s caption file yourself, for example from YouTube Studio for your own videos. Citations link back to the moment in the video.</p>
    </>; break
    case 'WEB_PAGE': kindFields = <>
      <label className={labelClass}>Web address
        <input type="url" inputMode="url" value={fields.url} onChange={(event) => set('url', event.target.value)} placeholder="https://" {...invalid('url')} className={inputClass} />
      </label>
      {error('url')}
    </>; break
    case 'PASTED_TEXT': kindFields = <>
      <label className={labelClass}>Text
        <textarea value={fields.text} onChange={(event) => set('text', event.target.value)} rows={7} placeholder="Paste text from an article, lecture or book" {...invalid('text')} className={`${inputClass} py-2.5`} />
      </label>
      {error('text')}
    </>; break
    case 'NOTE_REVISION': kindFields = <>
      <label className={labelClass}>Note
        <select value={fields.noteId} onChange={(event) => set('noteId', event.target.value)} {...invalid('noteId')} className={inputClass}>
          <option value="">Choose a note…</option>
          {notes.map((note) => <option key={note.id} value={note.id}>{note.title || 'Untitled note'}</option>)}
        </select>
      </label>
      {error('noteId')}
      <p className="text-xs leading-5 text-muted">Adds the note as it is now. Later edits don’t change this copy, so answers stay tied to what you added.</p>
    </>; break
  }

  return <form onSubmit={submit} className="space-y-5" noValidate aria-describedby={failure ? failureId : undefined}>
    <fieldset disabled={Boolean(progress)} className="min-w-0 space-y-5">
    <Tabs label="Source type" value={fields.kind} onChange={(kind) => { setFields((current) => emptyFields(kind, current.spaceIds)); setProblem(null) }} tabs={sourceKinds.map((item) => ({ id: item.kind, label: item.label }))} />
    <div className="space-y-3">{kindFields}</div>
    <label className={labelClass}>Title <span className="font-normal text-muted">(optional)</span>
      <input value={fields.title} onChange={(event) => set('title', event.target.value)} maxLength={300} placeholder="Leave blank to use the file or page name" {...invalid('title')} className={inputClass} />
    </label>
    {error('title')}
    <label className={labelClass}>Sensitivity
      <select value={fields.sensitivity} onChange={(event) => set('sensitivity', event.target.value as AddSourceFields['sensitivity'])} className={inputClass}>
        {sensitivities.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
      </select>
      <span className="mt-1.5 block text-xs font-normal leading-5 text-muted">{sensitivities.find((item) => item.value === fields.sensitivity)?.help}</span>
    </label>
    {activeSpaces.length ? <fieldset className="min-w-0">
      <legend className={labelClass}>Also add to Spaces <span className="font-normal text-muted">(optional)</span></legend>
      <div className="mt-2 grid max-h-40 gap-1 overflow-y-auto rounded-xl border border-default p-1">
        {activeSpaces.map((space) => <label key={space.id} className="flex min-h-11 min-w-0 items-center gap-3 rounded-lg px-2 text-sm text-foreground hover:bg-surface">
          <input type="checkbox" checked={fields.spaceIds.includes(space.id)} onChange={(event) => set('spaceIds', event.target.checked ? [...fields.spaceIds, space.id] : fields.spaceIds.filter((id) => id !== space.id))} className="size-5 shrink-0 accent-[var(--ui-button)]" />
          <SpaceGlyph icon={space.icon} size="sm" /><span className="min-w-0 truncate">{space.name}</span>
        </label>)}
      </div>
      {error('spaceIds')}
    </fieldset> : null}
    </fieldset>
    {failure ? <p id={failureId} role="alert" className="rounded-xl bg-danger-surface p-3 text-sm text-danger">{failure}</p> : null}
    {progress ? <div role="status" className="space-y-2 text-sm text-muted">
      <span>{progress.phase === 'uploading' ? `Uploading… ${percent ?? 0}%` : 'Adding to your Library…'}</span>
      {progress.phase === 'uploading' ? <div role="progressbar" aria-label="Upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent ?? 0} className="h-1.5 overflow-hidden rounded-full bg-surface"><span className="block h-full bg-button transition-[width] duration-150 motion-reduce:transition-none" style={{ width: `${percent ?? 0}%` }} /></div> : null}
    </div> : null}
    <div className="flex flex-wrap justify-end gap-2 pt-1">
      <button type="button" onClick={onCancel} className={buttonSecondary}>Cancel</button>
      <button type="submit" disabled={Boolean(progress)} className={buttonPrimary}><AppIcon name="upload" className="size-4" />{progress ? 'Adding…' : 'Add to Library'}</button>
    </div>
  </form>
}

/** Pick one item from a list, e.g. a note to add to a Space or a Source to link. */
export function PickerDialog<T extends { id: string }>({ open, onClose, title, description, items, render, onPick, empty }: { open: boolean; onClose: () => void; title: string; description?: string; items: T[]; render: (item: T) => ReactNode; onPick: (item: T) => void; empty: string }) {
  const [query, setQuery] = useState('')
  const text = (item: T) => (typeof (item as { title?: unknown }).title === 'string' ? (item as unknown as { title: string }).title : (item as unknown as { name?: string }).name ?? '')
  const visible = items.filter((item) => text(item).toLowerCase().includes(query.trim().toLowerCase()))
  return <Dialog open={open} onClose={() => { setQuery(''); onClose() }} title={title} description={description}>
    {items.length > 6 ? <label className="mb-3 flex min-h-11 items-center gap-2 rounded-xl border border-default bg-surface px-3"><AppIcon name="search" className="size-4 text-muted" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter" aria-label="Filter" className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none" /></label> : null}
    {visible.length ? <ul className="divide-y divide-default">
      {visible.map((item) => <li key={item.id}><button type="button" onClick={() => { onPick(item); setQuery(''); onClose() }} className="flex min-h-12 w-full items-center gap-3 rounded-lg px-2 text-left hover:bg-surface">{render(item)}</button></li>)}
    </ul> : <p className="py-8 text-center text-sm text-muted">{empty}</p>}
  </Dialog>
}
