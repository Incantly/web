'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Editor } from '@tiptap/core'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useCurrentUser } from '@/components/product/SessionGate'
import { decisionNotice, editorSuggestions, parseSuggestionKey } from '@/components/product/workspace/suggestionModel'
import type { NoteSession } from '@/components/product/workspace/useNoteSession'
import { apiErrorMessage, isApiError } from '@/lib/api/errors'
import { proposalsApi, type NoteProposal, type ProposalDecision } from '@/lib/api/proposals'
import { useDocumentAssetHost } from '@/lib/document-editor/assetHost'
import { registerSuggestions, revealSuggestion, setSuggestions, type SuggestionHandlers } from '@/lib/document-editor/suggestions'
import { loadDocument } from '@/lib/notes/documentGate'

export const noteProposalsKey = (userId: string, noteId: string) => ['note-proposals', userId, noteId] as const

/** `GET /v1/notes/:noteId/proposals`: the note's open suggested edits. Shared by the editor and the chat. */
export function useNoteProposalsQuery(noteId: string | undefined, enabled = true) {
  const user = useCurrentUser()
  return useQuery({
    queryKey: noteProposalsKey(user.id, noteId ?? ''),
    queryFn: ({ signal }) => proposalsApi.list(noteId!, signal),
    enabled: Boolean(noteId) && enabled,
    staleTime: 30_000,
  })
}

export type SuggestionNotice = { tone: 'done' | 'warning'; text: string }

type Decision = { proposalId: string; body: ProposalDecision; decided: string[] }

const UNSAVED = 'Your latest edits haven’t saved yet. Try again once the note says Saved.'
/** How long Undo (and a success message) stays after a decision. Version history can still restore after. */
export const UNDO_WINDOW_MS = 4_000
const EMPTY: NoteProposal[] = []

/**
 * The note assistant's suggested edits in the open note (docs/agent-note-edits.md): draws them in
 * the editor, accepts or rejects them, and undoes an accept. Every decision is applied by the server
 * as a new revision, so the note's pending edits are sent first and the note reloads after; nothing
 * is applied locally. Right after an accept, Undo and ⌘Z reverse it on the server for 4 seconds, or until the user types.
 * Used once, by the note screen.
 */
