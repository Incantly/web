'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { Editor } from '@tiptap/core'
import type { Schema } from '@tiptap/pm/model'
import type { IncantlyDocument } from '@incantly/canvas-core/document'
import { useCurrentUser } from '@/components/product/SessionGate'
import { setLeaveGuard } from '@/components/product/workspace/leaveGuard'
import { markLiveLocalUpdate, whenSynchronized } from '@/components/product/workspace/liveblocksClient'
import { deleteOlderRoomGenerations, discardRoomOfflineData, prepareLiveOfflineData, readRoomSyncedAt, recordRoomSynced } from '@/components/product/workspace/localNoteData'
import { isOfflineCopyFresh, liveDocReadiness, type OfflineCopyState } from '@/components/product/workspace/noteOpenModel'
import type { NoteSession } from '@/components/product/workspace/useNoteSession'
import { useLiveCollab } from '@/hooks/use-live-collab'
import { warmFigureSources } from '@/lib/document-editor/figures'
import { createYjsNoteBinding, openYjsRoomCopy, type CarryOverEdit, type YjsNoteBinding, type YjsRoomCopy, type YjsRoomDoc } from '@/lib/document-editor/yjsBinding'
import { forgetNoteOpen } from '@/lib/notes/noteOpenCache'

/**
 * - `connecting`: no room entered yet.
 * - `paused`: live-status says this user cannot join (paused, full, unavailable): the note
 *   shows the polled head checkpoint read-only. It never falls back to transactions.
 * - `loading`: the room's doc has not finished its first server sync, and its own offline copy
 *   (for the room ID being joined) did not load any content.
 * - `seeding`: the room is empty but the note is not; re-authorizing once so the server seeds it.
 * - `ready`: the editor binds to the room's doc (editable while attached). That is after the
 *   first server sync, or earlier when the doc's own offline copy for the room ID being joined
 *   loaded non-empty: the same CRDT doc, so edits made before the sync merge on connect.
 */
export type LiveNotePhase = 'connecting' | 'paused' | 'loading' | 'seeding' | 'ready'

export type LiveNote = {
  phase: LiveNotePhase
  /** The room doc the editor renders; set only while `ready`. Its ID survives the room's adoption of an early copy. */
  binding: YjsRoomDoc | null
  /**
   * False while the shown doc's room is gone (a rejoin, idle leave or rotation in progress):
   * the editor stays mounted read-only, so nothing is typed into a doc that cannot reach a room.
   * An early copy counts as attached while its room ID is the one being joined.
   */
  attached: boolean
  /** True once a room doc has loaded (drives the save indicator). */
  bound: boolean
  /** `meta.title` from the room (untrusted, already trimmed and length-limited), or null. */
  title: string | null
  /** Writes `meta.title`, so the rename shows up for everyone. */
  rename: (title: string) => void
  /** The live editor mounted (it supplies the schema the carry-over needs). */
  onEditorReady: (editor: Editor) => void
  /** Re-runs the join (authorize seeds an empty room). */
  retry: () => void
  /** One line about the live note to show under the title bar, or null. */
  notice: string | null
  dismissNotice: () => void
}

/** The shown doc is a bound room, or that room's offline copy opened before the room was entered. */
type ShownDoc = YjsNoteBinding | YjsRoomCopy
type Slot = { shown: ShownDoc | null; next: YjsNoteBinding | null; stopNext: (() => void) | null }

const noop = () => {}
/** A note switch keeps the old doc's provider until its updates are acknowledged, at most this long. */
const DESTROY_DRAIN_MS = 10_000
const EMPTY_ROOM_NOTICE = 'This note opened empty. If you expected text, check Version history.'
const ADDED_BELOW_NOTICE = 'Your offline edit to a paragraph someone else changed was added below it.'
const ROOM_CHANGED_NOTICE = 'Edits typed while this note was connecting couldn’t be added: its live room changed. Check the text and type them again.'
const ROOM_CHANGED_CARRIED_NOTICE = 'This note’s live room changed while it was connecting. Your edits from that moment were added to it; check the text.'

/** Whether a room's offline copy may be edited before its first sync (decided when its doc opens). */
function trustOfflineCopy(roomId: string): boolean {
  return isOfflineCopyFresh({ lastSyncedAt: readRoomSyncedAt(roomId), now: Date.now(), online: typeof navigator === 'undefined' || navigator.onLine !== false })
}
/** Leave guard while an early copy holds edits no room has received yet. */
const COPY_GUARD = 'live-room-copy'

