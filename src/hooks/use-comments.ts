'use client'

import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { ThreadData } from '@liveblocks/client'
import { createFeatureContext, useFeatureContext } from '@/components/product/features/createFeatureContext'
import { useCurrentUser } from '@/components/product/SessionGate'
import {
  COMMENT_BODY_MAX_CHARS,
  COMMENT_MAX_MENTIONS,
  buildCommentParagraphs,
  commentErrorCopy,
  commentMentionUserId,
  commentParagraphsHaveContent,
  extractMentionQuery,
  insertMention,
  mentionMenuOpen,
  myCommentAccess,
  type CommentRole,
  type RecordedMention,
} from '@/components/product/workspace/commentsModel'
import { commentsApi } from '@/lib/api/comments'
import { ApiError } from '@/lib/api/errors'
import { newIdempotencyKey } from '@/lib/api/idempotency'
import { liveApi } from '@/lib/api/live'
import { sharingApi } from '@/lib/api/sharing'
import { useLiveCollab, useMentionSuggestions, type MentionSuggestion } from '@/hooks/use-live-collab'
import { useNavigation } from '@/hooks/use-navigation'
import { useNotes } from '@/hooks/use-notes'
import { collaboratorsKey, useOnlineStatus } from '@/hooks/use-sharing'

/** Thread list refresh while the comments panel watches: same 5 s cadence as saved sync, visible tabs only. */
const THREADS_POLL_MS = 5_000
/** Keystroke debounce before mention-suggestion lookups. */
const MENTION_DEBOUNCE_MS = 200

/** A failed post or resolve, scoped to the composer or thread that caused it (null = the new-thread composer). */
export type CommentActionError = { scope: string | null; kind: 'post' | 'resolve'; error: unknown }

export type CommentsValue = {
  /** The open shared note. Null hides every comment affordance (unshared notes have none). */
  noteId: string | null
  /** Thread list for the open note: null until the first room read lands. */
  threads: ThreadData[] | null
  threadsLoading: boolean
  threadsError: unknown
  retryThreads: () => void
  /** Resolved author display names by Liveblocks user ID. Names are untrusted text at render. */
  authors: ReadonlyMap<string, string>
  /** False while saved-sync-only, idle-left, or hidden: listing and resolve need the room. */
  liveRoom: boolean
  online: boolean
  role: CommentRole
  roleLoading: boolean
  canComment: boolean
  /** The thread (or new-thread composer, null) with a post in flight, if any. */
  posting: { threadId: string | null } | null
  /** The thread with a resolve/reopen in flight, if any. */
  resolvingId: string | null
  actionError: CommentActionError | null
  clearActionError: (scope: string | null) => void
  /** Post a new thread (threadId null) or a reply. True when the comment landed. */
  post: (threadId: string | null, text: string, mentions: readonly RecordedMention[]) => Promise<boolean>
  setResolved: (threadId: string, resolved: boolean) => Promise<void>
  /**
   * The panel calls this on mount: threads load and refresh only while
   * watched, so background notes never poll the room. Returns the unwatch.
   */
  watch: () => () => void
}

export const CommentsContext = createFeatureContext<CommentsValue>('Comments')

/**
 * Threaded comments for the open shared note. Runs once, in `CommentsProvider`.
 *
 * - Creation is always `POST /v1/notes/{noteId}/comments` (new threads and
 *   replies alike); the server applies the comment into the room.
 * - Listing, resolve and reopen run through the entered Liveblocks room
 *   (`room.getThreads`, `markThreadAsResolved/Unresolved`): no REST endpoint
 *   lists threads. Saved-sync-only notes can post but not list or resolve.
 */
