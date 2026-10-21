'use client'

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'
import { configureApiClient } from '../../lib/api/client'
import { ApiError } from '../../lib/api/errors'
import { ApiErrorToaster, notifyApiError } from './ApiErrorToaster'

/** Set `meta: { silentErrors: true }` on a query or mutation that renders its own error state. */
type ErrorMeta = { silentErrors?: boolean } | undefined

function shouldToast(error: unknown, meta: ErrorMeta) {
  if (meta?.silentErrors) return false
  // 401 is handled by the sign-in redirect, not a toast.
  return !(error instanceof ApiError && error.status === 401)
}

function createQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({ onError: (error, query) => { if (shouldToast(error, query.meta as ErrorMeta)) notifyApiError(error) } }),
    mutationCache: new MutationCache({ onError: (error, _variables, _context, mutation) => { if (shouldToast(error, mutation.meta as ErrorMeta)) notifyApiError(error) } }),
    defaultOptions: {
      // apiFetch already retries 429/503 and safe network failures; avoid double retries.
      queries: { retry: false, staleTime: 30_000, refetchOnWindowFocus: true },
      mutations: { retry: false },
    },
  })
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient)

  useEffect(() => configureApiClient({
    onUnauthorized: () => {
      // Stop background work; unsynced edits stay in IndexedDB for after sign-in.
      void queryClient.cancelQueries()
      queryClient.getQueryCache().clear()
      const next = window.location.pathname + window.location.search
      window.location.assign(new URL(`/auth?next=${encodeURIComponent(next)}`, window.location.origin).href)
    },
  }), [queryClient])

  return <QueryClientProvider client={queryClient}>
    {children}
    <ApiErrorToaster />
  </QueryClientProvider>
}
