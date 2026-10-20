import { createDocument, type DocumentOperation, type IncantlyDocument } from '@incantly/core/document'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, NETWORK_ERROR } from '../api/errors'
import type { NoteTransaction } from '../api/notes'
import { NoteSync, type NoteSyncApi, type SyncState } from './noteSync'
import { MemoryNoteSyncStore, syncKey } from './syncStore'

const op = (text: string) => ({ type: 'replaceText', nodeId: 'paragraph:a', from: 0, to: 0, text }) as unknown as DocumentOperation
const revision = (revisionNumber: number) => ({ id: `rev${revisionNumber}`, revisionNumber }) as never

function doc(title = 'Note', text = '') {
  const document = createDocument({ id: 'doc-1', title })
  return text ? { ...document, metadata: { ...document.metadata, tags: [text] } } as IncantlyDocument : document
}

let store: MemoryNoteSyncStore
let api: { transact: ReturnType<typeof vi.fn>; saveCheckpoint: ReturnType<typeof vi.fn>; checkpoint: ReturnType<typeof vi.fn> }
let states: SyncState[]
let scheduled: { fn: () => void; ms: number }[]
let clock: number
let ids: number

async function open(options: Partial<Parameters<typeof NoteSync.open>[0]> = {}, server = { revisionNumber: 1, document: doc(), title: 'Note' }) {
  return NoteSync.open({
    userId: 'u1', noteId: 'n1', clientId: 'web_client1', api: api as unknown as NoteSyncApi, store,
    onState: (state) => states.push(state),
    schedule: (fn, ms) => { const entry = { fn, ms }; scheduled.push(entry); return () => { scheduled = scheduled.filter((item) => item !== entry) } },
    now: () => clock,
    newTransactionId: () => `txn:${++ids}xxxxxxxx`,
    ...options,
  }, server)
}

beforeEach(() => {
  store = new MemoryNoteSyncStore()
  let revisionCounter = 1
  api = {
    transact: vi.fn(async () => ({ version: 1, status: 'applied', transactionId: 'x', revision: revision(++revisionCounter) })),
    saveCheckpoint: vi.fn(async () => ({ revision: revision(++revisionCounter) })),
    checkpoint: vi.fn(async () => ({ revision: revision(revisionCounter), document: doc('Server') })),
  }
  states = []
  scheduled = []
  clock = 1_000
  ids = 0
})

