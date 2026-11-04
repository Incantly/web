import type { CommentInline } from '../../../lib/api/comments'
import { apiErrorMessage, isApiError } from '../../../lib/api/errors'
import type { CollaboratorsDto, GrantRole } from '../../../lib/api/sharing'

/** Server comment limits the composer enforces before posting (the backend re-checks). */
export const COMMENT_BODY_MAX_CHARS = 4000
export const COMMENT_MAX_MENTIONS = 20

/** A mention picked from autocomplete and recorded in the draft. `userId` posts as-is. */
export type RecordedMention = { name: string; userId: string }

/** The caller's commenting position on a note. Null when the grants list is missing or has no row for them. */
export type CommentRole = 'OWNER' | GrantRole | null

/**
 * Whether the signed-in user may comment. A UI hint only: the backend enforces
 * roles on every mutation (`NOTE_ACCESS_DENIED` for viewers).
 */
export function myCommentAccess(
  collaborators: Pick<CollaboratorsDto, 'owner' | 'grants'> | null | undefined,
  userId: string,
): { role: CommentRole; canComment: boolean } {
  if (collaborators?.owner.id === userId) return { role: 'OWNER', canComment: true }
  const grant = collaborators?.grants.find((row) => row.user.id === userId)
  if (!grant) return { role: null, canComment: false }
  return { role: grant.role, canComment: grant.role !== 'VIEWER' }
}

/**
 * The mention post ID for an autocomplete suggestion: suggestion IDs are
 * namespaced (`user:…`), but comment mentions are bare Incantly user IDs.
 * Agent mentions (`agent:…`) post as-is and trigger backend runs.
 */
export function commentMentionUserId(suggestionId: string): string {
  return suggestionId.startsWith('user:') ? suggestionId.slice('user:'.length) : suggestionId
}

/** An `@query` token ending at the caret, or null when the caret is not inside one. */
export type MentionToken = { query: string; start: number }

/**
 * Reads the @mention token before the caret for autocomplete. The `@` must
 * start the line or follow whitespace, so email addresses never trigger it.
 */
export function extractMentionQuery(draft: string, cursor: number): MentionToken | null {
  const before = draft.slice(0, Math.max(0, Math.min(cursor, draft.length)))
  const match = /(?:^|\s)@([\p{L}\p{N}._-]*)$/u.exec(before)
  if (!match) return null
  return { query: match[1], start: before.length - match[1].length - 1 }
}

/** Replaces the token at `tokenStart` with the picked name plus a trailing space. */
export function insertMention(draft: string, cursor: number, tokenStart: number, name: string): { text: string; cursor: number } {
  const text = `${draft.slice(0, tokenStart)}@${name} ${draft.slice(cursor)}`
  return { text, cursor: tokenStart + name.length + 2 }
}

const WORD_CHAR = /[\p{L}\p{N}_]/u

/**
 * Builds the `POST /comments` paragraphs from a draft plus its recorded
 * mentions. Each recorded mention converts its first still-intact `@name`
 * occurrence; edited-away mentions stay as plain text. Wholly empty lines are
 * dropped. Faithful by design: limits are the server's job (`COMMENT_BODY_INVALID`).
 */
export function buildCommentParagraphs(text: string, mentions: readonly RecordedMention[]): CommentInline[][] {
  const paragraphs: CommentInline[][] = []
  for (const line of text.split('\n')) {
    const claimed: { index: number; end: number; userId: string }[] = []
    for (const mention of mentions) {
      if (!mention.name) continue
      const token = `@${mention.name}`
      let from = 0
      for (;;) {
        const index = line.indexOf(token, from)
        if (index < 0) break
        const after = line[index + token.length]
        const intact = after === undefined || !WORD_CHAR.test(after)
        const overlaps = claimed.some((span) => index < span.end && span.index < index + token.length)
        if (intact && !overlaps) {
          claimed.push({ index, end: index + token.length, userId: mention.userId })
          break
        }
        from = index + 1
      }
    }
    claimed.sort((a, b) => a.index - b.index)
    const inlines: CommentInline[] = []
    let rest = 0
    for (const span of claimed) {
      if (span.index > rest) inlines.push({ type: 'text', text: line.slice(rest, span.index) })
      inlines.push({ type: 'mention', userId: span.userId })
      rest = span.end
    }
    if (rest < line.length) inlines.push({ type: 'text', text: line.slice(rest) })
    if (inlines.length > 0) paragraphs.push(inlines)
  }
  return paragraphs
}

/** True when built paragraphs carry any text or mention (blank drafts never post). */
export function commentParagraphsHaveContent(paragraphs: readonly (readonly CommentInline[])[]): boolean {
  return paragraphs.some((line) =>
    line.some((inline) => inline.type === 'mention' || (inline.type === 'text' && inline.text.trim().length > 0)),
  )
}

