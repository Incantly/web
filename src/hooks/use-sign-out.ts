'use client'

import { useState } from 'react'
import { authClient } from '@/lib/auth-client'

/**
 * Sign-out that never silently drops unsaved notes: it first sends what it can, and when edits
 * are still unsent it waits for the user to confirm (`confirming`) before signing out and
 * deleting this device's note copies. `after` runs once signed out (navigate or refetch).
 * The note-data module loads on demand, keeping the editor out of pages that only sign out.
 */
export function useSignOut(after: () => void | Promise<unknown>) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [confirming, setConfirming] = useState(false)

  async function finish() {
    const result = await authClient.signOut()
    if (result.error) throw new Error('sign-out failed')
    const data = await import('@/components/product/workspace/localNoteData')
    await data.clearLocalNoteData()
    await after()
  }

  async function run(action: () => Promise<void>) {
    setPending(true); setError(null)
    try { await action() } catch (cause) { setError(cause ?? new Error('sign-out failed')) } finally { setPending(false) }
  }

  const signOut = () => run(async () => {
    const userId = (await authClient.getSession()).data?.user?.id
    if (userId) {
      const data = await import('@/components/product/workspace/localNoteData')
      if (await data.unsavedNoteWorkBeforeSignOut(userId)) { setConfirming(true); return }
    }
    await finish()
  })
  const confirm = () => { setConfirming(false); void run(finish) }
  const cancel = () => setConfirming(false)
  return { pending, error, confirming, signOut, confirm, cancel }
}
