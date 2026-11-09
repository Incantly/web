import type { Room } from '@liveblocks/client'
import { LiveblocksYjsProvider } from '@liveblocks/yjs'
import type { Schema } from '@tiptap/pm/model'
import { createDocumentNodeId, type DocumentNode, type DocumentOperation, type IncantlyDocument } from '@incantly/canvas-core/document'
import * as Y from 'yjs'
import { prosemirrorJSONToYXmlFragment, yXmlFragmentToProseMirrorRootNode } from 'y-prosemirror'
import { IndexeddbPersistence } from 'y-indexeddb'
import { diffDocuments } from '../notes/documentDiff'
import { incantlyBlocksToProseMirror, proseMirrorToIncantlyDocument } from './conversion'

/**
 * Live notes (`collabMode: 'yjs'`): one `Y.Doc` and one Liveblocks provider per
 * open note and entered room. The room is the only place edits are written;
 * Incantly's durable copy is checkpointed by the server from the room.
 *
 * Contract (docs/arch/live-autosave.md in the backend):
 * - `XmlFragment` `default`: the Tiptap document, each block carrying its stable
 *   Incantly node ID as the `id` attribute.
 * - `Map` `meta`, key `title`: the note title as a plain string.
 * - The server seeds rooms inside authorize. This module never seeds,
 *   populates or replaces a room, and a doc is only ever attached to the room
 *   it was created with: a new room (rotation, rejoin) gets a fresh binding.
 * - A doc may be created for a room ID before that room is entered (`openYjsRoomCopy`):
 *   it loads the room's own offline copy, and only a Room with exactly that ID adopts it.
 */

/** The text fragment Tiptap binds to (the Collaboration extension's default field). */
export const YJS_TEXT_FIELD = 'default'
/** The shared map holding note-level values. */
export const YJS_META_MAP = 'meta'
/** `meta` key for the note title. */
export const YJS_TITLE_KEY = 'title'
/** Mirrors the title input's limit (in code points, as the server counts); longer room values are cut. */
export const MAX_LIVE_TITLE_LENGTH = 300

/** `loading` until the server's first sync; `synchronizing` while local updates are unacknowledged. */
export type YjsBindingStatus = 'loading' | 'synchronizing' | 'synchronized'

/** What loading the room's offline copy from IndexedDB found: still reading, nothing (or blank), or content. */
export type YjsOfflineState = 'loading' | 'empty' | 'loaded'

/** What every doc the editor can show offers, whether or not its room is entered yet. */
export interface YjsRoomDoc {
  /** Unique per doc: the editor keys on it. An adopted copy keeps its ID, so the editor stays mounted. */
  readonly id: number
  readonly noteId: string
  readonly roomId: string
  readonly doc: Y.Doc
  readonly fragment: Y.XmlFragment
  readonly field: string
  /** The offline copy's load result; it never changes after `loading`. */
  offlineState(): YjsOfflineState
  onOfflineState(listener: (state: YjsOfflineState) => void): () => void
  /** True once a local edit landed in this doc (typing, a rename, a merge). */
  edited(): boolean
  /**
   * Whether this doc's offline copy may be edited before the room's first server sync: the
   * room synchronized on this device recently, or the browser is offline (decided at open).
   */
  readonly offlineTrusted: boolean
  /**
   * This device's edits since the offline copy loaded, as top-level operations against what
   * loaded (each update or delete carries the loaded block, so it applies only where nobody
   * changed it). For a doc that never reached its room (its room ID changed): the caller
   * carries them into the new room with `applyCarryOver`. Empty when nothing was typed.
   */
  strandedEdits(schema: Schema): CarryOverEdit[]
  /** The server's emptiness rule: no blocks, or only paragraphs and headings without text. */
  isEmpty(): boolean
  /** The room's title (`meta.title`), trimmed and length-limited; null when absent or not a string. */
  readTitle(): string | null
  /** Writes `meta.title`. Blank titles are ignored. */
  writeTitle(title: string): void
  /** Runs `listener` whenever `meta.title` changes (locally or from a peer); returns an unsubscribe. */
  onTitle(listener: (title: string | null) => void): () => void
  destroy(): void
}

/**
 * A room's doc before its Room is entered: created for one room ID, it loads only that room's
 * own offline copy (the IndexedDB database Liveblocks names after the room ID) and persists
 * local edits there. It never talks to a server. `createYjsNoteBinding` adopts it only for a
 * Room with exactly the same ID; otherwise the caller destroys it.
 */