/** One rendered piece of a thread comment. Bodies are untrusted: links stay text, never anchors. */
export type CommentSegment =
  | { type: 'text'; text: string }
  | { type: 'mention'; userId: string }
  | { type: 'link'; url: string; text: string | null }

/**
 * A Liveblocks comment body as renderable paragraphs. Defensive: unknown or
 * malformed shapes yield no segments rather than throwing, since bodies are
 * untrusted text from other users.
 */
export function threadCommentSegments(body: unknown): CommentSegment[][] {
  if (typeof body !== 'object' || body === null) return []
  const content = (body as { content?: unknown }).content
  if (!Array.isArray(content)) return []
  const paragraphs: CommentSegment[][] = []
  for (const block of content) {
    if (typeof block !== 'object' || block === null || (block as { type?: unknown }).type !== 'paragraph') continue
    const children = (block as { children?: unknown }).children
    if (!Array.isArray(children)) continue
    const segments: CommentSegment[] = []
    for (const child of children) {
      if (typeof child !== 'object' || child === null) continue
      const node = child as { type?: unknown; text?: unknown; id?: unknown; url?: unknown }
      if (node.type === 'mention' && typeof node.id === 'string') {
        segments.push({ type: 'mention', userId: node.id })
      } else if (node.type === 'link' && typeof node.url === 'string') {
        segments.push({ type: 'link', url: node.url, text: typeof node.text === 'string' ? node.text : null })
      } else if (typeof node.text === 'string' && (node.type === undefined || node.type === 'text')) {
        segments.push({ type: 'text', text: node.text })
      }
    }
    if (segments.length > 0) paragraphs.push(segments)
  }
  return paragraphs
}

/** A mention rendered against resolved author names; unknown IDs stay anonymous. */
export function mentionDisplayName(authors: ReadonlyMap<string, string>, userId: string): string {
  const name = authors.get(userId)?.trim()
  return name ? `@${name}` : '@Someone'
}

export type ThreadSummary = { id: string; resolved: boolean; createdAt: Date | string; updatedAt: Date | string }

/** Open threads first (oldest first), then resolved ones (recently updated first). */
export function sortThreads<T extends ThreadSummary>(threads: readonly T[]): T[] {
  const time = (value: Date | string) => {
    const parsed = value instanceof Date ? value.getTime() : Date.parse(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return [...threads].sort((a, b) => {
    if (a.resolved !== b.resolved) return a.resolved ? 1 : -1
    return a.resolved ? time(b.updatedAt) - time(a.updatedAt) : time(a.createdAt) - time(b.createdAt)
  })
}

/** Splits threads into open and resolved groups, each in display order. */
export function partitionThreads<T extends ThreadSummary>(threads: readonly T[]): { open: T[]; resolved: T[] } {
  const sorted = sortThreads(threads)
  return { open: sorted.filter((thread) => !thread.resolved), resolved: sorted.filter((thread) => thread.resolved) }
}

/** Resolve/reopen button label for a thread. */
export function threadResolveLabel(resolved: boolean): string {
  return resolved ? 'Reopen thread' : 'Resolve thread'
}

/** Badge copy for a resolved thread. */
export const THREAD_RESOLVED_BADGE = 'Resolved'

const commentDate = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })

/** A comment timestamp as relative age, falling back to a plain date past a week. */
export function formatCommentTime(value: string | Date, nowMs: number = Date.now()): string {
  const time = value instanceof Date ? value.getTime() : Date.parse(value)
  if (!Number.isFinite(time)) return 'Unknown time'
  const minutes = Math.max(0, Math.floor((nowMs - time) / 60_000))
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return commentDate.format(new Date(time))
}

/** Friendly copy for the comment routes' stable codes; everything else delegates to the shared messages. */
const commentMessages: Record<string, string> = {
  COMMENT_BODY_INVALID: 'That comment couldn’t be posted. Keep it under 4,000 characters with plain text and @mentions only.',
  COMMENT_MENTION_INVALID: 'Someone you mentioned can’t see this note any more. Remove the mention and try again.',
  COMMENTS_NOT_ALLOWED: 'Comments are turned off for this note.',
  COMMENT_LIMIT_REACHED: 'This note’s monthly comment budget is used up. Try again after it resets.',
  NOTE_NOT_SHARED: 'This note isn’t shared, so comments aren’t available.',
  THREAD_NOT_FOUND: 'That thread is gone. It may have been deleted.',
}

/** User-facing copy for a comment failure, keyed by the backend's stable code. */
export function commentErrorCopy(error: unknown): string {
  if (isApiError(error)) {
    const known = commentMessages[error.code]
    if (known) return known
  }
  return apiErrorMessage(error)
}
