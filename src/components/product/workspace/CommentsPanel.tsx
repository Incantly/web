'use client'

import { useEffect, useRef, useState } from 'react'
import type { CommentData, ThreadData } from '@liveblocks/client'
import { AppIcon } from '../AppIcon'
import { useLiveCollab } from '@/hooks/use-live-collab'
import { useCommentComposer, useComments, type CommentComposer } from '@/hooks/use-comments'
import { initialsFor } from './liveCollabModel'
import {
  COMMENT_BODY_MAX_CHARS,
  THREAD_RESOLVED_BADGE,
  commentErrorCopy,
  formatCommentTime,
  mentionDisplayName,
  partitionThreads,
  threadCommentSegments,
  threadResolveLabel,
  type CommentSegment,
} from './commentsModel'
import { EmptyState, ErrorState, ListSkeleton, buttonPrimary, buttonQuiet, buttonSecondary } from './ui'

/** A thread comment's author row: avatar initials, name and age. Names are untrusted text. */
function CommentHeader({ userId, createdAt, editedAt }: { userId: string; createdAt: Date | string; editedAt?: Date }) {
  const { authors } = useComments()
  const name = authors.get(userId)?.trim() || 'Collaborator'
  return <div className="flex min-w-0 items-center gap-2">
    <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-full bg-surface text-[11px] font-semibold text-muted">{initialsFor(name)}</span>
    <span className="min-w-0 truncate text-sm font-semibold text-foreground">{name}</span>
    <span className="shrink-0 text-xs text-subtle">{formatCommentTime(createdAt)}{editedAt ? ' · Edited' : ''}</span>
  </div>
}

/** One body segment. Bodies are untrusted: mentions show resolved names, links stay plain text. */
function Segment({ segment }: { segment: CommentSegment }) {
  const { authors } = useComments()
  if (segment.type === 'mention') return <span className="font-semibold text-foreground">{mentionDisplayName(authors, segment.userId)}</span>
  if (segment.type === 'link') return <span className="break-all">{segment.text ?? segment.url}</span>
  return <span>{segment.text}</span>
}

/** One comment: header plus body paragraphs, or the deleted placeholder. */
function ThreadComment({ comment }: { comment: CommentData }) {
  if ('deletedAt' in comment) return <p className="text-sm italic text-subtle">This comment was deleted.</p>
  const paragraphs = threadCommentSegments(comment.body)
  return <div className="min-w-0 space-y-1.5">
    <CommentHeader userId={comment.userId} createdAt={comment.createdAt} editedAt={comment.editedAt} />
    {paragraphs.length === 0
      ? <p className="text-sm italic text-subtle">This comment has no readable text.</p>
      : paragraphs.map((segments, index) => <p key={index} className="break-words text-sm leading-6 text-foreground">
        {segments.map((segment, at) => <Segment key={at} segment={segment} />)}
      </p>)}
  </div>
}

/** One comment box: the new-thread composer or a thread's reply box. The hook owns the draft, menu and submit. */
function CommentBox({ noteId, threadId, label, placeholder, submitLabel }: {
  noteId: string
  threadId: string | null
  label: string
  placeholder: string
  submitLabel: string
}) {
  const composer: CommentComposer = useCommentComposer(noteId, threadId)
  const { caretRestore, caretApplied } = composer
  const areaRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (caretRestore == null) return
    const area = areaRef.current
    area?.focus()
    area?.setSelectionRange(caretRestore, caretRestore)
    caretApplied()
  }, [caretRestore, caretApplied])
  const describedBy = `${threadId ?? 'new'}-comment-help`
  return <div>
    <label htmlFor={`${threadId ?? 'new'}-comment-box`} className="sr-only">{label}</label>
    <div className="relative">
      <textarea
        ref={areaRef}
        id={`${threadId ?? 'new'}-comment-box`}
        value={composer.draft}
        rows={threadId ? 2 : 3}
        maxLength={COMMENT_BODY_MAX_CHARS + 500}
        placeholder={placeholder}
        aria-describedby={describedBy}
        aria-expanded={composer.menu.open || undefined}
        aria-controls={composer.menu.open ? `${threadId ?? 'new'}-mention-menu` : undefined}
        role={composer.menu.open ? 'combobox' : undefined}
        aria-autocomplete={composer.menu.open ? 'list' : undefined}
        onChange={(event) => composer.onInput(event.target.value, event.target.selectionStart)}
        onKeyDown={(event) => { if (composer.onKeyDown(event)) event.preventDefault() }}
        className="min-h-11 w-full resize-y rounded-xl border border-default bg-surface px-3.5 py-2.5 text-sm leading-6 text-foreground transition-[border-color,box-shadow] placeholder:text-subtle focus-visible:border-button focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-button/15 motion-reduce:transition-none"
      />
      {composer.menu.open ? <div id={`${threadId ?? 'new'}-mention-menu`} role="listbox" aria-label="Mention someone"
        className="absolute inset-x-0 top-full z-10 mt-1 max-h-56 overflow-y-auto overscroll-contain rounded-xl border border-default bg-raised py-1 shadow-lg">
        {composer.menu.loading && composer.menu.items.length === 0
          ? <p role="status" className="px-3.5 py-2.5 text-sm text-muted">Searching…</p>
          : composer.menu.items.map((suggestion, index) => <button
            key={suggestion.id}
            type="button"
            role="option"
            aria-selected={index === composer.menu.activeIndex}
            onMouseDown={(event) => {
              // Pick on press: a click would blur the textarea and lose the caret first.
              event.preventDefault()
              composer.chooseSuggestion(suggestion)
            }}
            className={`flex min-h-11 w-full items-center gap-2.5 px-3.5 text-left text-sm ${index === composer.menu.activeIndex ? 'bg-surface' : ''}`}>
            <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-full bg-surface text-[11px] font-semibold text-muted">{suggestion.initials}</span>
            <span className="min-w-0 truncate text-foreground">{suggestion.name}</span>
          </button>)}
      </div> : null}
    </div>
    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <button type="button" disabled={!composer.canSubmit} onClick={() => void composer.submit()} className={buttonPrimary}>
        {composer.posting ? 'Posting…' : submitLabel}
      </button>
      <span id={describedBy} className="text-xs text-subtle">{composer.charCount.toLocaleString()} / {COMMENT_BODY_MAX_CHARS.toLocaleString()} · Type @ to mention someone</span>
    </div>
    {composer.limitError ? <p role="alert" className="mt-1.5 text-sm text-danger">{composer.limitError}</p> : null}
    {composer.error ? <p role="alert" className="mt-1.5 text-sm text-danger">{composer.error}</p> : null}
  </div>
}

