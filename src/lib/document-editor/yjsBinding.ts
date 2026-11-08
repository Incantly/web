import { useEffect, useRef, useState } from 'react'
import type { Room } from '@liveblocks/client'
import { LiveblocksYjsProvider } from '@liveblocks/yjs'
import type { Schema } from '@tiptap/pm/model'
import type { DocumentNode, DocumentOperation, IncantlyDocument } from '@incantly/canvas-core/document'
import * as Y from 'yjs'
import { prosemirrorJSONToYXmlFragment } from 'y-prosemirror'
import type { CollabMode } from '../api/live'
import { incantlyBlocksToProseMirror, incantlyDocumentToProseMirror } from './conversion'
import { foldYjsToCanonical } from './yjsFold'
import { dropYjsPatchHost, registerYjsPatchHost, type YjsPatchHost } from './yjsPatch'

/**
 * Phase 1 Yjs binding: one `Y.Doc` per open `yjs` note, synced through the
 * note's existing Liveblocks room and rendered by the Tiptap `Collaboration`
 * extension (registered in `schema/extensions.ts`).
 *
 * The binding is convergence only. Persistence flows through `noteSync` via the
 * fold writer (`useYjsFoldWriter`, constructed by the screen — not here): the
 * screen records legacy editor transactions only while the fold is not live,
 * and transactions the binding applied from Yjs (`isChangeOrigin`, see
 * DocumentEditor) advance the canonical document without recording — the peer
 * that typed them already submitted them.
 */

/** The text fragment Tiptap binds to (the Collaboration extension's default field). */
export const YJS_TEXT_FIELD = 'default'

/**
 * Applies one canonical top-level block operation to a live fragment. Block
 * identity is the `id` attribute (canonical `node.id` round-trips through
 * ProseMirror attrs into Yjs attributes 1:1). Anything unmappable throws and
 * the caller fails closed to the legacy reload.
 */
function blockIndexById(fragment: Y.XmlFragment, nodeId: string): number {
  const children = fragment.toArray()
  for (let index = 0; index < children.length; index++) {
    const child = children[index]
    if (child instanceof Y.XmlElement && child.getAttribute('id') === nodeId) return index
  }
  return -1
}

/** Converts one canonical block to an unintegrated Yjs element, ready to insert. */
function canonicalNodeToYjsElement(schema: Schema, node: DocumentNode): Y.XmlElement {
  const converted = incantlyBlocksToProseMirror([node])
  const json = converted[0]
  if (!json) throw new Error('[yjs-binding] patch node conversion returned nothing')
  const staging = new Y.XmlFragment()
  prosemirrorJSONToYXmlFragment(schema, { type: 'doc', content: [json] }, staging)
  const staged = staging.toArray()
  const first = staged[0]
  if (!(first instanceof Y.XmlElement) || staged.length !== 1) {
    throw new Error('[yjs-binding] patch node conversion returned no single element')
  }
  return first.clone()
}

function applyCanonicalOperation(fragment: Y.XmlFragment, schema: Schema, operation: DocumentOperation): void {
  switch (operation.type) {
    case 'deleteNode': {
      const index = blockIndexById(fragment, operation.nodeId)
      if (index < 0) throw new Error(`[yjs-binding] patch target missing: ${operation.nodeId}`)
      fragment.delete(index, 1)
      return
    }
    case 'insertNode': {
      if (operation.index < 0 || operation.index > fragment.length) {
        throw new Error('[yjs-binding] patch insert index out of range')
      }
      fragment.insert(operation.index, [canonicalNodeToYjsElement(schema, operation.node)])
      return
    }
    case 'updateNode': {
      const index = blockIndexById(fragment, operation.nodeId)
      if (index < 0) throw new Error(`[yjs-binding] patch target missing: ${operation.nodeId}`)
      const replacement = canonicalNodeToYjsElement(schema, operation.node)
      fragment.delete(index, 1)
      fragment.insert(index, [replacement])
      return
    }
    case 'moveNode': {
      const from = blockIndexById(fragment, operation.nodeId)
      if (from < 0 || operation.index < 0 || operation.index >= fragment.length) {
        throw new Error('[yjs-binding] patch move out of range')
      }
      const current = fragment.toArray()[from]
      if (!(current instanceof Y.XmlElement)) throw new Error('[yjs-binding] patch move target is not an element')
      // Insert the clone first so the target index keeps its mine-order meaning,
      // then delete the original (shifted by one when it sat at/after the target).
      fragment.insert(operation.index, [current.clone()])
      fragment.delete(from >= operation.index ? from + 1 : from, 1)
      return
    }
    default:
      // setPageSetup and any future op kind: the planner only emits content ops
      // on the patch path, so anything else fails closed to the legacy reload.
      throw new Error('[yjs-binding] patch operation not supported without reseed')
  }
}

