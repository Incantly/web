import { describe, expect, it } from 'vitest'
import { ApiError } from '../../../lib/api/errors'
import type { CollaboratorsDto } from '../../../lib/api/sharing'
import {
  buildCommentParagraphs,
  commentErrorCopy,
  commentMentionUserId,
  commentParagraphsHaveContent,
  extractMentionQuery,
  formatCommentTime,
  insertMention,
  mentionDisplayName,
  myCommentAccess,
  partitionThreads,
  sortThreads,
  threadResolveLabel,
} from './commentsModel'

const collaborators: Pick<CollaboratorsDto, 'owner' | 'grants'> = {
  owner: { id: 'u_owner', name: 'Owner', avatarUrl: null },
  grants: [
    { id: 'g1', role: 'COMMENTER', version: 1, createdAt: '2026-01-01', user: { id: 'u_ada', name: 'Ada', avatarUrl: null } },
    { id: 'g2', role: 'VIEWER', version: 1, createdAt: '2026-01-01', user: { id: 'u_view', name: 'Vic', avatarUrl: null } },
  ],
}

describe('myCommentAccess', () => {
  it('lets the owner comment', () => {
    expect(myCommentAccess(collaborators, 'u_owner')).toEqual({ role: 'OWNER', canComment: true })
  })

  it('reads the caller’s grant role', () => {
    expect(myCommentAccess(collaborators, 'u_ada')).toEqual({ role: 'COMMENTER', canComment: true })
    expect(myCommentAccess(collaborators, 'u_view')).toEqual({ role: 'VIEWER', canComment: false })
  })

  it('denies strangers and missing lists', () => {
    expect(myCommentAccess(collaborators, 'u_stranger')).toEqual({ role: null, canComment: false })
    expect(myCommentAccess(null, 'u_ada')).toEqual({ role: null, canComment: false })
    expect(myCommentAccess(undefined, 'u_ada')).toEqual({ role: null, canComment: false })
  })
})

describe('commentMentionUserId', () => {
  it('strips the user namespace but keeps agent and bare ids', () => {
    expect(commentMentionUserId('user:u_ada')).toBe('u_ada')
    expect(commentMentionUserId('agent:writer')).toBe('agent:writer')
    expect(commentMentionUserId('u_ada')).toBe('u_ada')
  })
})

describe('extractMentionQuery', () => {
  it('reads the token before the caret', () => {
    expect(extractMentionQuery('Hi @ad', 6)).toEqual({ query: 'ad', start: 3 })
    expect(extractMentionQuery('@ada', 4)).toEqual({ query: 'ada', start: 0 })
  })

  it('ignores email addresses and finished mentions', () => {
    expect(extractMentionQuery('mail ada@x.com', 12)).toBeNull()
    expect(extractMentionQuery('Hi @ada ', 8)).toBeNull()
    expect(extractMentionQuery('no mention', 5)).toBeNull()
  })

  it('clamps the caret into the draft', () => {
    expect(extractMentionQuery('@a', 99)).toEqual({ query: 'a', start: 0 })
    expect(extractMentionQuery('@a', -1)).toBeNull()
  })
})

describe('insertMention', () => {
  it('replaces the token with the picked name plus a space', () => {
    expect(insertMention('Hi @ad rest', 6, 3, 'Ada Lovelace')).toEqual({ text: 'Hi @Ada Lovelace  rest', cursor: 17 })
    expect(insertMention('@a', 2, 0, 'Ada')).toEqual({ text: '@Ada ', cursor: 5 })
  })
})

describe('buildCommentParagraphs', () => {
  it('builds plain-text paragraphs and drops empty lines', () => {
    expect(buildCommentParagraphs('One\n\nTwo', [])).toEqual([
      [{ type: 'text', text: 'One' }],
      [{ type: 'text', text: 'Two' }],
    ])
    expect(buildCommentParagraphs('   \n', [])).toEqual([[{ type: 'text', text: '   ' }]])
  })

  it('converts intact mentions and keeps surrounding text', () => {
    const paragraphs = buildCommentParagraphs('Thanks @Ada Lovelace!', [{ name: 'Ada Lovelace', userId: 'u_ada' }])
    expect(paragraphs).toEqual([[
      { type: 'text', text: 'Thanks ' },
      { type: 'mention', userId: 'u_ada' },
      { type: 'text', text: '!' },
    ]])
  })

  it('maps duplicate names to occurrences in order', () => {
    const paragraphs = buildCommentParagraphs('@Ada and @Ada', [
      { name: 'Ada', userId: 'u_1' },
      { name: 'Ada', userId: 'u_2' },
    ])
    expect(paragraphs).toEqual([[
      { type: 'mention', userId: 'u_1' },
      { type: 'text', text: ' and ' },
      { type: 'mention', userId: 'u_2' },
    ]])
  })

  it('leaves edited-away or extended mentions as plain text', () => {
    expect(buildCommentParagraphs('Hi @Ade', [{ name: 'Ada', userId: 'u_ada' }])).toEqual([
      [{ type: 'text', text: 'Hi @Ade' }],
    ])
    // `@Ada` inside `@Adams` is a different word, not the recorded mention.
    expect(buildCommentParagraphs('Hi @Adams', [{ name: 'Ada', userId: 'u_ada' }])).toEqual([
      [{ type: 'text', text: 'Hi @Adams' }],
    ])
  })

  it('detects content from text or surviving mentions', () => {
    expect(commentParagraphsHaveContent(buildCommentParagraphs('  ', []))).toBe(false)
    expect(commentParagraphsHaveContent(buildCommentParagraphs('hi', []))).toBe(true)
    expect(commentParagraphsHaveContent(buildCommentParagraphs('@Ada ', [{ name: 'Ada', userId: 'u_1' }]))).toBe(true)
    expect(commentParagraphsHaveContent(buildCommentParagraphs('@Ax ', [{ name: 'Ada', userId: 'u_1' }]))).toBe(true)
  })
})