/** Mirrors the backend `isCanonicalDocumentEmpty`: no content, or one paragraph without text. */
function isHeadEmpty(document: IncantlyDocument): boolean {
  if (document.content.length === 0) return true
  if (document.content.length !== 1) return false
  const only = document.content[0]
  if (!only || only.type !== 'paragraph') return false
  const inline = (only as { content?: unknown }).content
  return !Array.isArray(inline) || inline.every((item) => !(item && typeof item === 'object' && 'text' in item && (item as { text?: unknown }).text))
}

/**
 * The open live note's room binding. One `Y.Doc` and provider per entered room: a
 * reconnect keeps the same Room object (and so the same doc and editor, and typing
 * continues), while a rejoin or rotation hands over a new Room and gets a fresh doc. The
 * old doc stays on screen read-only until the new one has synced; a same-room rejoin then
 * merges the old doc's updates into the new one (never across room IDs). The client never
 * seeds: an empty room re-authorizes once, after which the editor opens with a notice.
 *
 * As soon as live-status names the room ID (before authorize), that room's own offline copy
 * opens in a doc created for exactly that ID. When it loads with content, the editor shows it
 * editable at once; the Room with the same ID adopts the doc in place when entered. A Room with
 * any other ID never gets it: the copy is destroyed and the room gets a fresh doc.
 */
