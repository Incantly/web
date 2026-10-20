'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { ApiError, apiErrorMessage } from '../../lib/api/errors'
import { AppIcon } from './AppIcon'

type Toast = { id: number; message: string; requestId: string | null }

let toasts: Toast[] = []
let nextId = 1
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((listener) => listener())
const subscribe = (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener) }
const EMPTY: Toast[] = []

export function dismissApiError(id: number) {
  toasts = toasts.filter((toast) => toast.id !== id)
  emit()
}

/** Shows a friendly, code-based message with the request ID for support. Never shows raw bodies. */
export function notifyApiError(error: unknown) {
  const message = apiErrorMessage(error)
  const requestId = error instanceof ApiError ? error.requestId : null
  if (toasts.some((toast) => toast.message === message && toast.requestId === requestId)) return
  const toast = { id: nextId++, message, requestId }
  toasts = [...toasts.slice(-2), toast]
  emit()
  setTimeout(() => dismissApiError(toast.id), 8000)
}

function ToastItem({ toast }: { toast: Toast }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(timer)
  }, [copied])

  return <li role="alert" className="pointer-events-auto flex w-full items-start gap-3 rounded-xl border border-danger bg-danger-surface px-4 py-3 text-sm text-danger shadow-lg">
    <p className="m-0 min-w-0 flex-1 break-words pt-2.5">{toast.message}</p>
    {toast.requestId ? <button type="button" onClick={() => { void navigator.clipboard?.writeText(toast.requestId ?? '').then(() => setCopied(true)).catch(() => {}) }} className="min-h-11 shrink-0 rounded-lg px-2 text-xs font-semibold underline-offset-2 hover:underline" aria-label="Copy request ID for support">
      {copied ? 'Copied' : 'Copy ID'}
    </button> : null}
    <button type="button" onClick={() => dismissApiError(toast.id)} className="grid size-11 shrink-0 place-items-center rounded-lg hover:bg-raised" aria-label="Dismiss"><AppIcon name="close" className="size-4" /></button>
  </li>
}

export function ApiErrorToaster() {
  const items = useSyncExternalStore(subscribe, () => toasts, () => EMPTY)
  return <ol aria-live="assertive" className="pointer-events-none fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[70] m-0 flex list-none flex-col items-end gap-2 p-0 sm:left-auto sm:w-[24rem]">
    {items.map((toast) => <ToastItem key={toast.id} toast={toast} />)}
  </ol>
}
