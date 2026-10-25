'use client'

import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { AppIcon } from '../AppIcon'
import { ApiError, apiErrorMessage, isApiError } from '../../../lib/api/errors'
import { newIdempotencyKey } from '../../../lib/api/idempotency'
import { importSettled, importsApi, type ImportJobDto } from '../../../lib/api/imports'
import { uploadAsset, uploadErrorMessage } from '../../../lib/assets/upload'
import { importPollDelay, importStatusText, importStorageKey, parseTracked, validateImportFile, validateImportUrl, type TrackedImport } from './importModel'
import { notesKey } from './useNotes'
import { Dialog, buttonPrimary, buttonQuiet, buttonSecondary, inputClass, labelClass } from './ui'

export type ImportMode = 'file' | 'url'
export type StartedImport = { job: ImportJobDto; label: string; intoNoteId: string | null }

function readTracked(userId: string) {
  try { return parseTracked(window.localStorage.getItem(importStorageKey(userId))) } catch { return [] }
}
function writeTracked(userId: string, items: TrackedImport[]) {
  try { window.localStorage.setItem(importStorageKey(userId), JSON.stringify(items)) } catch { /* Storage is a convenience; polling still runs this session. */ }
}

/**
 * Tracks import jobs started on this device. IDs persist (no content), so a reload resumes polling.
 * Polling runs every 2–5 s and pauses while the tab is hidden or offline.
 */
export function useImportTracker(userId: string, onCompleted: (job: ImportJobDto, item: TrackedImport) => void) {
  const client = useQueryClient()
  // The shell renders only on the client after the session check, so storage can be read up front.
  const [items, setItems] = useState<TrackedImport[]>(() => (typeof window === 'undefined' ? [] : readTracked(userId)))
  useEffect(() => { writeTracked(userId, items) }, [userId, items])

  const visible = items.filter((item) => !item.dismissed)
  const results = useQueries({
    queries: visible.map((item) => ({
      queryKey: ['import', item.id],
      queryFn: ({ signal }: { signal: AbortSignal }) => importsApi.get(item.id, signal),
      meta: { silentErrors: true },
      refetchInterval: (query: { state: { data?: ImportJobDto; dataUpdateCount: number; error: unknown } }) => (query.state.error || (query.state.data && importSettled(query.state.data.status)) ? false : importPollDelay(query.state.dataUpdateCount)),
    })),
  })

  // React once per import when it completes: refresh the notes list and let the shell reload an open note.
  const handled = useRef(new Set<string>())
  const onCompletedRef = useRef(onCompleted)
  useEffect(() => { onCompletedRef.current = onCompleted })
  const jobs = results.map((result) => result.data)
  useEffect(() => {
    jobs.forEach((job, index) => {
      const item = visible[index]
      if (!job || !item || job.status !== 'completed' || handled.current.has(job.id)) return
      handled.current.add(job.id)
      void client.invalidateQueries({ queryKey: notesKey(userId) })
      onCompletedRef.current(job, item)
    })
  })

  const track = useCallback(({ job, label, intoNoteId }: StartedImport) => {
    client.setQueryData(['import', job.id], job)
    // An import that already finished before this device saw it doesn't re-trigger a reload.
    setItems((current) => [...current.filter((item) => item.id !== job.id), { id: job.id, label, intoNoteId, startedAt: Date.now() }].slice(-20))
  }, [client])
  const dismiss = useCallback((id: string) => setItems((current) => current.filter((item) => item.id !== id)), [])
  const cancel = useMutation({
    mutationFn: (id: string) => importsApi.cancel(id),
    meta: { silentErrors: true },
    onSettled: (_result, _error, id) => client.invalidateQueries({ queryKey: ['import', id] }),
  })

  const entries = visible.map((item, index) => ({ item, job: results[index]?.data, error: results[index]?.error ?? null }))
  return { entries, track, dismiss, cancel }
}

export type ImportTracker = ReturnType<typeof useImportTracker>

