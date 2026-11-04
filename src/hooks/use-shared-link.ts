'use client'

import { useCallback, useEffect, useState } from 'react'
import { sharedLinkTitle } from '@/components/product/workspace/sharedLinkModel'
import { isShareToken } from '@/components/product/workspace/sharingModel'
import { apiErrorMessage, isApiError } from '@/lib/api/errors'
import { sharingApi } from '@/lib/api/sharing'
import { loadDocument, type GateResult } from '@/lib/notes/documentGate'

export type SharedLinkState =
  | { phase: 'loading' }
  | { phase: 'ready'; title: string; gate: Extract<GateResult, { ok: true }> }
  | { phase: 'unreadable' }
  | { phase: 'invalid' }
  | { phase: 'error'; message: string }

export type SharedLink = SharedLinkState & { retry: () => void }

/**
 * One share-link checkpoint through the load gate. Plain state, not the query
 * cache: the token must never be a cache key, a log, or a stored value. Single
 * consumer (the in-workspace link view), so no provider.
 */
export function useSharedLink(token: string): SharedLink {
  const [state, setState] = useState<SharedLinkState>({ phase: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => { setState({ phase: 'loading' }); setAttempt((value) => value + 1) }, [])
  // An empty route token is an invalid link: rendered directly, with no request behind it.
  const tokenValid = isShareToken(token)

  useEffect(() => {
    if (!tokenValid) return
    const controller = new AbortController()
    sharingApi.sharedCheckpoint(token, controller.signal).then(
      (checkpoint) => {
        if (controller.signal.aborted) return
        const gate = loadDocument(checkpoint.document)
        if (!gate.ok) { setState({ phase: 'unreadable' }); return }
        setState({ phase: 'ready', title: sharedLinkTitle(checkpoint.note, gate.document.metadata.title || 'Shared note'), gate })
      },
      (cause: unknown) => {
        if (controller.signal.aborted) return
        // An expired or revoked link reads the same as a malformed one: the owner must send a new link.
        if (isApiError(cause, 'SHARE_LINK_INVALID')) { setState({ phase: 'invalid' }); return }
        setState({ phase: 'error', message: apiErrorMessage(cause) })
      },
    )
    return () => controller.abort()
  }, [token, tokenValid, attempt])

  // The invalid-token view reads straight from the route: no fetch state is involved.
  const shown: SharedLinkState = tokenValid ? state : { phase: 'invalid' }
  return { ...shown, retry }
}
