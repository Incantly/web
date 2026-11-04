import { describe, expect, it } from 'vitest'
import { DELETE_NOTE_COPY, deleteNoteTitle, formatTrashDate, trashDeletedCopy, trashPurgeCopy } from './trashModel'

const expected = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date('2026-10-05T12:00:00.000Z'))

describe('formatTrashDate', () => {
  it('formats the backend timestamp as a plain date', () => {
    expect(formatTrashDate('2026-10-05T12:00:00.000Z')).toBe(expected)
  })

  it('falls back for missing or unparseable values', () => {
    expect(formatTrashDate(null)).toBe('Unknown date')
    expect(formatTrashDate(undefined)).toBe('Unknown date')
    expect(formatTrashDate('not-a-date')).toBe('Unknown date')
  })
})

describe('trash row copy', () => {
  it('shows the deleted date', () => {
    expect(trashDeletedCopy('2026-10-05T12:00:00.000Z')).toBe(`Deleted ${expected}`)
    expect(trashDeletedCopy(null)).toBe('Deleted Unknown date')
  })

  it('shows when the automatic purge lands, from the item purgeAt', () => {
    expect(trashPurgeCopy('2026-11-04T12:00:00.000Z')).toMatch(/^Permanently deleted on /)
    expect(trashPurgeCopy('2026-11-04T12:00:00.000Z')).toContain('2026')
  })
})

describe('delete confirmation copy', () => {
  it('keeps the soft-delete wording and confirm label', () => {
    expect(DELETE_NOTE_COPY.confirmLabel).toBe('Delete note')
    expect(DELETE_NOTE_COPY.body).toMatch(/restorable for 30 days from Trash/)
    expect(DELETE_NOTE_COPY.body).toMatch(/loses access immediately/)
  })

  it('titles the dialog with the note name', () => {
    expect(deleteNoteTitle('Lecture 3')).toBe('Delete “Lecture 3”?')
    expect(deleteNoteTitle('')).toBe('Delete “this note”?')
  })
})