/** A small live card listing imports: progress, Cancel while queued, Open note when done. */
export function ImportTray({ tracker, onOpenNote }: { tracker: ImportTracker; onOpenNote: (noteId: string) => void }) {
  const { entries, cancel, dismiss } = tracker
  return <section aria-label="Imports" className={`fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-[max(0.75rem,env(safe-area-inset-left))] z-40 w-[min(20rem,calc(100vw-1.5rem))] ${entries.length ? '' : 'pointer-events-none'}`}>
    <ul aria-live="polite" className="space-y-2">
      {entries.map(({ item, job, error }) => {
        const gone = isApiError(error, 'IMPORT_NOT_FOUND')
        const into = Boolean(item.intoNoteId)
        const status = gone ? 'This import no longer exists' : error ? 'Can’t check this import right now' : importStatusText(job, into)
        const cancelError = cancel.variables === item.id && cancel.error ? (isApiError(cancel.error, 'IMPORT_NOT_CANCELLABLE') ? 'It already started, so it can’t be cancelled.' : apiErrorMessage(cancel.error)) : null
        const done = gone || (job && importSettled(job.status))
        return <li key={item.id} className="rounded-xl border border-default bg-raised p-3 shadow-lg">
          <div className="flex items-start gap-2">
            <AppIcon name={job?.status === 'failed' || gone ? 'alert' : done ? 'checkCircle' : 'import'} className={`mt-0.5 size-4 shrink-0 ${job?.status === 'failed' ? 'text-danger' : 'text-muted'}`} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{item.label}</p>
              <p className="text-xs text-muted">{status}</p>
              {job?.status === 'failed' ? <p className="mt-1 text-xs leading-5 text-danger">{importFailureText(job.errorCode)}</p> : null}
              {cancelError ? <p role="alert" className="mt-1 text-xs text-danger">{cancelError}</p> : null}
            </div>
            {done ? <button type="button" onClick={() => dismiss(item.id)} className="-m-2 grid size-11 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface hover:text-foreground" aria-label={`Dismiss ${item.label}`}><AppIcon name="close" className="size-4" /></button> : null}
          </div>
          {!done && job?.status === 'running' ? <div role="progressbar" aria-label="Import progress" className="mt-2 h-1 overflow-hidden rounded-full bg-surface"><span className="block h-full w-1/3 animate-pulse rounded-full bg-button motion-reduce:animate-none" /></div> : null}
          {(job?.status === 'queued' && !error) || (job?.status === 'completed' && job.targetNoteId) ? <div className="mt-2 flex justify-end gap-1">
            {job.status === 'queued' ? <button type="button" disabled={cancel.isPending && cancel.variables === item.id} onClick={() => cancel.mutate(item.id)} className={buttonQuiet}>Cancel</button> : null}
            {job.status === 'completed' && job.targetNoteId ? <button type="button" onClick={() => { onOpenNote(job.targetNoteId!); dismiss(item.id) }} className={buttonSecondary}>Open note</button> : null}
          </div> : null}
        </li>
      })}
    </ul>
  </section>
}

/** A failed job's stored errorCode, in words, from the same catalog as request errors. */
export function importFailureText(code: string | null) {
  return code ? apiErrorMessage(new ApiError(0, code, null, null)) : 'Something went wrong. Try importing it again.'
}

/** "Import file as note" / "Import from web address", as a new note or into an existing one. */
export function ImportDialog({ open, mode, intoNote, onClose, onStarted }: { open: boolean; mode: ImportMode; intoNote?: { id: string; title: string }; onClose: () => void; onStarted: (started: StartedImport) => void }) {
  const busyRef = useRef<AbortController | null>(null)
  const close = () => { busyRef.current?.abort(); busyRef.current = null; onClose() }
  const title = mode === 'file' ? (intoNote ? 'Import a file into this note' : 'Import a file as a note') : (intoNote ? 'Import a web page into this note' : 'Import a web page as a note')
  const description = intoNote ? `Its text is added to the end of “${intoNote.title || 'Untitled note'}”.` : 'It becomes a new note you can edit.'
  return <Dialog open={open} onClose={close} title={title} description={description}>
    {open ? <ImportForm key={`${mode}:${intoNote?.id ?? 'new'}`} mode={mode} intoNoteId={intoNote?.id ?? null} busyRef={busyRef} onCancel={close} onStarted={(started) => { busyRef.current = null; onStarted(started); onClose() }} /> : null}
  </Dialog>
}