/** How long a seed waits for room state before assuming the room is empty. */
const YJS_SYNC_TIMEOUT_MS = 10_000
const YJS_SYNC_POLL_MS = 50
/**
 * Encoded room-state budget for the first seed. Past this the state can only
 * be hostile or corrupt (an order of magnitude past the fold's 10M-char text
 * budget): the seed skips the fold compare and re-converges straight to the
 * trusted checkpoint. This bounds seed-time work, not the pre-seed render —
 * bind-after-sync hardening stays a Phase 6 item.
 */
const MAX_PRESEED_STATE_BYTES = 32_000_000

export type YjsSeedOutcome = 'seeded' | 'existing' | 'reseeded'

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** Key-order-independent JSON comparison; `undefined` fields compare as absent, as in JSON. */
function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`
}

export interface YjsNoteBinding {
  readonly noteId: string
  /**
   * Binding generation: bumped whenever room rotation recreates the binding.
   * The editor keys on this (with the binding's doc) so rotation remounts the
   * editor onto a freshly seeded doc instead of orphaning it on the old one.
   */
  readonly epoch: number
  /** The note's Yjs document. Phase 2 reads this for the canonical fold. */
  readonly doc: Y.Doc
  /** The text fragment Tiptap binds to. */
  readonly fragment: Y.XmlFragment
  readonly field: string
  /**
   * Attaches the live-collab room's Yjs provider, replacing any previous one.
   * Null detaches (idle leave, degraded): the doc keeps its state and editing
   * continues locally through noteSync. Re-attach to the same room merges
   * (correct: same CRDT state); rotation into a new room recreates the whole
   * binding (see the hook's room epoch) so the new room reseeds from head.
   */
  attachRoom(room: Room | null): void
  /** The editor's live canonical document (the diff base for server patches). */
  setCurrentDocumentSource(source: () => IncantlyDocument | null): void
  /**
   * Seeds the fragment from the head checkpoint: populates when empty, keeps
   * room state that already matches it, and re-converges anything else to it
   * (today's reload semantics), so a mount can never render ProseMirror ahead
   * of the canonical document it maps against.
   */
  seedFromCheckpoint(schema: Schema, document: IncantlyDocument): YjsSeedOutcome
  /**
   * `seedFromCheckpoint` after the provider syncs, so the first seed never
   * duplicates room state as independent items. Without a provider (degraded)
   * it seeds immediately. Past the timeout it proceeds anyway; the next
   * checkpoint cycle reconciles through the same compare-and-reseed.
   */
  seedWhenSynced(schema: Schema, document: IncantlyDocument, options?: { timeoutMs?: number; signal?: AbortSignal }): Promise<YjsSeedOutcome>
  /** Full replace from a canonical document (restore, conflict reload). One undo step, never a merge. */
  reseed(document: IncantlyDocument): void
  destroy(): void
}

/**
 * Creates the note's Yjs doc and fragment. No room traffic until `attachRoom`;
 * no editor binding until the host registers `Collaboration` on `doc`.
 */
export function createYjsNoteBinding(noteId: string, epoch = 0): YjsNoteBinding {
  const doc = new Y.Doc()
  const fragment = doc.getXmlFragment(YJS_TEXT_FIELD)
  let provider: LiveblocksYjsProvider | null = null
  let providerRoom: Room | null = null
  let schema: Schema | null = null
  let currentDocument: (() => IncantlyDocument | null) | null = null
  let seeded = false
  let destroyed = false

  const populate = (nextSchema: Schema, document: IncantlyDocument): void => {
    const json = incantlyDocumentToProseMirror(document).value
    doc.transact(() => {
      if (fragment.length > 0) fragment.delete(0, fragment.length)
      prosemirrorJSONToYXmlFragment(nextSchema, json, fragment)
    })
  }

  const fragmentMatchesDocument = (document: IncantlyDocument): boolean => {
    // The fold reads the same y-prosemirror layout the seed writes; an
    // unreadable fragment (hostile room content, budget overrun) loses to the
    // trusted checkpoint instead of rendering.
    const folded = foldYjsToCanonical(fragment, document)
    if (!folded.ok) return false
    return stableJson({ ...folded.document, updatedAt: '' }) === stableJson({ ...document, updatedAt: '' })
  }

  const registerIfLive = (): void => {
    if (seeded && provider && !destroyed) registerYjsPatchHost(host)
  }

  const seedFromCheckpoint = (nextSchema: Schema, document: IncantlyDocument): YjsSeedOutcome => {
    schema = nextSchema
    if (destroyed) return 'existing'
    if (fragment.length === 0) {
      populate(nextSchema, document)
      seeded = true
      registerIfLive()
      return 'seeded'
    }
    seeded = true
    if (fragmentMatchesDocument(document)) {
      registerIfLive()
      return 'existing'
    }
    populate(nextSchema, document)
    registerIfLive()
    return 'reseeded'
  }

  const seedWhenSynced = async (nextSchema: Schema, document: IncantlyDocument, options: { timeoutMs?: number; signal?: AbortSignal } = {}): Promise<YjsSeedOutcome> => {
    schema = nextSchema
    const started = provider
    if (started) {
      const deadline = Date.now() + (options.timeoutMs ?? YJS_SYNC_TIMEOUT_MS)
      while (provider === started && !started.synced) {
        if (options.signal?.aborted) throw new DOMException('Yjs seeding aborted', 'AbortError')
        if (Date.now() >= deadline) break
        await sleep(YJS_SYNC_POLL_MS)
      }
      if (options.signal?.aborted) throw new DOMException('Yjs seeding aborted', 'AbortError')
    } else if (options.signal?.aborted) {
      throw new DOMException('Yjs seeding aborted', 'AbortError')
    }
    if (provider != null && fragment.length > 0 && Y.encodeStateAsUpdate(doc).length > MAX_PRESEED_STATE_BYTES) {
      // Hostile or corrupt room state: the fold's own budgets would refuse it
      // anyway, so skip the compare and re-converge to the trusted checkpoint.
      schema = nextSchema
      populate(nextSchema, document)
      seeded = true
      registerIfLive()
      return 'reseeded'
    }
    return seedFromCheckpoint(nextSchema, document)
  }

  const reseed = (document: IncantlyDocument): void => {
    if (destroyed) return
    const cached = schema
    if (!cached) throw new Error('[yjs-binding] reseed before the editor schema was set')
    populate(cached, document)
    seeded = true
    registerIfLive()
  }

  const attachRoom = (room: Room | null): void => {
    if (destroyed || room === providerRoom) return
    provider?.destroy()
    provider = null
    providerRoom = null
    // Cross-room isolation is a Phase 4 dependency, not a property of this
    // attach: the same Y.Doc re-attaches to the new provider, so prior room
    // state still converges into the new room at the CRDT level until the P4
    // rejoin reseed-from-head lands. At least the patch host never
    // re-registers without a fresh seed (seeded resets here), so server
    // patches fall back to the legacy reload instead of diffing merged state.
    dropYjsPatchHost(noteId)
    seeded = false
    if (!room) return
    provider = new LiveblocksYjsProvider(room, doc)
    providerRoom = room
    registerIfLive()
  }

  const host: YjsPatchHost = {
    noteId,
    currentDocument: () => (destroyed ? null : currentDocument?.() ?? null),
    applyOperations: (operations) => {
      if (destroyed) throw new Error('[yjs-binding] binding is destroyed')
      const cached = schema
      if (!cached) throw new Error('[yjs-binding] binding has no schema yet')
      if (!seeded) throw new Error('[yjs-binding] binding is not seeded')
      // One atomic Yjs transaction: peers converge on a single update and the
      // local editor reconciles through y-prosemirror without remounting.
      // Anything unmappable throws and the patch fails closed to the legacy
      // reload, which reseeds this fragment from the head (wiping any partial
      // application: Yjs transact does not roll back).
      doc.transact(() => {
        for (const operation of operations) applyCanonicalOperation(fragment, cached, operation)
      })
    },
    reseed,
  }

  return {
    noteId,
    epoch,
    doc,
    fragment,
    field: YJS_TEXT_FIELD,
    attachRoom,
    setCurrentDocumentSource: (source: () => IncantlyDocument | null) => { currentDocument = source },
    seedFromCheckpoint,
    seedWhenSynced,
    reseed,
    destroy: () => {
      if (destroyed) return
      destroyed = true
      dropYjsPatchHost(noteId)
      provider?.destroy()
      provider = null
      providerRoom = null
      doc.destroy()
    },
  }
}

/**
 * The open note's Yjs binding, or null on the legacy path. Creation waits for
 * the room (or a settled degraded verdict) so the first seed never races room
 * state; later room flaps only re-attach. Recreated per note and flag change,
 * never per document identity — a takeServer remount reuses the doc.
 */
export function useYjsNoteBinding(options: {
  noteId: string
  /** Head checkpoint document from the session loader; the Yjs seed source. */
  seed: IncantlyDocument | null
  room: Room | null
  /** The room entered, or live-status settled on degraded: creation waits for this, destruction ignores it. */
  roomSettled: boolean
  collabMode: CollabMode | null
}): YjsNoteBinding | null {
  const { noteId, seed, room, roomSettled, collabMode } = options
  const [binding, setBinding] = useState<YjsNoteBinding | null>(null)
  const [bound, setBound] = useState(false)
  const latest = useRef({ room })
  latest.current = { room }
  const wanted = collabMode === 'yjs' && seed != null
  // Latch during render (idempotent, no effect): opens once the first seed is
  // safe, closes only when the note stops wanting a binding.
  if (!wanted && bound) setBound(false)
  else if (wanted && roomSettled && !bound) setBound(true)
  // Room rotation hands this hook a new Room object (reconnects reuse the
  // cached instance). A new room must reseed from the head checkpoint, never
  // merge prior-room CRDT state into it — so rotation recreates the binding.
  const prevRoomRef = useRef<Room | null>(null)
  const [roomEpoch, setRoomEpoch] = useState(0)
  useEffect(() => {
    const prev = prevRoomRef.current
    prevRoomRef.current = room
    if (prev && room && prev !== room) setRoomEpoch((epoch) => epoch + 1)
  }, [room])
  useEffect(() => {
    if (!bound) return
    const created = createYjsNoteBinding(noteId, roomEpoch)
    created.attachRoom(latest.current.room)
    setBinding(created)
    return () => { created.destroy(); setBinding(null) }
  }, [bound, noteId, roomEpoch])
  useEffect(() => { binding?.attachRoom(room) }, [binding, room])
  return bound ? binding : null
}