/** One thread: its comments, resolve/reopen, and the reply box. */
function ThreadCard({ thread }: { thread: ThreadData }) {
  const { noteId, canComment, liveRoom, resolvingId, actionError, setResolved } = useComments()
  const busy = resolvingId === thread.id
  const error = actionError?.scope === thread.id && actionError.kind === 'resolve' ? commentErrorCopy(actionError.error) : null
  return <li className="min-w-0 rounded-xl border border-default bg-canvas p-4">
    <div className="space-y-4">
      {thread.comments.map((comment) => <ThreadComment key={comment.id} comment={comment} />)}
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-default pt-3">
      {thread.resolved ? <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-xs font-medium text-muted">
        <AppIcon name="checkCircle" className="size-3.5" />{THREAD_RESOLVED_BADGE}
      </span> : null}
      {canComment ? <button
        type="button"
        disabled={busy || !liveRoom}
        title={liveRoom ? undefined : 'Available when the live connection is back'}
        onClick={() => void setResolved(thread.id, !thread.resolved)}
        className={buttonQuiet}
      >{busy ? 'Working…' : threadResolveLabel(thread.resolved)}</button> : null}
      {!liveRoom && canComment ? <span className="text-xs text-subtle">Resolving needs the live connection.</span> : null}
    </div>
    {error ? <p role="alert" className="mt-2 text-sm text-danger">{error}</p> : null}
    {canComment && noteId ? <div className="mt-3">
      <CommentBox noteId={noteId} threadId={thread.id} label="Reply to this thread" placeholder="Reply…" submitLabel="Reply" />
    </div> : null}
  </li>
}

/** Threaded comments for the open shared note. Renders nothing on unshared notes. */
export function CommentsPanel({ noteId }: { noteId: string }) {
  const comments = useComments()
  const { retry: liveRetry } = useLiveCollab()
  const [showResolved, setShowResolved] = useState(false)
  const watch = comments.watch
  useEffect(() => watch(), [watch])
  if (comments.noteId !== noteId) return null

  const groups = comments.threads ? partitionThreads(comments.threads) : null
  return <div className="space-y-6">
    {!comments.online ? <p role="status" className="rounded-xl bg-surface px-3.5 py-2.5 text-sm text-muted">You’re offline. Reconnect to read or post comments.</p> : null}

    <section aria-label="New comment">
      {comments.roleLoading ? <ListSkeleton rows={2} label="Loading commenting access" />
        : comments.canComment
          ? <CommentBox noteId={noteId} threadId={null} label="Start a new thread" placeholder="Start a thread… Type @ to mention someone." submitLabel="Comment" />
          : <p className="rounded-xl bg-surface px-3.5 py-2.5 text-sm leading-6 text-muted">You have view-only access to this note, so you can read comments but not post. Ask the owner to make you a commenter or editor.</p>}
    </section>

    <section aria-label="Threads" className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">Threads</h3>
      {!comments.liveRoom
        ? <EmptyState icon="comment" title="Comments need the live connection"
          body="Threads can’t load while the live connection is down. New comments still post above and appear once you reconnect."
          action={<button type="button" onClick={liveRetry} className={buttonSecondary}>Reconnect</button>} />
        : comments.threadsLoading ? <ListSkeleton rows={3} label="Loading comments" />
        : comments.threadsError ? <ErrorState message={commentErrorCopy(comments.threadsError)} onRetry={comments.retryThreads} />
        : groups && groups.open.length === 0 && groups.resolved.length === 0
          ? <EmptyState icon="comment" title="No comments yet" body="Start the conversation: threads, replies and @mentions live here." />
          : <>
            {groups && groups.open.length > 0 ? <ul className="space-y-3">
              {groups.open.map((thread) => <ThreadCard key={thread.id} thread={thread} />)}
            </ul> : null}
            {groups && groups.open.length === 0 && groups.resolved.length > 0 ? <p className="text-sm text-muted">Every thread is resolved.</p> : null}
            {groups && groups.resolved.length > 0 ? <>
              <button type="button" onClick={() => setShowResolved((value) => !value)} aria-expanded={showResolved} className={buttonQuiet}>
                <AppIcon name="chevron" className={`size-4 transition-transform motion-reduce:transition-none ${showResolved ? 'rotate-90' : ''}`} />
                {showResolved ? 'Hide resolved' : `Show resolved (${groups.resolved.length})`}
              </button>
              {showResolved ? <ul className="space-y-3">
                {groups.resolved.map((thread) => <ThreadCard key={thread.id} thread={thread} />)}
              </ul> : null}
            </> : null}
          </>}
    </section>
  </div>
}