function ImportForm({ mode, intoNoteId, busyRef, onCancel, onStarted }: { mode: ImportMode; intoNoteId: string | null; busyRef: React.RefObject<AbortController | null>; onCancel: () => void; onStarted: (started: StartedImport) => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [phase, setPhase] = useState<null | { uploading: number } | 'starting'>(null)
  const errorId = useId()
  useEffect(() => () => busyRef.current?.abort(), [busyRef])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (phase) return
    setError('')
    const controller = new AbortController()
    busyRef.current = controller
    try {
      if (mode === 'file') {
        if (!file) { setError('Choose a file to import.'); return }
        const invalid = validateImportFile(file)
        if (invalid) { setError(invalid); return }
        setPhase({ uploading: 0 })
        const asset = await uploadAsset(file, { signal: controller.signal, onProgress: ({ loaded, total }) => setPhase({ uploading: total ? Math.round((loaded / total) * 100) : 0 }) })
        setPhase('starting')
        const job = await importsApi.importFile(intoNoteId ? { sourceAssetId: asset.id, targetNoteId: intoNoteId } : { sourceAssetId: asset.id }, newIdempotencyKey())
        onStarted({ job, label: file.name, intoNoteId })
      } else {
        const checked = validateImportUrl(url)
        if (!checked.ok) { setError(checked.message); return }
        setPhase('starting')
        const job = await importsApi.importUrl(intoNoteId ? { url: checked.url, targetNoteId: intoNoteId } : { url: checked.url }, newIdempotencyKey())
        onStarted({ job, label: checked.host, intoNoteId })
      }
    } catch (cause) {
      if (controller.signal.aborted) return
      setError(isApiError(cause, 'REMOTE_IMPORT_UNAVAILABLE') ? 'Importing from a web address isn’t available here yet.' : uploadErrorMessage(cause) ?? apiErrorMessage(cause))
    } finally {
      if (!controller.signal.aborted) setPhase(null)
    }
  }

  return <form onSubmit={submit} className="space-y-5" noValidate aria-describedby={error ? errorId : undefined}>
    <fieldset disabled={Boolean(phase)} className="min-w-0 space-y-5">
      {mode === 'file'
        ? <label className={labelClass}>File
          <input type="file" accept=".txt,.md,.markdown,text/plain,text/markdown" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setError('') }} className={`${inputClass} py-2 file:mr-3 file:rounded-lg file:border-0 file:bg-raised file:px-3 file:py-1.5 file:text-sm file:text-foreground`} />
          <span className="mt-1.5 block text-xs font-normal leading-5 text-muted">Plain text (.txt) or Markdown (.md), up to 10 MB.</span>
        </label>
        : <label className={labelClass}>Web address
          <input type="url" inputMode="url" autoComplete="url" value={url} onChange={(event) => { setUrl(event.target.value); setError('') }} placeholder="https://example.org/article" className={inputClass} />
          <span className="mt-1.5 block text-xs font-normal leading-5 text-muted">Only public https:// pages can be imported.</span>
        </label>}
    </fieldset>
    {error ? <p id={errorId} role="alert" className="text-sm text-danger">{error}</p> : null}
    {phase ? <div role="status" className="space-y-2 text-sm text-muted">
      <span>{typeof phase === 'object' ? `Uploading… ${phase.uploading}%` : 'Starting the import…'}</span>
      {typeof phase === 'object' ? <div role="progressbar" aria-label="Upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={phase.uploading} className="h-1.5 overflow-hidden rounded-full bg-surface"><span className="block h-full bg-button transition-[width] duration-150 motion-reduce:transition-none" style={{ width: `${phase.uploading}%` }} /></div> : null}
    </div> : null}
    <div className="flex flex-wrap justify-end gap-2">
      <button type="button" onClick={onCancel} className={buttonSecondary}>Cancel</button>
      <button type="submit" disabled={Boolean(phase)} className={buttonPrimary}><AppIcon name="import" className="size-4" />{phase ? 'Importing…' : 'Import'}</button>
    </div>
  </form>
}