describe('mentionDisplayName', () => {
  it('renders resolved names and anonymizes the rest', () => {
    const authors = new Map([['user:u_ada', 'Ada Lovelace'], ['user:blank', '  ']])
    expect(mentionDisplayName(authors, 'user:u_ada')).toBe('@Ada Lovelace')
    expect(mentionDisplayName(authors, 'user:ghost')).toBe('@Someone')
    expect(mentionDisplayName(authors, 'user:blank')).toBe('@Someone')
  })
})

const thread = (id: string, resolved: boolean, createdAt: string, updatedAt: string) => ({ id, resolved, createdAt, updatedAt })

describe('sortThreads and partitionThreads', () => {
  const threads = [
    thread('th_new', false, '2026-02-03T00:00:00Z', '2026-02-03T00:00:00Z'),
    thread('th_old', false, '2026-02-01T00:00:00Z', '2026-02-01T00:00:00Z'),
    thread('th_done_old', true, '2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z'),
    thread('th_done_new', true, '2026-01-02T00:00:00Z', '2026-02-04T00:00:00Z'),
  ]

  it('lists open threads oldest-first, then resolved ones recent-first', () => {
    expect(sortThreads(threads).map((item) => item.id)).toEqual(['th_old', 'th_new', 'th_done_new', 'th_done_old'])
  })

  it('partitions into open and resolved groups', () => {
    const groups = partitionThreads(threads)
    expect(groups.open.map((item) => item.id)).toEqual(['th_old', 'th_new'])
    expect(groups.resolved.map((item) => item.id)).toEqual(['th_done_new', 'th_done_old'])
  })

  it('never mutates the input', () => {
    const before = threads.map((item) => item.id)
    sortThreads(threads)
    expect(threads.map((item) => item.id)).toEqual(before)
  })
})

describe('threadResolveLabel', () => {
  it('labels the action for the current state', () => {
    expect(threadResolveLabel(false)).toBe('Resolve thread')
    expect(threadResolveLabel(true)).toBe('Reopen thread')
  })
})

describe('formatCommentTime', () => {
  const now = Date.parse('2026-11-04T12:00:00Z')

  it('ages comments relatively up to a week', () => {
    expect(formatCommentTime(new Date(now - 30_000), now)).toBe('Just now')
    expect(formatCommentTime(new Date(now - 5 * 60_000), now)).toBe('5m ago')
    expect(formatCommentTime(new Date(now - 3 * 3_600_000), now)).toBe('3h ago')
    expect(formatCommentTime(new Date(now - 2 * 86_400_000), now)).toBe('2d ago')
    expect(formatCommentTime(new Date(now + 60_000), now)).toBe('Just now')
  })

  it('falls back to a date past a week and on garbage', () => {
    const old = formatCommentTime(new Date(now - 30 * 86_400_000), now)
    expect(old).not.toContain('ago')
    expect(old.length).toBeGreaterThan(0)
    expect(formatCommentTime('not a time', now)).toBe('Unknown time')
  })
})

describe('commentErrorCopy', () => {
  const api = (status: number, code: string) => new ApiError(status, code, null, null)

  it('maps every comment-specific code', () => {
    expect(commentErrorCopy(api(400, 'COMMENT_BODY_INVALID'))).toContain('4,000')
    expect(commentErrorCopy(api(400, 'COMMENT_MENTION_INVALID'))).toContain('Remove the mention')
    expect(commentErrorCopy(api(403, 'COMMENTS_NOT_ALLOWED'))).toContain('turned off')
    expect(commentErrorCopy(api(429, 'COMMENT_LIMIT_REACHED'))).toContain('budget')
    expect(commentErrorCopy(api(409, 'NOTE_NOT_SHARED'))).toContain('isn’t shared')
    expect(commentErrorCopy(api(404, 'THREAD_NOT_FOUND'))).toContain('gone')
  })

  it('delegates shared codes and unknown failures to the common messages', () => {
    expect(commentErrorCopy(api(403, 'NOTE_ACCESS_DENIED'))).toContain('no longer have access')
    expect(commentErrorCopy(api(503, 'LIVE_COLLABORATION_UNAVAILABLE'))).toContain('unavailable')
    expect(commentErrorCopy(api(429, 'RATE_LIMITED'))).toContain('Too many requests')
    expect(commentErrorCopy(new Error('boom'))).toBe('Something went wrong. Please try again.')
  })
})
