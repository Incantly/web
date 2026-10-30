'use client'

import { useMutation, useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { contextApi, type ContextPreviewRequest, type ContextPreviewResult, type IndexStatusDto } from '../../../lib/api/context'
import { indexStillBuilding, retryAfterSeconds } from './contextModel'
import { pollDelay } from './sourceStatus'
import { useCurrentUser } from '../SessionGate'

export const noteIndexKey = (noteId: string) => ['note-index', noteId] as const
export const sourceIndexKey = (sourceId: string) => ['source-index', sourceId] as const

/**
 * Index status, polled (1 s → 5 s) only while a build runs. TanStack Query pauses the interval
 * while the tab is hidden or offline and refetches on reconnect, so nothing polls in the background.
 */
const indexInterval = (query: { state: { data?: IndexStatusDto; dataUpdateCount: number } }) =>
  (indexStillBuilding(query.state.data) ? pollDelay(Math.min(query.state.dataUpdateCount, 6)) : false)

export function useNoteIndexStatus(noteId: string, enabled = true) {
  return useQuery({ queryKey: noteIndexKey(noteId), queryFn: ({ signal }) => contextApi.noteIndexStatus(noteId, signal), enabled, meta: { silentErrors: true }, refetchInterval: indexInterval })
}

export function useSourceIndexStatus(sourceId: string | null, enabled = true) {
  return useQuery({ queryKey: sourceIndexKey(sourceId ?? ''), queryFn: ({ signal }) => contextApi.sourceIndexStatus(sourceId!, signal), enabled: enabled && Boolean(sourceId), meta: { silentErrors: true }, refetchInterval: indexInterval })
}

/** Counts down a server-imposed wait (Retry-After) to zero, one second at a time. */
export function useCountdown() {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    if (seconds <= 0) return
    const timer = window.setTimeout(() => setSeconds((value) => value - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [seconds])
  return [seconds, setSeconds] as const
}

/** "Index now": rate limited by the server; a 429 starts a countdown instead of an error. */
export function useReindexNote(noteId: string, onScheduled: () => void) {
  const [wait, setWait] = useCountdown()
  const mutation = useMutation({
    mutationFn: () => contextApi.reindexNote(noteId),
    meta: { silentErrors: true },
    onSuccess: onScheduled,
    onError: (error) => { const seconds = retryAfterSeconds(error); if (seconds) setWait(seconds) },
  })
  return { ...mutation, wait, rateLimited: wait > 0 }
}

export type ContentSearch = {
  result: ContextPreviewResult | null
  error: unknown
  pending: boolean
  /** Seconds left before the server accepts another search (429 Retry-After). */
  wait: number
  run: (body: ContextPreviewRequest) => void
  clear: () => void
}

/** Repeating a search within a minute reuses its result instead of spending another request. */
const CACHE_MS = 60_000
const CACHE_SIZE = 20
const previewCache = new Map<string, { at: number; result: ContextPreviewResult }>()

/**
 * Runs content searches on demand (never per keystroke: the server allows a short burst, then one
 * every few seconds). A new search aborts the previous one, and a repeat within a minute comes from
 * memory (per user). Nothing is stored on disk or put in the URL.
 */
export function useContentSearch(): ContentSearch {
  const userId = useCurrentUser().id
  const [result, setResult] = useState<ContextPreviewResult | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState(false)
  const [wait, setWait] = useCountdown()
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => controller.current?.abort(), [])

  const run = useCallback((body: ContextPreviewRequest) => {
    controller.current?.abort()
    const key = `${userId}:${JSON.stringify(body)}`
    const cached = previewCache.get(key)
    if (cached && Date.now() - cached.at < CACHE_MS) { setResult(cached.result); setError(null); setPending(false); return }
    const current = new AbortController()
    controller.current = current
    setPending(true); setError(null)
    contextApi.preview(body, current.signal)
      .then((next) => {
        previewCache.delete(key)
        previewCache.set(key, { at: Date.now(), result: next })
        if (previewCache.size > CACHE_SIZE) previewCache.delete(previewCache.keys().next().value!)
        if (!current.signal.aborted) setResult(next)
      })
      .catch((cause) => {
        if (current.signal.aborted) return
        const seconds = retryAfterSeconds(cause)
        if (seconds) setWait(seconds)
        setError(cause)
      })
      .finally(() => { if (controller.current === current) setPending(false) })
  }, [setWait, userId])
  const clear = useCallback(() => { controller.current?.abort(); setResult(null); setError(null); setPending(false) }, [])
  return { result, error, pending, wait, run, clear }
}