export interface YjsRoomCopy extends YjsRoomDoc {
  readonly kind: 'copy'
  /** Replaces the local-update callback (adoption hands it to the room's acknowledgement tracking). */
  setOnLocalUpdate(listener: (() => void) | undefined): void
}

/**
 * One carried-over legacy edit. `head` is the block as the head checkpoint had it: an update
 * or delete applies only while the room's block still equals it (nobody changed it since).
 * Without `head` (an older base) an update never replaces the room's block.
 */
export type CarryOverEdit = { operation: DocumentOperation; head: DocumentNode | null }

export interface YjsNoteBinding extends YjsRoomDoc {
  readonly kind: 'room'
  /** The entered Room this doc was created for; it is never attached to any other. */
  readonly room: Room
  status(): YjsBindingStatus
  /** Runs `listener` on every provider status change; returns an unsubscribe. */
  onStatus(listener: (status: YjsBindingStatus) => void): () => void
  /**
   * Applies this user's own unsent legacy edits as one Yjs update (after `409 NOTE_IS_LIVE`).
   * Inserts whose node ID is already in the room are no-ops, targets someone deleted are
   * skipped, and an update to a block someone else changed is added below it as a new block
   * with fresh IDs instead of replacing their text. Returns how many edits were added below.
   */
  applyCarryOver(schema: Schema, edits: readonly CarryOverEdit[]): { addedBelow: number }
  /**
   * Same-room rejoin: merges this user's updates from the previous doc for the same room ID
   * (never across room IDs) before the new doc is shown.
   */
  mergeFrom(previous: YjsNoteBinding | YjsRoomCopy): void
  /** Deletes this room's offline copy from IndexedDB (sign-out). */
  clearOfflineData(): Promise<void>
}

const liveBindings = new Set<YjsNoteBinding>()
/** Copies not adopted yet (sign-out deletes their offline data too). */
const openCopies = new Set<YjsRoomCopy>()
let nextBindingId = 1

/** What adoption takes over from a copy: its persistence and listeners. Never exposed. */
type CopyInternals = {
  persistence: IndexeddbPersistence
  adopted: boolean
  destroyed: boolean
}

/** A fragment as a canonical document (null when it cannot be read with this schema). */
function fragmentDocument(fragment: Y.XmlFragment, schema: Schema): IncantlyDocument | null {
  try {
    return proseMirrorToIncantlyDocument(yXmlFragmentToProseMirrorRootNode(fragment, schema).toJSON()).value
  } catch {
    return null
  }
}

/**
 * Edits between two states of the same doc, as carry-over edits: same base, so each update or
 * delete carries the base block and applies only while the target room still has it.
 */
export function editsSince(base: IncantlyDocument, current: IncantlyDocument): CarryOverEdit[] {
  const baseBlocks = new Map<string, DocumentNode>(base.content.map((node) => [node.id, node]))
  const edits: CarryOverEdit[] = []
  for (const operation of diffDocuments(base, current).content) {
    if (operation.type === 'insertNode' || operation.type === 'moveNode') edits.push({ operation, head: null })
    else if (operation.type === 'updateNode' || operation.type === 'deleteNode') edits.push({ operation, head: baseBlocks.get(operation.nodeId) ?? null })
  }
  return edits
}
const copyInternals = new WeakMap<YjsRoomCopy, CopyInternals>()

/** Sanitizes an untrusted room title for display, cutting by code points like the server. */
function cleanTitle(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = Array.from(value.trim()).slice(0, MAX_LIVE_TITLE_LENGTH).join('').trim()
  return trimmed || null
}

/** Mirrors the backend `isRoomDocumentEmpty`. */
function isFragmentEmpty(fragment: Y.XmlFragment): boolean {
  return fragment.toArray().every((block) => {
    if (!(block instanceof Y.XmlElement) || (block.nodeName !== 'paragraph' && block.nodeName !== 'heading')) return false
    return block.toArray().every((child) => child instanceof Y.XmlText && child.length === 0)
  })
}

function blockIndexById(fragment: Y.XmlFragment, nodeId: string): number {
  const children = fragment.toArray()
  for (let index = 0; index < children.length; index++) {
    const child = children[index]
    if (child instanceof Y.XmlElement && child.getAttribute('id') === nodeId) return index
  }
  return -1
}

