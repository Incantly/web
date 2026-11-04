import { apiFetch } from './client'
import type { Schema } from './types'

export type CommentCreatedDto = Schema<'CommentCreatedDto'>

/** One inline in a comment paragraph: plain text, a mention, or a link. */
export type CommentTextInline = { type: 'text'; text: string }
/** A mention of someone (or an agent) who shares the note. `userId` is bare — no `user:` prefix, except `agent:…` IDs which post as-is. */
export type CommentMentionInline = { type: 'mention'; userId: string }
/** http(s) links only; anything else is `COMMENT_BODY_INVALID`. */
export type CommentLinkInline = { type: 'link'; url: string; text?: string }
export type CommentInline = CommentTextInline | CommentMentionInline | CommentLinkInline

export type CreateCommentBody = {
  /** Reply into this thread. Omit to start a new thread. Unknown threads are 404 `THREAD_NOT_FOUND`. */
  threadId?: string
  /** Paragraphs of inlines. Limits: 50 paragraphs, 100 inlines each, 4000 characters total, 20 mentions. */
  paragraphs: CommentInline[][]
  /** Thread anchor metadata for a new thread (bounded values, at most 16 keys). Ignored on replies. */
  anchor?: Record<string, string | number | boolean>
}

const id = (value: string) => encodeURIComponent(value)

/** Thin wrapper over the comment creation route (frontend-api-integration.md, "Comments"). */
export const commentsApi = {
  /**
   * Creates a thread or a reply through the server (`POST /v1/notes/{noteId}/comments`).
   * One idempotency key per logical comment, reused unchanged on retry: an exact
   * retry returns the stored comment instead of duplicating it. 503
   * `LIVE_COLLABORATION_UNAVAILABLE` retries with the same key via the shared client.
   */
  async create(noteId: string, body: CreateCommentBody, options: { idempotencyKey: string; signal?: AbortSignal }) {
    return (await apiFetch<CommentCreatedDto>(`/v1/notes/${id(noteId)}/comments`, {
      method: 'POST',
      body,
      idempotencyKey: options.idempotencyKey,
      signal: options.signal,
    })).data
  },
}
