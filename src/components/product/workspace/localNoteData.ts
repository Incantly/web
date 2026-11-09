import { clearOpenYjsBindings, discardRoomCopies } from '@/lib/document-editor/yjsBinding'
import { clearNoteQueryCaches } from '@/lib/notes/noteOpenCache'
import { NOTE_SYNC_DB_NAME } from '@/lib/notes/syncStore'
import { noteIdFromRoomId } from './liveCollabModel'
import { olderGenerationRoomIds } from './noteOpenModel'
import { hasUnsyncedLiveChanges, logoutLiveblocks, whenSynchronized } from './liveblocksClient'
import { closeNoteSyncStore, flushNoteWork, hasUnsentNoteWork } from './useNoteSession'

/** The account whose live notes' offline copies are on this device (room databases carry no owner). */
const OFFLINE_OWNER_KEY = 'incantly-live-offline-owner'
/** How long sign-out waits for unsaved work to reach the server before asking. */
const SIGN_OUT_DRAIN_MS = 5_000

/** When each room last reported synchronized on this device (room ID → epoch ms). No content, cleared at sign-out. */
const ROOM_SYNCED_KEY = 'incantly-live-room-synced'
/** Bounded: the oldest entries go first. */
const ROOM_SYNCED_MAX = 200
/** A room's synced time is rewritten at most this often. */
const ROOM_SYNCED_WRITE_MS = 60_000

/** Sign-out never hangs on a slow or blocked IndexedDB delete. */
const CLEAR_TIMEOUT_MS = 3_000

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.deleteDatabase(name)
      request.onsuccess = () => resolve()
      request.onerror = () => resolve()
      // Blocked: the delete still runs once the last connection closes (the page navigates next).
      request.onblocked = () => resolve()
    } catch {
      resolve()
    }
  })
}

function readOwner(): string | null {
  try { return localStorage.getItem(OFFLINE_OWNER_KEY) } catch { return null }
}

function writeOwner(userId: string | null) {
  try {
    if (userId) localStorage.setItem(OFFLINE_OWNER_KEY, userId)
    else localStorage.removeItem(OFFLINE_OWNER_KEY)
  } catch { /* Storage blocked: nothing to remember. */ }
}

function readSyncedMap(): Record<string, number> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(ROOM_SYNCED_KEY) ?? '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, number] => noteIdFromRoomId(entry[0]) != null && typeof entry[1] === 'number' && Number.isFinite(entry[1])))
  } catch {
    return {}
  }
}

/** When this room last synchronized on this device, or null (never, or storage blocked). */
export function readRoomSyncedAt(roomId: string): number | null {
  return readSyncedMap()[roomId] ?? null
}

/** The room reported synchronized: remember when (throttled), so its offline copy is trusted for a day. */
export function recordRoomSynced(roomId: string, now = Date.now()) {
  if (!noteIdFromRoomId(roomId)) return
  const map = readSyncedMap()
  if (map[roomId] != null && now - map[roomId] < ROOM_SYNCED_WRITE_MS) return
  map[roomId] = now
  const kept = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, ROOM_SYNCED_MAX)
  try { localStorage.setItem(ROOM_SYNCED_KEY, JSON.stringify(Object.fromEntries(kept))) } catch { /* Storage blocked: nothing is trusted then. */ }
}

function forgetRoomSynced(roomIds: readonly string[]) {
  const map = readSyncedMap()
  for (const roomId of roomIds) delete map[roomId]
  try { localStorage.setItem(ROOM_SYNCED_KEY, JSON.stringify(map)) } catch { /* Storage blocked. */ }
}

/**
 * Access to a room was lost: its unadopted copies are destroyed with their offline data, and
 * the room's IndexedDB database is deleted (a connection still closing deletes it once closed).
 */
export async function discardRoomOfflineData(roomId: string): Promise<void> {
  if (typeof indexedDB === 'undefined' || !noteIdFromRoomId(roomId)) return
  forgetRoomSynced([roomId])
  await bounded((async () => {
    await discardRoomCopies(roomId)
    await deleteDatabase(roomId)
  })())
}

/**
 * A newer generation of a note's room has synced: the offline databases of its older
 * generations can never be joined again (rooms only move forward), so they are deleted.
 */
export async function deleteOlderRoomGenerations(roomId: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  const older = olderGenerationRoomIds(roomId, await roomDatabaseNames())
  if (older.length === 0) return
  forgetRoomSynced(older)
  await bounded(Promise.all(older.map(deleteDatabase)))
}

async function roomDatabaseNames(): Promise<string[]> {
  const listed = await (indexedDB.databases?.() ?? Promise.resolve([])).catch(() => [])
  return listed.map(({ name }) => name).filter((name): name is string => Boolean(name && noteIdFromRoomId(name)))
}

function bounded(work: Promise<unknown>): Promise<void> {
  return Promise.race([work.then(() => undefined, () => undefined), new Promise<void>((resolve) => setTimeout(resolve, CLEAR_TIMEOUT_MS))])
}

let ownerCheck: { userId: string; done: Promise<void> } | null = null

/**
 * Before a live note opens: offline copies left by another account on this device (a session
 * that expired, or a different user signing in without signing out) are deleted, so no room
 * ever loads someone else's unsynced edits. Runs once per account per page.
 */
export function prepareLiveOfflineData(userId: string): Promise<void> {
  if (ownerCheck?.userId === userId) return ownerCheck.done
  const done = (async () => {
    if (typeof indexedDB === 'undefined') return
    const owner = readOwner()
    if (owner && owner !== userId) await bounded((async () => Promise.all((await roomDatabaseNames()).map(deleteDatabase)))())
    writeOwner(userId)
  })()
  ownerCheck = { userId, done }
  return done
}

/**
 * Sign-out, first step: sends what can still be sent (legacy queues, unacknowledged live
 * updates, bounded) and reports whether unsent work remains, so the user can confirm first.
 */
export async function unsavedNoteWorkBeforeSignOut(userId: string): Promise<boolean> {
  await bounded(flushNoteWork(userId))
  await whenSynchronized(SIGN_OUT_DRAIN_MS)
  return hasUnsyncedLiveChanges() || await hasUnsentNoteWork(userId).catch(() => false)
}

/**
 * Sign-out: removes note bodies kept on this device — the `incantly-notes` queue and cache,
 * Liveblocks' offline Yjs copies (one IndexedDB database per room ID, `note:{id}:{gen}`), the
 * rooms' synced times, and the note queries held in memory by React Query.
 * Open live notes delete their own copy through the provider first. Best effort, bounded.
 */
export async function clearLocalNoteData(): Promise<void> {
  // Every sign-out path (button, auth screen) drops the note bodies held in memory too.
  clearNoteQueryCaches()
  if (typeof indexedDB === 'undefined') return
  const work = (async () => {
    await clearOpenYjsBindings()
    logoutLiveblocks()
    closeNoteSyncStore()
    const names = new Set<string>([NOTE_SYNC_DB_NAME, ...await roomDatabaseNames()])
    await Promise.all([...names].map(deleteDatabase))
    try { localStorage.removeItem(ROOM_SYNCED_KEY) } catch { /* Storage blocked. */ }
    writeOwner(null)
    ownerCheck = null
  })()
  await bounded(work)
}
