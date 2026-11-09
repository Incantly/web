'use client'

import { useSyncExternalStore } from 'react'
import { liveSaveStatus, type LiveSaveStatus } from '@/components/product/workspace/liveCollabModel'
import { liveblocksClient } from '@/components/product/workspace/liveblocksClient'
import { useLiveCollab } from '@/hooks/use-live-collab'

export type { LiveSaveStatus }

const subscribeSync = (onChange: () => void) => liveblocksClient().events.syncStatus.subscribe(onChange)
const readSync = () => liveblocksClient().getSyncStatus()
const readServerSync = () => 'synchronized' as const

const subscribeOnline = (onChange: () => void) => {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}
const readOnline = () => navigator.onLine
const readServerOnline = () => true

/**
 * The live note's save indicator: "Saving…" while Liveblocks reports `synchronizing`,
 * "Saved" once `synchronized`, "Reconnecting…" while the room is down, and
 * "Offline – changes will sync" while the browser is offline.
 * `bound` is true once the note's room doc has loaded. No shared state, so no provider.
 */
export function useLiveSaveStatus(bound: boolean): LiveSaveStatus {
  const { connection } = useLiveCollab()
  const sync = useSyncExternalStore(subscribeSync, readSync, readServerSync)
  const online = useSyncExternalStore(subscribeOnline, readOnline, readServerOnline)
  return liveSaveStatus({ sync, online, connection, bound })
}
