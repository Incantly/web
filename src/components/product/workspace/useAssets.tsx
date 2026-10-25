'use client'

import type { AssetRecord } from '@incantly/canvas-core/document'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState } from 'react'
import { apiErrorMessage } from '../../../lib/api/errors'
import { newIdempotencyKey } from '../../../lib/api/idempotency'
import { libraryApi } from '../../../lib/api/library'
import { ServerAssetHost, abortAbandonedUploads } from '../../../lib/assets/serverAssetHost'
import type { UploadFollowUp } from '../../../lib/document-editor'
import { buttonPrimary, buttonQuiet } from './ui'

const hosts = new Map<string, ServerAssetHost>()

/** One server asset host per signed-in user, shared by every open note so URL caching is shared too. */
export function useServerAssetHost(userId: string) {
  const [host] = useState(() => {
    let existing = hosts.get(userId)
    if (!existing) { existing = new ServerAssetHost({ userId }); hosts.set(userId, existing) }
    return existing
  })
  return host
}

/** Frees upload reservations left behind by a closed tab or a reload mid-upload. */
export function useAbandonedUploadCleanup(userId: string) {
  useEffect(() => { void abortAbandonedUploads(userId) }, [userId])
}

/** Library Sources accept PDF, text and Markdown files, and audio for transcription. Images stay in the note only. */
const libraryKind = (mimeType: string) =>
  mimeType.startsWith('audio/') ? 'AUDIO_TRANSCRIPT' as const
    : ['application/pdf', 'text/plain', 'text/markdown'].includes(mimeType) ? 'FILE' as const
      : null

const titleFor = (record: AssetRecord, file: File) => (record.filename ?? file.name).replace(/\.[a-z0-9]{1,8}$/i, '').trim().slice(0, 300) || 'Untitled source'

function AddToLibraryOffer({ record, file, dismiss }: { record: AssetRecord; file: File; dismiss: () => void }) {
  const client = useQueryClient()
  const kind = libraryKind(record.mimeType)!
  const consentId = useId()
  const [consent, setConsent] = useState(false)
  const [state, setState] = useState<'idle' | 'saving' | 'done' | 'error'>('idle')
  const [error, setError] = useState('')
  // One key for this choice, reused if the request is retried.
  const key = useRef(newIdempotencyKey())
  const add = async () => {
    setState('saving')
    try {
      await libraryApi.createSource({ kind, assetId: record.id, title: titleFor(record, file), sensitivity: 'PRIVATE', ...(kind === 'AUDIO_TRANSCRIPT' ? { transcriptionConsent: true } : {}) }, key.current)
      void client.invalidateQueries({ queryKey: ['library'] })
      setState('done')
    } catch (cause) {
      setError(apiErrorMessage(cause))
      setState('error')
    }
  }
  if (state === 'done') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-muted">Added to your Library.</span>
        <button type="button" onClick={dismiss} className={buttonQuiet}>Done</button>
      </div>
    )
  }
  return (
    <div className="grid gap-2 text-sm">
      {kind === 'AUDIO_TRANSCRIPT' ? (
        <label htmlFor={consentId} className="flex min-h-11 cursor-pointer items-center gap-2 text-muted">
          <input id={consentId} type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="size-4" />
          I have permission to transcribe this recording
        </label>
      ) : null}
      {state === 'error' ? <p role="alert" className="text-foreground">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void add()} disabled={state === 'saving' || (kind === 'AUDIO_TRANSCRIPT' && !consent)}
          className={`${buttonPrimary} flex-1`}>
          {state === 'saving' ? 'Adding…' : 'Also add to Library'}
        </button>
        <button type="button" onClick={dismiss} className={buttonQuiet}>Not now</button>
      </div>
    </div>
  )
}

/** After a file lands in a note, offer to add the same asset to the Library (no second upload). */
export const libraryFollowUp: UploadFollowUp = {
  applies: (record) => libraryKind(record.mimeType) !== null,
  render: (record, file, dismiss) => <AddToLibraryOffer record={record} file={file} dismiss={dismiss} />,
}
