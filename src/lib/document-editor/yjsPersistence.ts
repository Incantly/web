import { IndexeddbPersistence } from 'y-indexeddb'

/**
 * Crash-recovery persistence for the Yjs document (Yjs migration Phase 4).
 *
 * Persists Yjs updates to IndexedDB via `y-indexeddb`, ALONGSIDE the existing sync record —
 * never replacing it. The sync record remains the persistence source of truth on reload
 * (`shouldRestoreYjsSnapshot` in `yjsDegraded.ts`): a persisted snapshot is restored only when
 * the sync record has no pending work.
 *
 * P1 open contract: construct the `Y.Doc`, attach with `createYjsCrashPersistence`, await
 * `ready`, then seed from the head checkpoint when `rotated` is true (or when the doc is empty
 * and the sync record has pending work). Always `destroy()` on teardown. This module is
 * dependency-free apart from `y-indexeddb`: it never imports `yjs` (the doc passes through
 * opaquely) and degrades to `unavailable` when IndexedDB, storage, or the provider fails.
 */

/** The Yjs document type the provider binds to (opaque here; P1 owns the `yjs` import). */
export type YjsPersistableDoc = ConstructorParameters<typeof IndexeddbPersistence>[1]

type YjsIndexeddbStore = InstanceType<typeof IndexeddbPersistence>

/**
 * Snapshot names are keyed by user so accounts never mix (mirrors `syncKey`). Segments are
 * encoded so a future user-controlled ID can never collide two snapshots; server-issued cuid()
 * IDs encode to themselves, and any format change orphans old snapshots — safe by design, since
 * the sync record (not the snapshot) is the persistence source of truth on reload.
 */
export function yjsSnapshotName(userId: string, noteId: string): string {
  return `incantly:${encodeURIComponent(userId)}:${encodeURIComponent(noteId)}`
}

export type YjsCrashPersistence = {
  /**
   * `unavailable` means crash recovery is off for this open; saving still works through the fold/sync record.
   * `active` means only that the provider is attached — the snapshot has NOT necessarily settled.
   * The host MUST await `ready` before seeding or showing the doc.
   */
  status: 'active' | 'unavailable'
  /**
   * True when the room rotated since the snapshot was written. The host MUST reseed from the head
   * checkpoint (replace, never merge) and MUST NOT trust doc content: the provider constructor
   * starts applying the stored snapshot before the rotation discard below completes, so seeding
   * or showing without awaiting `ready` AND honoring `rotated` resurrects another room's content.
   */
  rotated: boolean
  /** Resolves once the snapshot has loaded (or been discarded after a rotation), or `unavailable` when persistence is off. The host MUST await this before seeding or showing the doc. */
  ready: Promise<'loaded' | 'unavailable'>
  destroy(): Promise<void>
  /** Discards the stored snapshot and its room marker. */
  clear(): Promise<void>
}

export type YjsCrashPersistenceOptions = {
  userId: string
  noteId: string
  /** Current room ID; scopes the snapshot to one room generation (never merge across rooms). */
  roomId: string
  doc: YjsPersistableDoc
  /** Max wait for the stored snapshot before detaching (default 2000 ms). */
  loadTimeoutMs?: number
}

/** Max wait for the stored snapshot before detaching and seeding from the checkpoint instead. */
const YJS_LOAD_TIMEOUT_MS = 2_000

const yjsRoomMarkerKey = (userId: string, noteId: string): string => `incantly-yjs-room:${encodeURIComponent(userId)}:${encodeURIComponent(noteId)}`

function readRoomMarker(key: string): string | null {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeRoomMarker(key: string, roomId: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, roomId)
  } catch {}
}

function removeRoomMarker(key: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key)
  } catch {}
}

/**
 * Attaches crash-recovery persistence to a Yjs document. Safe to call server-side (resolves
 * `unavailable`). Never throws: every failure mode — missing IndexedDB, a hung snapshot, a
 * broken provider — resolves `unavailable` and leaves saving to the fold/sync record.
 *
 * Host rules (cross-room safety): the provider constructor starts applying the stored snapshot
 * immediately, before the rotation discard settles — so the host MUST await `ready` before
 * seeding or showing the doc, and MUST reseed from the head checkpoint (replace, never merge)
 * when `rotated` is true. `status: 'active'` alone guarantees neither.
 */
export function createYjsCrashPersistence(options: YjsCrashPersistenceOptions): YjsCrashPersistence {
  const unavailable = (rotated: boolean): YjsCrashPersistence => ({
    status: 'unavailable',
    rotated,
    ready: Promise.resolve('unavailable'),
    destroy: () => Promise.resolve(),
    clear: () => Promise.resolve(),
  })
  if (typeof indexedDB === 'undefined') return unavailable(false)
  let store: YjsIndexeddbStore | null = null
  try {
    store = new IndexeddbPersistence(yjsSnapshotName(options.userId, options.noteId), options.doc)
  } catch {
    store = null
  }
  if (!store) return unavailable(false)
  const active = store
  const markerKey = yjsRoomMarkerKey(options.userId, options.noteId)
  // Never merge snapshots across rooms (Phase 6 threat): any room change — including an
  // unreadable marker, where losing a crash snapshot is safe and resurrecting another room's is
  // not — discards stored state and the host reseeds from the head checkpoint.
  const rotated = readRoomMarker(markerKey) !== options.roomId
  let timer: ReturnType<typeof setTimeout> | null = null
  let settle: ((value: 'loaded' | 'unavailable') => void) | null = null
  const ready = new Promise<'loaded' | 'unavailable'>((resolve) => { settle = resolve })
  let done = false
  const finish = (value: 'loaded' | 'unavailable'): void => {
    if (done) return
    done = true
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
    settle?.(value)
  }
  if (rotated) {
    // Same guard as the load path: a hung discard must not wedge the note open. On timeout the
    // provider is detached and the marker is left stale (see below), so the next open retries the
    // rotation instead of trusting the leftover snapshot.
    timer = setTimeout(() => {
      timer = null
      void (async () => {
        try { await active.destroy() } catch {}
      })()
      finish('unavailable')
    }, options.loadTimeoutMs ?? YJS_LOAD_TIMEOUT_MS)
    void (async () => {
      try { await active.clearData() } catch {}
      // Past the timeout the open already settled `unavailable` on a detached provider: leave the
      // marker stale so the next open re-discards, rather than blessing leftover state.
      if (done) return
      writeRoomMarker(markerKey, options.roomId)
      finish('loaded')
    })()
  } else {
    try {
      active.on('synced', () => finish('loaded'))
    } catch {
      finish('unavailable')
    }
    timer = setTimeout(() => {
      timer = null
      // A hung snapshot must not wedge the open: detach so late updates can never land on the
      // seeded doc, and seed from the checkpoint instead. Crash recovery is lost for this open;
      // stale content resurrecting over the seed would be worse.
      void (async () => {
        try { await active.destroy() } catch {}
      })()
      finish('unavailable')
    }, options.loadTimeoutMs ?? YJS_LOAD_TIMEOUT_MS)
  }
  return {
    status: 'active',
    rotated,
    ready,
    destroy: async () => {
      finish('unavailable')
      try { await active.destroy() } catch {}
    },
    clear: async () => {
      try { await active.clearData() } catch {}
      removeRoomMarker(markerKey)
    },
  }
}