/** A canonical block as an integrated scratch fragment (readable, unlike a detached one). */
function stagedBlock(schema: Schema, node: DocumentNode): Y.XmlFragment | null {
  const json = incantlyBlocksToProseMirror([node])[0]
  if (!json) return null
  const staging = new Y.Doc().getXmlFragment('staging')
  prosemirrorJSONToYXmlFragment(schema, { type: 'doc', content: [json] }, staging)
  return staging.length === 1 && staging.toArray()[0] instanceof Y.XmlElement ? staging : null
}

/** Converts one canonical block to an unintegrated Yjs element, ready to insert. */
function canonicalNodeToYjsElement(schema: Schema, node: DocumentNode): Y.XmlElement | null {
  const first = stagedBlock(schema, node)?.toArray()[0]
  return first instanceof Y.XmlElement ? first.clone() : null
}

/** Whether a room block still holds exactly the given canonical block (compared as ProseMirror nodes). */
function blockEquals(schema: Schema, element: Y.XmlElement, node: DocumentNode): boolean {
  try {
    const expected = stagedBlock(schema, node)
    if (!expected) return false
    const actual = new Y.Doc().getXmlFragment('staging')
    actual.insert(0, [element.clone()])
    return yXmlFragmentToProseMirrorRootNode(expected, schema).eq(yXmlFragmentToProseMirrorRootNode(actual, schema))
  } catch {
    return false
  }
}

/** A copy of a block with fresh node IDs throughout (it is added next to the original, never replacing it). */
function withFreshIds(node: DocumentNode): DocumentNode {
  const copy = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(copy)
    if (value === null || typeof value !== 'object') return value
    const entries = Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, key === 'content' ? copy(item) : item])
    const result = Object.fromEntries(entries) as Record<string, unknown>
    if (typeof result.id === 'string') result.id = createDocumentNodeId()
    return result
  }
  return copy(node) as DocumentNode
}

const clampIndex = (index: number, length: number) => Math.max(0, Math.min(Number.isInteger(index) ? index : length, length))

function applyCarryOverEdit(fragment: Y.XmlFragment, schema: Schema, edit: CarryOverEdit): 'applied' | 'added-below' | 'skipped' {
  const { operation, head } = edit
  // Only top-level block operations: anything nested or unknown is skipped, never guessed.
  if ('parentId' in operation && operation.parentId !== undefined) return 'skipped'
  switch (operation.type) {
    case 'insertNode': {
      if (blockIndexById(fragment, operation.node.id) >= 0) return 'skipped'
      const element = canonicalNodeToYjsElement(schema, operation.node)
      if (!element) return 'skipped'
      fragment.insert(clampIndex(operation.index, fragment.length), [element])
      return 'applied'
    }
    case 'updateNode': {
      const index = blockIndexById(fragment, operation.nodeId)
      if (index < 0) return 'skipped'
      const current = fragment.toArray()[index]
      if (!(current instanceof Y.XmlElement)) return 'skipped'
      if (head && blockEquals(schema, current, head)) {
        const element = canonicalNodeToYjsElement(schema, operation.node)
        if (!element) return 'skipped'
        fragment.delete(index, 1)
        fragment.insert(index, [element])
        return 'applied'
      }
      // Someone else changed this block: keep their text and add this version below it.
      const element = canonicalNodeToYjsElement(schema, withFreshIds(operation.node))
      if (!element) return 'skipped'
      fragment.insert(index + 1, [element])
      return 'added-below'
    }
    case 'deleteNode': {
      const index = blockIndexById(fragment, operation.nodeId)
      if (index < 0 || !head) return 'skipped'
      const current = fragment.toArray()[index]
      if (!(current instanceof Y.XmlElement) || !blockEquals(schema, current, head)) return 'skipped'
      fragment.delete(index, 1)
      return 'applied'
    }
    case 'moveNode': {
      const from = blockIndexById(fragment, operation.nodeId)
      if (from < 0) return 'skipped'
      const current = fragment.toArray()[from]
      if (!(current instanceof Y.XmlElement)) return 'skipped'
      const copy = current.clone()
      fragment.delete(from, 1)
      // The index is evaluated after removal.
      fragment.insert(clampIndex(operation.index, fragment.length), [copy])
      return 'applied'
    }
    default:
      return 'skipped'
  }
}

/**
 * Opens a fresh doc for one room ID and loads that room's own offline copy into it (read
 * from IndexedDB; nothing is fetched, seeded or sent). Local edits are persisted to the same
 * copy and reach the room once a Room with this exact ID adopts the doc and syncs.
 */
