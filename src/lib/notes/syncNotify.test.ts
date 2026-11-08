import { describe, expect, it, vi } from 'vitest'
import { notifyNoteChanged, subscribeNoteChanged } from './syncNotify'

describe('syncNotify', () => {
  it('notifies subscribers with the changed note id', () => {
    const calls: string[] = []
    const unsubscribe = subscribeNoteChanged((noteId) => calls.push(noteId))
    notifyNoteChanged('n1')
    notifyNoteChanged('n2')
    expect(calls).toEqual(['n1', 'n2'])
    unsubscribe()
    notifyNoteChanged('n3')
    expect(calls).toEqual(['n1', 'n2'])
  })

  it('never throws: a broken listener does not break the others', () => {
    const calls: string[] = []
    const bad = vi.fn(() => { throw new Error('boom') })
    const unsubscribeBad = subscribeNoteChanged(bad)
    const unsubscribeGood = subscribeNoteChanged((noteId) => calls.push(noteId))
    expect(() => notifyNoteChanged('n1')).not.toThrow()
    expect(calls).toEqual(['n1'])
    unsubscribeBad()
    unsubscribeGood()
  })
})