export function useNoteSuggestions(noteId: string, session: NoteSession, editor: Editor | null) {
  const user = useCurrentUser()
  const client = useQueryClient()
  const query = useNoteProposalsQuery(noteId, session.phase === 'ready')
  const proposals = query.data ?? EMPTY
  // Suggested blocks are untrusted JSON: only what passes the note's own load gate is previewed;
  // the rest falls back to plain text. The server validates again when a change is accepted.
  const template = session.document
  const suggestions = useMemo(() => editorSuggestions(proposals, (blocks) => {
    if (!template) return null
    const gate = loadDocument({ ...template, content: blocks })
    return gate.ok ? gate.document.content : null
  }), [proposals, template])
  const assets = useDocumentAssetHost()
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<SuggestionNotice | null>(null)
  /** Changes accepted since the user last typed, newest last: what ⌘Z undoes. */
  const [undoable, setUndoable] = useState<{ proposalId: string; changeId: string }[]>([])
  const [active, setActive] = useState(-1)
  /** The pointer or focus is on the review bar: keep Undo up while the user is reaching for it. */
  const [held, setHeld] = useState(false)

  // Undo and a success message go away on their own; a warning stays until dismissed.
  const fades = undoable.length > 0 || notice?.tone === 'done'
  useEffect(() => {
    if (!fades || held || busy) return
    const timer = window.setTimeout(() => {
      setUndoable([])
      setNotice((current) => (current?.tone === 'done' ? null : current))
    }, UNDO_WINDOW_MS)
    return () => window.clearTimeout(timer)
  }, [fades, held, busy, undoable, notice])

  const refresh = () => client.invalidateQueries({ queryKey: noteProposalsKey(user.id, noteId) })

  /** Sends local edits first: the server applies decisions against the saved note. */
  async function saved() {
    const state = await session.flush()
    if (state && state.pending > 0) { setNotice({ tone: 'warning', text: UNSAVED }); return false }
    return true
  }

  async function decide(decisions: Decision[]) {
    if (busy || !decisions.length) return
    setBusy(true)
    setNotice(null)
    try {
      if (!(await saved())) return
      const accepted: { proposalId: string; changeId: string }[] = []
      const messages: SuggestionNotice[] = []
      for (const { proposalId, body, decided } of decisions) {
        const result = await proposalsApi.decide(noteId, proposalId, body)
        const outcome = decisionNotice(result, decided)
        accepted.push(...outcome.accepted.map((changeId) => ({ proposalId, changeId })))
        messages.push(outcome)
      }
      // Load the revision the server wrote; never reapply the change here.
      if (accepted.length) await session.applyServerHead()
      setUndoable((stack) => [...stack, ...accepted])
      setNotice({ tone: messages.some((message) => message.tone === 'warning') ? 'warning' : 'done', text: messages.map((message) => message.text).join(' ') })
    } catch (error) {
      if (isApiError(error, 'NOTE_ACCESS_DENIED')) {
        setUndoable([])
        session.markAccessDenied(error)
      } else {
        setNotice({ tone: 'warning', text: apiErrorMessage(error) })
      }
    } finally {
      setBusy(false)
      void refresh()
    }
  }

  function decideOne(key: string, verdict: 'accept' | 'reject') {
    const { proposalId, changeId } = parseSuggestionKey(key)
    void decide([{ proposalId, body: verdict === 'accept' ? { accept: [changeId] } : { reject: [changeId] }, decided: [changeId] }])
  }

  function decideAll(verdict: 'accept' | 'reject') {
    void decide([...proposals].reverse()
      .map((proposal) => ({ proposalId: proposal.id, body: { all: verdict }, decided: proposal.changes.filter((change) => change.state === null).map((change) => change.id) }))
      .filter((decision) => decision.decided.length))
  }

  async function undo() {
    const last = undoable.at(-1)
    if (busy || !last) return
    setBusy(true)
    setNotice(null)
    try {
      if (!(await saved())) return
      await proposalsApi.undo(noteId, last.proposalId, last.changeId)
      setUndoable((stack) => stack.slice(0, -1))
      await session.applyServerHead()
      setNotice({ tone: 'done', text: 'Change undone.' })
    } catch (error) {
      if (isApiError(error, 'NOTE_ACCESS_DENIED')) {
        setUndoable([])
        session.markAccessDenied(error)
      } else {
        if (isApiError(error, 'PROPOSAL_UNDO_STALE') || isApiError(error, 'PROPOSAL_UNDO_NOT_ALLOWED')) setUndoable([])
        setNotice({ tone: 'warning', text: apiErrorMessage(error) })
      }
    } finally {
      setBusy(false)
      void refresh()
    }
  }

  function show(index: number) {
    if (!editor || !suggestions.length) return
    const next = (index + suggestions.length) % suggestions.length
    setActive(next)
    revealSuggestion(editor, suggestions[next].key)
  }

  // The editor calls these long after this render; the ref always holds the latest closures.
  const latest = useRef({ decideOne, undo, canUndo: false, busy })
  useEffect(() => { latest.current = { decideOne, undo, canUndo: undoable.length > 0, busy } })
  const handlers = useMemo<SuggestionHandlers>(() => ({
    accept: (key) => latest.current.decideOne(key, 'accept'),
    reject: (key) => latest.current.decideOne(key, 'reject'),
    undo: () => {
      if (!latest.current.canUndo || latest.current.busy) return false
      void latest.current.undo()
      return true
    },
    edited: () => setUndoable((stack) => (stack.length ? [] : stack)),
    resolveImage: assets ? (assetId) => assets.resolveUrl(assetId) : undefined,
  }), [assets])

  useEffect(() => (editor ? registerSuggestions(editor) : undefined), [editor])
  useEffect(() => { if (editor) setSuggestions(editor, { suggestions, busy, handlers }) }, [editor, suggestions, busy, handlers])

  return {
    suggestions,
    count: suggestions.length,
    /** The summary line of the newest proposal, written by the assistant (plain text). */
    summary: proposals[0]?.summary ?? '',
    fromWeb: proposals.some((proposal) => proposal.fromUntrusted),
    busy,
    notice,
    dismissNotice: () => setNotice(null),
    /** Pause the Undo timer while the pointer or focus is on the bar. */
    hold: setHeld,
    canUndo: undoable.length > 0,
    undo: () => void undo(),
    acceptAll: () => decideAll('accept'),
    rejectAll: () => decideAll('reject'),
    next: () => show(active + 1),
    previous: () => show(active - 1),
    /** 1-based position of the suggestion last scrolled to, or 0. */
    position: active >= 0 && active < suggestions.length ? active + 1 : 0,
  }
}