export function openYjsRoomCopy(noteId: string, roomId: string, options: {
  /** A local-origin update (not the server's, not the offline copy loading): the room has unsaved edits. */
  onLocalUpdate?: () => void
  /** See `YjsRoomDoc.offlineTrusted` (default false: read-only until the first sync). */
  offlineTrusted?: boolean
} = {}): YjsRoomCopy {
  const doc = new Y.Doc()
  const fragment = doc.getXmlFragment(YJS_TEXT_FIELD)
  const meta = doc.getMap<unknown>(YJS_META_MAP)
  const persistence = new IndexeddbPersistence(roomId, doc)
  const internals: CopyInternals = { persistence, adopted: false, destroyed: false }
  let state: YjsOfflineState = 'loading'
  let edited = false
  let onLocalUpdate = options.onLocalUpdate
  /** The doc as its offline copy loaded it: the base local edits are measured against. */
  let baseline: Uint8Array | null = null
  const listeners = new Set<(state: YjsOfflineState) => void>()
  // Server updates arrive with origin `backend` and offline loads with an IndexedDB persistence
  // as origin (this one, or the provider's after adoption); everything else was made here.
  doc.on('update', (_update: Uint8Array, origin: unknown) => {
    if (origin === 'backend' || origin instanceof IndexeddbPersistence) return
    edited = true
    onLocalUpdate?.()
  })
  void persistence.whenSynced.then(() => {
    if (internals.destroyed || state !== 'loading') return
    baseline = Y.encodeStateAsUpdate(doc)
    state = isFragmentEmpty(fragment) ? 'empty' : 'loaded'
    for (const listener of [...listeners]) listener(state)
    // Adopted meanwhile: the provider's own persistence owns the copy from here on.
    if (internals.adopted) void persistence.destroy()
  })

  const copy: YjsRoomCopy = {
    kind: 'copy',
    id: nextBindingId++,
    noteId,
    roomId,
    doc,
    fragment,
    field: YJS_TEXT_FIELD,
    offlineState: () => state,
    onOfflineState: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    edited: () => edited,
    offlineTrusted: options.offlineTrusted === true,
    setOnLocalUpdate: (listener) => { onLocalUpdate = listener },
    strandedEdits: (schema) => {
      if (!edited || internals.destroyed && !internals.adopted) return []
      const base = new Y.Doc()
      if (baseline) Y.applyUpdate(base, baseline)
      const before = fragmentDocument(base.getXmlFragment(YJS_TEXT_FIELD), schema)
      const after = fragmentDocument(fragment, schema)
      base.destroy()
      return before && after ? editsSince(before, after) : []
    },
    isEmpty: () => isFragmentEmpty(fragment),
    readTitle: () => cleanTitle(meta.get(YJS_TITLE_KEY)),
    writeTitle: (title) => {
      const next = cleanTitle(title)
      if (internals.destroyed || !next || next === cleanTitle(meta.get(YJS_TITLE_KEY))) return
      doc.transact(() => meta.set(YJS_TITLE_KEY, next))
    },
    onTitle: (listener) => {
      const handler = (event: Y.YMapEvent<unknown>) => { if (event.keysChanged.has(YJS_TITLE_KEY)) listener(cleanTitle(meta.get(YJS_TITLE_KEY))) }
      meta.observe(handler)
      return () => meta.unobserve(handler)
    },
    destroy: () => {
      // After adoption the binding owns the doc: destroying it is the binding's job.
      if (internals.destroyed || internals.adopted) return
      internals.destroyed = true
      openCopies.delete(copy)
      listeners.clear()
      void persistence.destroy()
      doc.destroy()
    },
  }
  copyInternals.set(copy, internals)
  openCopies.add(copy)
  return copy
}

/**
 * Creates the note's provider for one entered room, on the room's copy when one was opened
 * for exactly this room ID (`copy`), otherwise on a copy opened now. The provider persists
 * updates offline (Liveblocks `offlineSupport_experimental`, an IndexedDB database named
 * after the room ID), so edits made while disconnected survive a reload and sync on reconnect.
 * Throws when `copy` belongs to another room ID or was destroyed or adopted already: a doc is
 * never attached to a room it was not created for.
 */