export function useCommentsState(): CommentsValue {
  const user = useCurrentUser()
  const { activeNoteId } = useNavigation()
  const { activeNote } = useNotes()
  const { noteId: liveNoteId, room, roomNoteId } = useLiveCollab()
  const online = useOnlineStatus()
  const shared = activeNoteId != null && ((activeNote?.shared ?? false) || liveNoteId === activeNoteId)
  const noteId = shared && activeNoteId != null ? activeNoteId : null
  // The room briefly belongs to the previous note on a switch; only the matching pair lists threads.
  const liveRoom = room != null && roomNoteId === noteId ? room : null

  const [store, setStore] = useState<{ noteId: string; threads: ThreadData[]; loading: boolean; error: unknown } | null>(null)
  const [authors, setAuthors] = useState<ReadonlyMap<string, string>>(new Map())
  const [posting, setPosting] = useState<{ threadId: string | null } | null>(null)
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<CommentActionError | null>(null)
  const [watchers, setWatchers] = useState(0)
  const [attempt, setAttempt] = useState(0)
  const refreshRef = useRef<() => void>(() => {})
  const authorsRef = useRef(authors)
  useEffect(() => { authorsRef.current = authors })

  const collaborators = useQuery({
    queryKey: collaboratorsKey(noteId ?? ''),
    queryFn: ({ signal }) => sharingApi.collaborators(noteId ?? '', signal),
    enabled: noteId != null,
    meta: { silentErrors: true },
  })

  const watch = useCallback(() => {
    setWatchers((count) => count + 1)
    return () => setWatchers((count) => Math.max(0, count - 1))
  }, [])
  const retryThreads = useCallback(() => setAttempt((value) => value + 1), [])
  const clearActionError = useCallback((scope: string | null) => {
    setActionError((current) => (current?.scope === scope ? null : current))
  }, [])

  useEffect(() => {
    if (!noteId || !liveRoom || watchers === 0) return
    const room = liveRoom
    let alive = true
    const seen = new Set<string>()
    const load = async (initial: boolean) => {
      if (initial) {
        setStore((current) => (current?.noteId === noteId ? { ...current, loading: true, error: null } : { noteId, threads: [], loading: true, error: null }))
      }
      try {
        const result = await room.getThreads()
        if (!alive) return
        setStore({ noteId, threads: result.threads, loading: false, error: null })
        const missing = [...new Set(result.threads.flatMap((thread) => thread.comments.map((comment) => comment.userId)))]
          .filter((id) => !seen.has(id) && !authorsRef.current.has(id))
          .slice(0, 50)
        missing.forEach((id) => seen.add(id))
        if (missing.length > 0) {
          const users = await liveApi.resolveUsers(missing).catch((): never[] => [])
          if (!alive) return
          const resolved = new Set(users.map((author) => author.id))
          // Resolved IDs keep their names; the rest stay out of the map (rendered
          // as @Someone) and leave `seen` so a later refresh retries the miss.
          missing.forEach((id) => { if (!resolved.has(id)) seen.delete(id) })
          setAuthors((current) => {
            const next = new Map(current)
            for (const author of users) next.set(author.id, author.name)
            return next
          })
        }
      } catch (error) {
        if (!alive) return
        // Background refreshes fail silently (the stale list stays); only the
        // first load surfaces an error with a retry.
        if (initial) setStore({ noteId, threads: [], loading: false, error })
      }
    }
    refreshRef.current = () => void load(false)
    void load(true)
    const timer = setInterval(() => { if (!document.hidden) void load(false) }, THREADS_POLL_MS)
    const onFocus = () => void load(false)
    window.addEventListener('focus', onFocus)
    return () => {
      alive = false
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [noteId, liveRoom, watchers, attempt])

  const post = useCallback(async (threadId: string | null, text: string, mentions: readonly RecordedMention[]): Promise<boolean> => {
    if (!noteId || posting) return false
    const paragraphs = buildCommentParagraphs(text, mentions)
    if (!commentParagraphsHaveContent(paragraphs)) return false
    setPosting({ threadId })
    setActionError((current) => (current?.scope === threadId ? null : current))
    try {
      await commentsApi.create(
        noteId,
        threadId ? { threadId, paragraphs } : { paragraphs },
        { idempotencyKey: newIdempotencyKey() },
      )
      refreshRef.current()
      return true
    } catch (error) {
      setActionError({ scope: threadId, kind: 'post', error })
      return false
    } finally {
      setPosting(null)
    }
  }, [noteId, posting])

  const setResolved = useCallback(async (threadId: string, resolved: boolean) => {
    if (posting || resolvingId) return
    if (!liveRoom) {
      // Resolving runs through the room; without one this is the live-unavailable path.
      setActionError({ scope: threadId, kind: 'resolve', error: new ApiError(503, 'LIVE_COLLABORATION_UNAVAILABLE', null, null) })
      return
    }
    setResolvingId(threadId)
    setActionError((current) => (current?.scope === threadId ? null : current))
    try {
      if (resolved) await liveRoom.markThreadAsResolved(threadId)
      else await liveRoom.markThreadAsUnresolved(threadId)
      refreshRef.current()
    } catch (error) {
      setActionError({ scope: threadId, kind: 'resolve', error })
    } finally {
      setResolvingId(null)
    }
  }, [liveRoom, posting, resolvingId])

  return useMemo<CommentsValue>(() => {
    const access = myCommentAccess(collaborators.data, user.id)
    // Listing runs through the matching room: without one there is no list to show.
    const current = store?.noteId === noteId && liveRoom != null ? store : null
    return {
      noteId,
      threads: current && !current.loading ? current.threads : null,
      threadsLoading: noteId != null && liveRoom != null && watchers > 0 && (!current || current.loading),
      threadsError: current?.error ?? null,
      retryThreads,
      authors,
      liveRoom: liveRoom != null,
      online,
      role: access.role,
      roleLoading: noteId != null && collaborators.isPending,
      canComment: access.canComment,
      posting,
      resolvingId,
      actionError,
      clearActionError,
      post,
      setResolved,
      watch,
    }
  }, [noteId, store, retryThreads, authors, liveRoom, online, collaborators.data, collaborators.isPending, posting, resolvingId, actionError, clearActionError, post, setResolved, watch, user.id, watchers])
}

/** Threaded comments for the open shared note. Must be used inside `WorkspaceProviders`. */
export function useComments(): CommentsValue {
  return useFeatureContext(CommentsContext)
}

export type CommentComposer = {
  draft: string
  onInput: (value: string, selectionStart: number) => void
  menu: { open: boolean; items: MentionSuggestion[]; activeIndex: number; loading: boolean }
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => boolean
  chooseSuggestion: (suggestion: MentionSuggestion) => void
  /** A caret position the textarea should restore, once. Null when nothing is pending. */
  caretRestore: number | null
  caretApplied: () => void
  charCount: number
  limitError: string | null
  canSubmit: boolean
  posting: boolean
  error: string | null
  submit: () => Promise<boolean>
}

/**
 * One comment box: the new-thread composer or a thread's reply box. Owns the
 * draft, the @mention menu (debounced, from `useMentionSuggestions`), the
 * caret restore after a pick, and submit. The component only draws this state
 * and forwards textarea events.
 */
export function useCommentComposer(noteId: string, threadId: string | null): CommentComposer {
  const { post, posting, actionError, clearActionError, online, canComment } = useComments()
  const [draft, setDraft] = useState('')
  const [records, setRecords] = useState<RecordedMention[]>([])
  const [token, setToken] = useState<{ query: string; start: number } | null>(null)
  const [dismissedStart, setDismissedStart] = useState<number | null>(null)
  const [highlight, setHighlight] = useState(0)
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [caretRestore, setCaretRestore] = useState<number | null>(null)
  const caretRef = useRef(0)

  useEffect(() => {
    // Keystrokes debounce into suggestion lookups; a closed token clears the query on the next tick.
    const next = token && token.query.length > 0 ? token.query : ''
    const timer = setTimeout(() => setDebouncedQuery(next), next === '' ? 0 : MENTION_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [token])

  const suggestions = useMentionSuggestions(noteId, debouncedQuery, token != null && token.start !== dismissedStart)
  const menuOpen = mentionMenuOpen(token, dismissedStart, suggestions.suggestions.length, suggestions.loading)
  const activeIndex = highlight < suggestions.suggestions.length ? highlight : 0

  const onInput = useCallback((value: string, selectionStart: number) => {
    caretRef.current = selectionStart
    setDraft(value)
    setToken(extractMentionQuery(value, selectionStart))
    setDismissedStart(null)
    setHighlight(0)
    setCaretRestore(null)
    clearActionError(threadId)
  }, [clearActionError, threadId])

  const caretApplied = useCallback(() => setCaretRestore(null), [])

  const chooseSuggestion = useCallback((suggestion: MentionSuggestion) => {
    if (!token) return
    const inserted = insertMention(draft, caretRef.current, token.start, suggestion.name)
    setDraft(inserted.text)
    setRecords((prior) => [...prior, { name: suggestion.name, userId: commentMentionUserId(suggestion.id) }])
    setCaretRestore(inserted.cursor)
    setHighlight(0)
    setToken(null)
  }, [draft, token])

  const charCount = draft.length
  const overChars = charCount > COMMENT_BODY_MAX_CHARS
  const overMentions = records.length > COMMENT_MAX_MENTIONS
  const limitError = overChars
    ? `Keep comments under ${COMMENT_BODY_MAX_CHARS.toLocaleString()} characters.`
    : overMentions
      ? `A comment can mention at most ${COMMENT_MAX_MENTIONS} people.`
      : null
  const busy = posting?.threadId === threadId
  const canSubmit = online && canComment && !busy && !limitError && draft.trim().length > 0

  const submit = useCallback(async (): Promise<boolean> => {
    if (!online || !canComment || limitError) return false
    const ok = await post(threadId, draft, records)
    if (ok) {
      setDraft('')
      setRecords([])
      setToken(null)
      setHighlight(0)
    }
    return ok
  }, [online, canComment, limitError, post, threadId, draft, records])

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      void submit()
      return true
    }
    if (!menuOpen) return false
    const items = suggestions.suggestions
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (items.length === 0) return false
      setHighlight((current) => (current + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length)
      return true
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      const pick = items[activeIndex]
      if (!pick) return false
      chooseSuggestion(pick)
      return true
    }
    if (event.key === 'Escape') {
      setDismissedStart(token?.start ?? null)
      return true
    }
    return false
  }, [submit, menuOpen, suggestions.suggestions, activeIndex, chooseSuggestion, token])

  return {
    draft,
    onInput,
    menu: { open: menuOpen, items: suggestions.suggestions, activeIndex, loading: suggestions.loading },
    onKeyDown,
    chooseSuggestion,
    caretRestore,
    caretApplied,
    charCount,
    limitError,
    canSubmit,
    posting: posting?.threadId === threadId,
    error: actionError?.scope === threadId && actionError.kind === 'post' ? commentErrorCopy(actionError.error) : null,
    submit,
  }
}
