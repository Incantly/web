'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useState } from 'react'
import { AppIcon } from './AppIcon'
import { isShareToken } from './workspace/sharingModel'
import { EmptyState, PageFrame } from './workspace/ui'
import { apiErrorMessage } from '../../lib/api/errors'
import { sharingApi } from '../../lib/api/sharing'
import { loadDocument, type GateResult } from '../../lib/notes/documentGate'

const DocumentEditor = dynamic(
  () => import('../../lib/document-editor').then((module) => module.DocumentEditor),
  { ssr: false, loading: () => <div className="mx-auto mt-8 h-28 w-full max-w-[46rem] animate-pulse rounded-2xl bg-surface" role="status" aria-label="Loading shared note" /> },
)

type ViewerState =
  | { phase: 'loading' }
  | { phase: 'ready'; title: string; gate: Extract<GateResult, { ok: true }> }
  | { phase: 'unreadable' }
  | { phase: 'error'; message: string }

function sharedTitle(note: unknown, fallback: string): string {
  if (note && typeof note === 'object' && typeof (note as { title?: unknown }).title === 'string') {
    const title = ((note as { title: string }).title || '').trim()
    if (title) return title
  }
  return fallback
}

/**
 * A view-only note opened through a share link (`/shared/{token}`). No session, no editor UI,
 * no live connection: one checkpoint read through the load gate, rendered read-only.
 * The token arrives from the route only, lives in this component's memory, and is never stored.
 */
export function SharedViewer({ token }: { token: string }) {
  const [state, setState] = useState<ViewerState>({ phase: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => { setState({ phase: 'loading' }); setAttempt((value) => value + 1) }, [])
  // An empty route token is an invalid link: rendered directly, with no request behind it.
  const tokenValid = isShareToken(token)

  useEffect(() => {
    if (!tokenValid) return
    // Plain state, not the query cache: the token must never be a cache key, a log, or a stored value.
    const controller = new AbortController()
    sharingApi.sharedCheckpoint(token, controller.signal).then(
      (checkpoint) => {
        if (controller.signal.aborted) return
        const gate = loadDocument(checkpoint.document)
        if (!gate.ok) { setState({ phase: 'unreadable' }); return }
        setState({ phase: 'ready', title: sharedTitle(checkpoint.note, gate.document.metadata.title || 'Shared note'), gate })
      },
      (cause: unknown) => {
        if (controller.signal.aborted) return
        setState({ phase: 'error', message: apiErrorMessage(cause) })
      },
    )
    return () => controller.abort()
  }, [token, tokenValid, attempt])

  // The invalid-token view reads straight from the route: no fetch state is involved.
  const shown: ViewerState = tokenValid ? state : { phase: 'error', message: 'This share link is invalid or has expired. Ask the owner for a new one.' }

  return <main className="min-h-svh bg-surface">
    <div className="mx-auto w-full max-w-[46rem] px-4 py-6 sm:px-8">
      <p className="font-display text-[1.45rem] leading-none tracking-[-0.05em] text-foreground">incantly</p>
    </div>
    {shown.phase === 'loading' ? <div className="mx-auto w-full max-w-[46rem] px-4 sm:px-8" role="status" aria-label="Loading shared note">
      <div className="h-10 w-2/3 animate-pulse rounded-xl bg-raised motion-reduce:animate-none" />
      <div className="mt-6 h-64 animate-pulse rounded-[1.15rem] bg-raised motion-reduce:animate-none" />
    </div> : null}
    {shown.phase === 'error' ? <PageFrame>
      <EmptyState icon="unlink" title="This link didn’t open"
        body={shown.message}
        action={<button type="button" onClick={retry} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-button px-4 text-sm font-semibold text-inverse transition-colors hover:bg-button-hover">Try again</button>} />
    </PageFrame> : null}
    {shown.phase === 'unreadable' ? <PageFrame>
      <EmptyState icon="document" title="This copy can’t be opened safely" body="The shared content didn’t pass validation, so it isn’t shown. Ask the owner for a new link." />
    </PageFrame> : null}
    {shown.phase === 'ready' ? <article className="mx-auto w-full max-w-[46rem] px-4 pb-16 sm:px-8">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted"><AppIcon name="link" className="size-3.5" />View-only shared copy</p>
      <h1 className="mt-2 break-words font-display text-[clamp(2rem,4.5vw,3rem)] font-normal leading-[1.05] tracking-[-0.045em] text-foreground">{shown.title}</h1>
      {shown.gate.repaired ? <p role="status" className="mt-3 w-fit rounded-full bg-raised px-3 py-1 text-xs text-muted">Some content in this copy was repaired when it opened.</p> : null}
      <div className="mt-6 overflow-hidden rounded-[1.15rem] border border-default bg-raised">
        <DocumentEditor key={token} initialDocument={shown.gate.document} readonly ui="none" aria-label={`Shared note: ${shown.title}`} className="min-h-[20rem]" />
      </div>
      <p className="mt-6 text-center text-xs text-subtle">Shared from Incantly · This copy doesn’t update live</p>
    </article> : null}
  </main>
}