export function createYjsNoteBinding(noteId: string, room: Room, options: {
  /** A local-origin update (not the server's, not the offline copy loading): the room has unsaved edits. */
  onLocalUpdate?: () => void
  /** The room's doc opened before entering; adopted in place (same doc, same ID). */
  copy?: YjsRoomCopy
  /** For a doc opened here: see `YjsRoomDoc.offlineTrusted`. */
  offlineTrusted?: boolean
} = {}): YjsNoteBinding {
  const copy = options.copy ?? openYjsRoomCopy(noteId, room.id, { onLocalUpdate: options.onLocalUpdate, offlineTrusted: options.offlineTrusted })
  const internals = copyInternals.get(copy)
  if (!internals || internals.destroyed || internals.adopted || copy.roomId !== room.id || copy.noteId !== noteId) {
    throw new Error('A room doc can only be attached to the room it was created for')
  }
  internals.adopted = true
  openCopies.delete(copy)
  // From here local edits wait for this room's acknowledgement, not the copy's leave guard.
  copy.setOnLocalUpdate(options.onLocalUpdate)
  const { doc, fragment } = copy
  const provider = new LiveblocksYjsProvider(room, doc, { offlineSupport_experimental: true })
  // The provider now persists the doc itself; the copy's own persistence stops once its load finished.
  if (copy.offlineState() !== 'loading') void internals.persistence.destroy()
  let destroyed = false

  const binding: YjsNoteBinding = {
    kind: 'room',
    id: copy.id,
    noteId,
    room,
    roomId: room.id,
    doc,
    fragment,
    field: YJS_TEXT_FIELD,
    offlineState: copy.offlineState,
    onOfflineState: copy.onOfflineState,
    edited: copy.edited,
    offlineTrusted: copy.offlineTrusted,
    strandedEdits: (schema) => (destroyed ? [] : copy.strandedEdits(schema)),
    status: () => provider.getStatus(),
    onStatus: (listener) => {
      const handler = () => { if (!destroyed) listener(provider.getStatus()) }
      provider.on('status', handler)
      return () => provider.off('status', handler)
    },
    isEmpty: copy.isEmpty,
    readTitle: copy.readTitle,
    writeTitle: (title) => { if (!destroyed) copy.writeTitle(title) },
    onTitle: copy.onTitle,
    applyCarryOver: (schema, edits) => {
      let addedBelow = 0
      if (destroyed || edits.length === 0) return { addedBelow }
      doc.transact(() => {
        for (const edit of edits) if (applyCarryOverEdit(fragment, schema, edit) === 'added-below') addedBelow += 1
      })
      return { addedBelow }
    },
    mergeFrom: (previous) => {
      if (destroyed || previous.doc === doc || previous.roomId !== room.id) return
      try {
        Y.applyUpdate(doc, Y.encodeStateAsUpdate(previous.doc, Y.encodeStateVector(doc)), 'rejoin-merge')
      } catch {
        // A destroyed previous doc has nothing left to merge; its offline copy already holds the edits.
      }
    },
    clearOfflineData: () => provider.clearOfflineData().catch(() => undefined),
    destroy: () => {
      if (destroyed) return
      destroyed = true
      internals.destroyed = true
      liveBindings.delete(binding)
      // Destroying the provider also destroys the doc (its handler owns it), and the doc's
      // destroy closes any persistence still attached to it.
      provider.destroy()
      doc.destroy()
    },
  }
  liveBindings.add(binding)
  return binding
}

/**
 * Access lost: deletes the offline data of every unadopted copy of this room ID and destroys
 * it, so nothing of a room the user can no longer open stays editable or on disk.
 */
export async function discardRoomCopies(roomId: string): Promise<void> {
  await Promise.all([...openCopies].filter((copy) => copy.roomId === roomId).map(async (copy) => {
    await copyInternals.get(copy)?.persistence.clearData().catch(() => undefined)
    copy.destroy()
  }))
}

/** Sign-out: deletes the offline copy of every open live note and destroys its binding or unadopted copy. */
export async function clearOpenYjsBindings(): Promise<void> {
  const open = [...liveBindings]
  const copies = [...openCopies]
  await Promise.all([
    ...open.map(async (binding) => {
      await binding.clearOfflineData()
      binding.destroy()
    }),
    ...copies.map(async (copy) => {
      const internals = copyInternals.get(copy)
      // clearData also closes the persistence; the doc goes with the copy.
      await internals?.persistence.clearData().catch(() => undefined)
      copy.destroy()
    }),
  ])
}