describe('NoteSync', () => {
  it('batches operations after the idle window and sends them with the acknowledged base', async () => {
    const sync = await open()
    sync.record({ mode: 'incremental', operations: [op('a')], document: doc() })
    sync.record({ mode: 'incremental', operations: [op('b')], document: doc() })
    expect(api.transact).not.toHaveBeenCalled()
    expect(scheduled.some((entry) => entry.ms === 1500)).toBe(true)
    await sync.flushNow()
    expect(api.transact).toHaveBeenCalledTimes(1)
    const sent: NoteTransaction = api.transact.mock.calls[0][1]
    expect(sent).toMatchObject({ version: 1, clientId: 'web_client1', baseRevisionNumber: 1, operations: [op('a'), op('b')] })
    expect(sent.localSequence).toMatch(/^[1-9][0-9]*$/)
    expect(sync.current).toMatchObject({ status: 'saved', pending: 0, revisionNumber: 2 })
  })

  it('persists a sealed batch before sending it', async () => {
    const sync = await open()
    api.transact.mockImplementationOnce(async (_noteId: string, transaction: NoteTransaction) => {
      const saved = await store.get(syncKey('u1', 'n1'))
      expect(saved?.batches.map((batch) => batch.transactionId)).toContain(transaction.transactionId)
      return { version: 1, status: 'applied', transactionId: transaction.transactionId, revision: revision(2) }
    })
    sync.record({ mode: 'incremental', operations: [op('a')], document: doc() })
    await sync.flushNow()
    expect(api.transact).toHaveBeenCalledTimes(1)
    expect((await store.get(syncKey('u1', 'n1')))?.batches).toEqual([])
  })

  it('sends immediately once the op cap is reached', async () => {
    const sync = await open({ maxOps: 3 })
    sync.record({ mode: 'incremental', operations: [op('a'), op('b'), op('c')], document: doc() })
    await vi.waitFor(() => expect(api.transact).toHaveBeenCalledTimes(1))
  })

  it('keeps local sequences strictly increasing, even after reopening', async () => {
    const sync = await open()
    for (const text of ['a', 'b']) { sync.record({ mode: 'incremental', operations: [op(text)], document: doc() }); await sync.flushNow() }
    await sync.dispose()
    const reopened = await open()
    reopened.record({ mode: 'incremental', operations: [op('c')], document: doc() })
    await reopened.flushNow()
    const sequences = api.transact.mock.calls.map((call) => BigInt(call[1].localSequence))
    expect(sequences[1] > sequences[0] && sequences[2] > sequences[1]).toBe(true)
  })

  it('enters conflict on NOTE_TRANSACTION_CONFLICT and keeps the batch', async () => {
    api.transact.mockRejectedValueOnce(new ApiError(409, 'NOTE_TRANSACTION_CONFLICT', 'r', null))
    const sync = await open()
    sync.record({ mode: 'incremental', operations: [op('a')], document: doc() })
    await sync.flushNow()
    expect(sync.current.status).toBe('conflict')
    expect((await store.get(syncKey('u1', 'n1')))?.batches).toHaveLength(1)
    sync.record({ mode: 'incremental', operations: [op('b')], document: doc() })
    await sync.flushNow()
    expect(api.transact).toHaveBeenCalledTimes(1)
  })

  it('retries the identical payload after TRANSACTION_IN_PROGRESS or a network failure', async () => {
    api.transact
      .mockRejectedValueOnce(new ApiError(409, 'TRANSACTION_IN_PROGRESS', null, null))
      .mockRejectedValueOnce(new ApiError(0, NETWORK_ERROR, null, null))
    const sync = await open()
    sync.record({ mode: 'incremental', operations: [op('a')], document: doc() })
    await sync.flushNow()
    expect(sync.current.status).toBe('offline')
    expect(scheduled.some((entry) => entry.ms === 5000)).toBe(true)
    await sync.flushNow()
    expect(sync.current.status).toBe('offline')
    await sync.flushNow()
    expect(sync.current.status).toBe('saved')
    const [first, second, third] = api.transact.mock.calls.map((call) => call[1])
    expect(second).toEqual(first)
    expect(third).toEqual(first)
  })

  it('replaces a rejected batch (422) with a full-document save', async () => {
    api.transact.mockRejectedValueOnce(new ApiError(422, 'INVALID_NOTE_TRANSACTION', null, null))
    const sync = await open()
    const latest = doc('Note')
    sync.record({ mode: 'incremental', operations: [op('a')], document: latest })
    await sync.flushNow()
    expect(api.saveCheckpoint).toHaveBeenCalledTimes(1)
    expect(api.saveCheckpoint.mock.calls[0][2].metadata.title).toBe('Note')
    expect(sync.current.status).toBe('saved')
  })

  it('stops the queue on sequence errors', async () => {
    api.transact.mockRejectedValueOnce(new ApiError(409, 'CLIENT_SEQUENCE_REUSED', null, null))
    const sync = await open()
    sync.record({ mode: 'incremental', operations: [op('a')], document: doc() })
    await sync.flushNow()
    expect(sync.current.status).toBe('error')
  })

  it('lets a full document supersede unsent operations, and folds later edits into it', async () => {
    const sync = await open()
    sync.record({ mode: 'incremental', operations: [op('a')], document: doc() })
    sync.record({ mode: 'checkpoint', operations: [], document: doc('Note', 'structural') })
    sync.record({ mode: 'incremental', operations: [op('b')], document: doc('Note', 'after') })
    await sync.flushNow()
    expect(api.transact).not.toHaveBeenCalled()
    expect(api.saveCheckpoint).toHaveBeenCalledTimes(1)
    expect(api.saveCheckpoint.mock.calls[0][2].metadata.tags).toEqual(['after'])
  })

  it('sends sealed batches before a later full-document save', async () => {
    const sync = await open()
    sync.record({ mode: 'incremental', operations: [op('a')], document: doc() })
    const order: string[] = []
    api.transact.mockImplementationOnce(async () => { order.push('tx'); sync.record({ mode: 'checkpoint', operations: [], document: doc('Note', 'x') }); return { version: 1, status: 'applied', transactionId: 't', revision: revision(2) } })
    api.saveCheckpoint.mockImplementationOnce(async (_n: string, base: number) => { order.push(`put@${base}`); return { revision: revision(3) } })
    await sync.flushNow()
    expect(order).toEqual(['tx', 'put@2'])
  })

  it('renames through a full save and keeps the title on later saves', async () => {
    const sync = await open()
    sync.rename('  Photosynthesis  ')
    await sync.flushNow()
    expect(api.saveCheckpoint.mock.calls[0][2].metadata.title).toBe('Photosynthesis')
    sync.record({ mode: 'checkpoint', operations: [], document: doc('Note', 'edit') })
    await sync.flushNow()
    expect(api.saveCheckpoint.mock.calls[1][2].metadata.title).toBe('Photosynthesis')
  })

  it('never lets a stale save overwrite: STALE_NOTE_REVISION → conflict, then keepMine saves on the latest base', async () => {
    api.saveCheckpoint.mockRejectedValueOnce(new ApiError(409, 'STALE_NOTE_REVISION', null, null))
    api.checkpoint.mockResolvedValue({ revision: revision(9), document: doc('Server') })
    const sync = await open()
    const mine = doc('Note', 'mine')
    sync.record({ mode: 'checkpoint', operations: [], document: mine })
    await sync.flushNow()
    expect(sync.current.status).toBe('conflict')
    await sync.keepMine()
    expect(api.saveCheckpoint).toHaveBeenLastCalledWith('n1', 9, expect.objectContaining({ metadata: expect.objectContaining({ tags: ['mine'] }) }))
    expect(sync.current.status).toBe('saved')
  })

  it('takeServer discards local work and returns the validated server document', async () => {
    api.transact.mockRejectedValueOnce(new ApiError(409, 'NOTE_TRANSACTION_CONFLICT', null, null))
    api.checkpoint.mockResolvedValue({ revision: revision(7), document: doc('Server') })
    const sync = await open()
    sync.record({ mode: 'incremental', operations: [op('a')], document: doc() })
    await sync.flushNow()
    const shown = await sync.takeServer()
    expect(shown.metadata.title).toBe('Server')
    expect(sync.hasPending).toBe(false)
    expect(sync.current).toMatchObject({ status: 'saved', revisionNumber: 7 })
  })

  it('reopens with unsynced local work instead of the server copy, then sends it', async () => {
    api.transact.mockRejectedValueOnce(new ApiError(0, NETWORK_ERROR, null, null))
    const first = await open()
    first.record({ mode: 'incremental', operations: [op('a')], document: doc('Note', 'local') })
    await first.flushNow()
    await first.dispose()
    const reopened = await open({}, { revisionNumber: 1, document: doc('Server'), title: 'Server' })
    expect(reopened.document?.metadata.tags).toEqual(['local'])
    await vi.waitFor(() => expect(reopened.current.status).toBe('saved'))
    expect(api.transact).toHaveBeenCalledTimes(2)
    expect(api.transact.mock.calls[1][1]).toEqual(api.transact.mock.calls[0][1])
  })

  it('marks a deleted note as gone', async () => {
    api.transact.mockRejectedValueOnce(new ApiError(404, 'NOTE_NOT_FOUND', null, null))
    const sync = await open()
    sync.record({ mode: 'incremental', operations: [op('a')], document: doc() })
    await sync.flushNow()
    expect(sync.current.status).toBe('gone')
  })

  it('ignores no-op changes', async () => {
    const sync = await open()
    sync.record({ mode: 'none', operations: [], document: doc() })
    expect(sync.hasPending).toBe(false)
    expect(states.at(-1)?.status ?? 'saved').toBe('saved')
  })
})