export function useLiveNote(noteId: string, session: NoteSession): LiveNote {
  const user = useCurrentUser()
  const { room, roomNoteId, connection, statusRoom, retry: rejoin } = useLiveCollab()
  const enabled = session.live
  const slot = useRef<Slot>({ shown: null, next: null, stopNext: null })
  const [shown, setShown] = useState<ShownDoc | null>(null)
  const [retriedBinding, setRetriedBinding] = useState<number | null>(null)
  const [readyBinding, setReadyBinding] = useState<number | null>(null)
  const [offlineReady, setOfflineReady] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const queryClient = useQueryClient()
  /** The live editor's schema (the same for every doc), for turning a stranded doc into carried edits. */
  const schemaRef = useRef<Schema | null>(null)
  /** Edits from a doc whose room ID changed before it ever synced, waiting for the new room. */
  const [stranded, setStranded] = useState<readonly CarryOverEdit[] | null>(null)

  // Another account's offline room copies are deleted before any room doc loads.
  useEffect(() => {
    if (!enabled) return
    let active = true
    void prepareLiveOfflineData(user.id).then(() => { if (active) setOfflineReady(user.id) })
    return () => { active = false }
  }, [enabled, user.id])

  const roomHere = room && roomNoteId === noteId ? room : null
  const statusRoomId = statusRoom?.noteId === noteId ? statusRoom.roomId : null
  /** The room ID this note is joining now: the entered room's, else live-status's. */
  const targetRoomId = roomHere?.id ?? statusRoomId

  useEffect(() => {
    if (!enabled || offlineReady !== user.id) return
    const current = slot.current
    /**
     * A doc whose room ID changed before it ever reached its room: never attached or merged
     * elsewhere. What was typed in it is turned into carry-over edits (against what its offline
     * copy loaded) for the new room; if that is impossible, a notice says so. Never silent.
     */
    const strand = (doc: YjsRoomCopy | YjsNoteBinding) => {
      if (!doc.edited()) return
      const schema = schemaRef.current
      const edits = schema ? doc.strandedEdits(schema) : []
      if (edits.length > 0) setStranded((previous) => [...(previous ?? []), ...edits])
      else setNotice(ROOM_CHANGED_NOTICE)
    }
    const dropCopy = (copy: YjsRoomCopy) => {
      strand(copy)
      setLeaveGuard(COPY_GUARD, false)
      copy.destroy()
      if (current.shown === copy) current.shown = null
    }
    if (!roomHere) {
      // Before the room is entered: open that room's own offline copy as soon as its ID is known.
      if (!statusRoomId || current.shown?.kind === 'room') return
      if (current.shown?.kind === 'copy') {
        if (current.shown.roomId === statusRoomId) return
        dropCopy(current.shown)
      }
      const copy = openYjsRoomCopy(noteId, statusRoomId, {
        onLocalUpdate: () => { markLiveLocalUpdate(); setLeaveGuard(COPY_GUARD, true) },
        offlineTrusted: trustOfflineCopy(statusRoomId),
      })
      current.shown = copy
      setShown(copy)
      return
    }
    const live = roomHere
    if ((current.shown?.kind === 'room' && current.shown.room === live) || current.next?.room === live) return
    if (current.shown?.kind === 'copy') {
      const copy = current.shown
      if (copy.roomId === live.id) {
        // Same room ID: the room adopts the very doc on screen (same ID, so the editor stays).
        // The room's acknowledgement tracking takes over the local-update callback (copy guard off).
        const adopted = createYjsNoteBinding(noteId, live, { copy, onLocalUpdate: markLiveLocalUpdate })
        current.shown = adopted
        setShown(adopted)
        setLeaveGuard(COPY_GUARD, false)
        // Edits typed before entering now wait for this room's acknowledgement.
        if (copy.edited()) markLiveLocalUpdate()
        return
      }
      dropCopy(copy)
    }
    const created = createYjsNoteBinding(noteId, live, { onLocalUpdate: markLiveLocalUpdate, offlineTrusted: trustOfflineCopy(live.id) })
    current.stopNext?.(); current.stopNext = null
    current.next?.destroy(); current.next = null
    if (!current.shown) {
      current.shown = created
      setShown(created)
      return
    }
    current.next = created
    const promote = () => {
      if (current.next !== created || created.status() === 'loading') return
      current.stopNext?.(); current.stopNext = null
      current.next = null
      const previous = current.shown
      // Same room ID: whatever the old doc holds that the room lacks goes in first.
      if (previous) created.mergeFrom(previous)
      // Another room ID, and the old doc never synced (edited from its offline copy): carry it.
      if (previous && previous.roomId !== created.roomId && (previous.kind === 'copy' || previous.status() === 'loading')) strand(previous)
      previous?.destroy()
      current.shown = created
      setShown(created)
    }
    current.stopNext = created.onStatus(promote)
    promote()
  }, [enabled, offlineReady, user.id, roomHere, statusRoomId, noteId])

  useEffect(() => () => {
    const current = slot.current
    current.stopNext?.()
    current.next?.destroy()
    const leaving = current.shown
    slot.current = { shown: null, next: null, stopNext: null }
    setLeaveGuard(COPY_GUARD, false)
    // Edited here: the cached head predates these edits, so the next open reads afresh.
    if (leaving?.edited()) forgetNoteOpen(queryClient, user.id, noteId)
    // An early copy has no provider: its edits are already in its own offline copy.
    if (leaving?.kind === 'copy') { leaving.destroy(); return }
    // Unacknowledged edits keep their provider until they reach the room (bounded).
    if (leaving) void whenSynchronized(DESTROY_DRAIN_MS).then(() => leaving.destroy())
    // Unmount only; the IDs never change for one mounted note screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Derived snapshots only (booleans and the title), so sync traffic never re-renders the screen.
  const subscribeStatus = useCallback((onChange: () => void) => (shown?.kind === 'room' ? shown.onStatus(onChange) : noop), [shown])
  /** The room's first server sync finished. */
  const loaded = useSyncExternalStore(subscribeStatus, () => (shown?.kind === 'room' ? shown.status() !== 'loading' : false), () => false)
  const subscribeOffline = useCallback((onChange: () => void) => (shown ? shown.onOfflineState(onChange) : noop), [shown])
  const offline = useSyncExternalStore<OfflineCopyState>(subscribeOffline, () => (shown ? shown.offlineState() : 'loading'), () => 'loading')
  const readiness = shown ? liveDocReadiness({ serverSynced: loaded, offline, offlineTrusted: shown.offlineTrusted, docRoomId: shown.roomId, currentRoomId: targetRoomId }) : 'loading'

  // The room reported synchronized: its offline copy is trusted for a day, and the note's older
  // room generations (never joinable again) leave this device.
  useEffect(() => {
    if (shown?.kind !== 'room') return
    const binding = shown
    let cleaned = false
    const onStatus = (status: string) => {
      if (status !== 'synchronized') return
      recordRoomSynced(binding.roomId)
      if (!cleaned) { cleaned = true; void deleteOlderRoomGenerations(binding.roomId) }
    }
    onStatus(binding.status())
    return binding.onStatus(onStatus)
  }, [shown])

  // Access lost (no access, deleted): the room's offline copy and database leave this device.
  const lost = session.phase === 'no-access' || session.phase === 'not-found'
  const shownRoomId = shown?.roomId ?? statusRoomId
  useEffect(() => {
    if (lost && shownRoomId) void discardRoomOfflineData(shownRoomId)
  }, [lost, shownRoomId])
  const subscribeEmpty = useCallback((onChange: () => void) => {
    if (!shown) return noop
    const fragment = shown.fragment
    fragment.observeDeep(onChange)
    return () => fragment.unobserveDeep(onChange)
  }, [shown])
  const empty = useSyncExternalStore(subscribeEmpty, () => (shown ? shown.isEmpty() : false), () => false)
  const subscribeTitle = useCallback((onChange: () => void) => (shown ? shown.onTitle(onChange) : noop), [shown])
  const title = useSyncExternalStore(subscribeTitle, () => shown?.readTitle() ?? null, () => null)

  const headReady = session.phase === 'ready' && session.document != null
  const headEmpty = headReady && session.document ? isHeadEmpty(session.document) : true
  let phase: LiveNotePhase
  if (!room && connection === 'unavailable') phase = 'paused'
  else if (!shown || offlineReady !== user.id) phase = 'connecting'
  else if (readiness === 'loading') phase = 'loading'
  // Once a doc has opened it stays open: someone emptying the note never unmounts it for everyone.
  else if (readyBinding === shown.id) phase = 'ready'
  // Its own offline copy loaded with content: editable before the sync (never the seeding case).
  else if (readiness === 'instant') phase = 'ready'
  else if (empty && !headReady) phase = 'loading'
  else if (empty && !headEmpty && (retriedBinding == null || retriedBinding === shown.id)) phase = 'seeding'
  else phase = 'ready'
  // Latch during render (idempotent): the first time this binding is ready.
  if (phase === 'ready' && shown && readyBinding !== shown.id) {
    setReadyBinding(shown.id)
    if (empty && !headEmpty) setNotice(EMPTY_ROOM_NOTICE)
  }

  // Empty room, non-empty note: the server seeds inside authorize, so re-authorize once.
  useEffect(() => {
    if (phase !== 'seeding' || !shown || retriedBinding != null) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one re-authorize per open, recorded before it runs
    setRetriedBinding(shown.id)
    rejoin()
  }, [phase, shown, retriedBinding, rejoin])

  // Figures render from fragments kept in this tab's memory: load them without writing the room.
  const head = enabled ? session.document : null
  useEffect(() => { if (head) void warmFigureSources(head) }, [head])

  const [liveEditor, setLiveEditor] = useState<{ editor: Editor; bindingId: number } | null>(null)
  const onEditorReady = useCallback((editor: Editor) => {
    schemaRef.current = editor.schema
    const binding = slot.current.shown
    if (binding) setLiveEditor({ editor, bindingId: binding.id })
  }, [])
  const attached = shown != null && (shown.kind === 'room' ? shown.room === room : shown.roomId === targetRoomId)
  const carried = useRef(false)
  const { carryOver, canEdit, runCarryOver } = session
  useEffect(() => {
    const binding = slot.current.shown
    if (carried.current || !carryOver || !canEdit || !liveEditor || liveEditor.editor.isDestroyed) return
    // Carried edits compare against the room's blocks: only after the room's first server sync.
    if (binding?.kind !== 'room' || binding.id !== liveEditor.bindingId || phase !== 'ready' || !attached || !loaded) return
    carried.current = true
    void runCarryOver((carry) => {
      const { addedBelow } = binding.applyCarryOver(liveEditor.editor.schema, carry.edits)
      // A rename carries over only while nobody renamed the note since.
      const roomTitle = binding.readTitle()
      if (carry.title && (roomTitle == null || roomTitle === carry.headTitle)) binding.writeTitle(carry.title)
      if (addedBelow > 0) setNotice(ADDED_BELOW_NOTICE)
    })
  }, [carryOver, canEdit, runCarryOver, liveEditor, phase, attached, loaded])

  // Edits stranded by a room-ID change go into the new room once it has synced (same rules as the carry-over).
  useEffect(() => {
    const binding = slot.current.shown
    if (!stranded || !canEdit || !liveEditor || liveEditor.editor.isDestroyed) return
    if (binding?.kind !== 'room' || binding.id !== liveEditor.bindingId || phase !== 'ready' || !attached || !loaded) return
    binding.applyCarryOver(liveEditor.editor.schema, stranded)
    setStranded(null)
    setNotice(ROOM_CHANGED_CARRIED_NOTICE)
  }, [stranded, canEdit, liveEditor, phase, attached, loaded])

  const sessionRef = useRef(session)
  useEffect(() => { sessionRef.current = session })
  const rename = useCallback((next: string) => {
    if (!sessionRef.current.canEdit) return
    slot.current.shown?.writeTitle(next)
  }, [])
  const retry = useCallback(() => { setRetriedBinding(null); rejoin() }, [rejoin])
  const dismissNotice = useCallback(() => setNotice(null), [])

  return {
    phase,
    binding: phase === 'ready' ? shown : null,
    attached,
    bound: loaded,
    title,
    rename,
    onEditorReady,
    retry,
    notice,
    dismissNotice,
  }
}
