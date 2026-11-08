import { createDocument, createParagraph, type DocumentOperation, type IncantlyDocument } from '@incantly/canvas-core/document'
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

function contentDoc(entries: [id: string, text: string][], title = 'Note') {
  return createDocument({ id: 'doc-1', title, content: entries.map(([id, text]) => createParagraph({ id, text })) })
}

let store: MemoryNoteSyncStore
let api: { transact: ReturnType<typeof vi.fn>; saveCheckpoint: ReturnType<typeof vi.fn>; checkpoint: ReturnType<typeof vi.fn> }
let states: SyncState[]
let scheduled: { fn: () => void; ms: number }[]
let clock: number
let ids: number

async function open(options: Partial<Parameters<typeof NoteSync.open>[0]> = {}, server = { revisionNumber: 1, document: doc(), title: 'Note' }) {
  return NoteSync.open({
    userId: 'u1', noteId: 'n1', clientId: 'web_client1', tabSessionId: 'tab_session1', api: api as unknown as NoteSyncApi, store,
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
    expect(scheduled.some((entry) => entry.ms === 1000)).toBe(true)
    await sync.flushNow()
    expect(api.transact).toHaveBeenCalledTimes(1)
    const sent: NoteTransaction = api.transact.mock.calls[0][1]
    expect(sent).toMatchObject({ version: 1, clientId: 'web_client1', tabSessionId: 'tab_session1', baseRevisionNumber: 1, operations: [op('a'), op('b')] })
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

  it('recovers from a transient conflict without surfacing it', async () => {
    api.transact.mockRejectedValueOnce(new ApiError(409, 'NOTE_TRANSACTION_CONFLICT', 'r', null))
    const sync = await open()
    sync.record({ mode: 'incremental', operations: [op('a')], document: doc() })
    await sync.flushNow()
    expect(sync.current).toMatchObject({ status: 'saved', pending: 0 })
    expect(api.transact).toHaveBeenCalledTimes(1)
    expect(api.checkpoint).toHaveBeenCalledTimes(1)
    expect((await store.get(syncKey('u1', 'n1')))?.batches).toEqual([])
  })

  it('wedges with a background retry when conflicts persist, then heals without losing edits', async () => {
    let calls = 0
    api.transact.mockImplementation(async () => {
      calls += 1
      if (calls <= 6) throw new ApiError(409, 'NOTE_TRANSACTION_CONFLICT', 'r', null)
      return { version: 1, status: 'applied', transactionId: 'x', revision: revision(9) }
    })
    api.checkpoint.mockResolvedValue({ revision: revision(9), document: contentDoc([['paragraph:a', 'server']]) })
    const sync = await open()
    const mine = contentDoc([['paragraph:a', 'mine']])
    sync.record({ mode: 'incremental', operations: [op('a')], document: mine })
    await sync.flushNow()
    expect(sync.current.status).toBe('conflict')
    expect((await store.get(syncKey('u1', 'n1')))?.batches).toHaveLength(1)
    expect(scheduled.some((entry) => entry.ms === 5000)).toBe(true)
    // The background loop retries with backoff while the dialog stays available.
    scheduled.find((entry) => entry.ms === 5000)!.fn()
    await vi.waitFor(() => expect(scheduled.some((entry) => entry.ms === 10000)).toBe(true))
    expect(sync.current.status).toBe('conflict')
    scheduled.find((entry) => entry.ms === 10000)!.fn()
    await vi.waitFor(() => expect(sync.current).toMatchObject({ status: 'saved', pending: 0 }))
    expect(api.transact).toHaveBeenCalledTimes(7)
  })

  it('wedges instead of auto-rebasing when local is empty but the server has text', async () => {
    api.transact.mockRejectedValue(new ApiError(409, 'NOTE_TRANSACTION_CONFLICT', 'r', null))
    api.checkpoint.mockResolvedValue({ revision: revision(9), document: contentDoc([['paragraph:a', 'server text']]) })
    const sync = await open()
    sync.record({ mode: 'incremental', operations: [op('a')], document: contentDoc([]) })
    await sync.flushNow()
    // The user must choose: an empty local document must never auto-delete server content.
    expect(sync.current.status).toBe('conflict')
    expect(api.transact).toHaveBeenCalledTimes(1)
    for (const call of api.transact.mock.calls) {
      const sent: NoteTransaction = call[1]
      expect(sent.operations.some((item) => item.type === 'deleteNode')).toBe(false)
    }
    expect((await store.get(syncKey('u1', 'n1')))?.batches).toHaveLength(1)
  })

  it('persists edits recorded into a conflict', async () => {
    api.transact.mockRejectedValue(new ApiError(409, 'NOTE_TRANSACTION_CONFLICT', 'r', null))
    api.checkpoint.mockResolvedValue({ revision: revision(9), document: contentDoc([['paragraph:a', 'server']]) })
    const sync = await open()
    const mine = contentDoc([['paragraph:a', 'mine']])
    sync.record({ mode: 'incremental', operations: [op('a')], document: mine })
    await sync.flushNow()
    expect(sync.current.status).toBe('conflict')
    sync.record({ mode: 'incremental', operations: [op('b')], document: mine })
    expect(scheduled.some((entry) => entry.ms === 300)).toBe(true)
    await sync.dispose()
    expect((await store.get(syncKey('u1', 'n1')))?.open).toHaveLength(1)
  })

  it('flushes continuously-typed work without waiting for idle', async () => {
    const sync = await open()
    sync.record({ mode: 'incremental', operations: [op('a')], document: doc() })
    expect(api.transact).not.toHaveBeenCalled()
    clock += 2_500
    sync.record({ mode: 'incremental', operations: [op('b')], document: doc() })
    await vi.waitFor(() => expect(sync.current).toMatchObject({ status: 'saved' }))
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

  it('rebases a rejected batch (422) onto the head instead of a full save', async () => {
    api.transact.mockRejectedValueOnce(new ApiError(422, 'INVALID_NOTE_TRANSACTION', null, null))
    api.checkpoint.mockResolvedValue({ revision: revision(9), document: contentDoc([['paragraph:a', 'server']]) })
    const sync = await open()
    sync.record({ mode: 'incremental', operations: [op('a')], document: contentDoc([['paragraph:a', 'mine']]) })
    await sync.flushNow()
    expect(api.saveCheckpoint).not.toHaveBeenCalled()
    expect(api.transact).toHaveBeenCalledTimes(2)
    expect(api.transact.mock.calls[1][1]).toMatchObject({ baseRevisionNumber: 9 })
    expect(api.transact.mock.calls[1][1].operations).toMatchObject([{ type: 'updateNode', nodeId: 'paragraph:a' }])
    expect(sync.current.status).toBe('saved')
  })

  it('recovers from a sequence error with fresh identities', async () => {
    api.transact.mockRejectedValueOnce(new ApiError(409, 'CLIENT_SEQUENCE_REUSED', null, null))
    api.checkpoint.mockResolvedValue({ revision: revision(9), document: contentDoc([['paragraph:a', 'server']]) })
    const sync = await open()
    sync.record({ mode: 'incremental', operations: [op('a')], document: contentDoc([['paragraph:a', 'mine']]) })
    await sync.flushNow()
    expect(api.transact).toHaveBeenCalledTimes(2)
    const [first, second] = api.transact.mock.calls.map((call) => call[1])
    expect(second.transactionId).not.toBe(first.transactionId)
    expect(BigInt(second.localSequence) > BigInt(first.localSequence)).toBe(true)
    expect(second).toMatchObject({ baseRevisionNumber: 9 })
    expect(sync.current.status).toBe('saved')
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

  it('rebases a stale full save (STALE_NOTE_REVISION) onto the head instead of wedging', async () => {
    api.saveCheckpoint.mockRejectedValueOnce(new ApiError(409, 'STALE_NOTE_REVISION', null, null))
    api.checkpoint.mockResolvedValue({ revision: revision(9), document: contentDoc([['paragraph:a', 'server']]) })
    const sync = await open()
    sync.record({ mode: 'checkpoint', operations: [], document: contentDoc([['paragraph:a', 'mine']]) })
    await sync.flushNow()
    expect(api.saveCheckpoint).toHaveBeenCalledTimes(1)
    expect(api.transact).toHaveBeenCalledTimes(1)
    expect(api.transact.mock.calls[0][1]).toMatchObject({ baseRevisionNumber: 9 })
    expect(api.transact.mock.calls[0][1].operations).toMatchObject([{ type: 'updateNode', nodeId: 'paragraph:a' }])
    expect(sync.current.status).toBe('saved')
  })

  it('requeues a stale rename on an unshared note as a PUT instead of dropping the title', async () => {
    api.saveCheckpoint.mockRejectedValueOnce(new ApiError(409, 'STALE_NOTE_REVISION', null, null))
    api.checkpoint.mockResolvedValue({ revision: revision(9), document: contentDoc([['paragraph:a', 'server']]) })
    const sync = await open()
    sync.rename('Renamed')
    await sync.flushNow()
    expect(api.transact).not.toHaveBeenCalled()
    expect(api.saveCheckpoint).toHaveBeenCalledTimes(2)
    expect(api.saveCheckpoint.mock.calls[1][1]).toBe(9)
    expect(api.saveCheckpoint.mock.calls[1][2].metadata.title).toBe('Renamed')
    expect(api.saveCheckpoint.mock.calls[1][2].content.map((node: { id: string }) => node.id)).toEqual(['paragraph:a'])
    expect(sync.current.status).toBe('saved')
  })

  it('keeps the original base when rebase gates fail', async () => {
    api.transact.mockRejectedValue(new ApiError(409, 'NOTE_TRANSACTION_CONFLICT', 'r', null))
    api.checkpoint.mockResolvedValue({ revision: revision(9), document: { broken: true } as never })
    const sync = await open()
    sync.record({ mode: 'incremental', operations: [op('a')], document: contentDoc([['paragraph:a', 'mine']]) })
    await sync.flushNow()
    expect(sync.current.status).toBe('conflict')
    expect((await store.get(syncKey('u1', 'n1')))?.baseRevisionNumber).toBe(1)
    expect((await store.get(syncKey('u1', 'n1')))?.batches).toHaveLength(1)
    expect(api.transact).toHaveBeenCalledTimes(1)
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

  it('sends a shared rename with unsaved changes through transactions, never PUT', async () => {
    const server = contentDoc([['paragraph:a', 'server']])
    const sync = await open({ shared: true }, { revisionNumber: 1, document: server, title: 'Note' })
    sync.record({ mode: 'checkpoint', operations: [], document: contentDoc([['paragraph:a', 'edited']]) })
    sync.rename('Renamed')
    await sync.flushNow()
    expect(api.saveCheckpoint).not.toHaveBeenCalled()
    expect(api.checkpoint).not.toHaveBeenCalled()
    expect(api.transact).toHaveBeenCalledTimes(1)
    expect(api.transact.mock.calls[0][1]).toMatchObject({ baseRevisionNumber: 1 })
    expect(api.transact.mock.calls[0][1].operations).toMatchObject([{ type: 'updateNode', nodeId: 'paragraph:a' }])
    expect(sync.title).toBe('Renamed')
    expect(sync.current.status).toBe('saved')
  })

  it('queues a shared checkpoint with mapped operations as transactions without a fetch', async () => {
    const sync = await open({ shared: true })
    sync.record({ mode: 'checkpoint', operations: [op('a')], document: doc() })
    await sync.flushNow()
    expect(api.transact).toHaveBeenCalledTimes(1)
    expect(api.transact.mock.calls[0][1].operations).toEqual([op('a')])
    expect(api.saveCheckpoint).not.toHaveBeenCalled()
    expect(api.checkpoint).not.toHaveBeenCalled()
    expect(sync.current.status).toBe('saved')
  })

  it('keeps a pure shared rename local: no PUT, no transaction, title kept', async () => {
    const onAck = vi.fn()
    const sync = await open({ shared: true, onAck })
    sync.rename('Renamed')
    await sync.flushNow()
    expect(api.saveCheckpoint).not.toHaveBeenCalled()
    expect(api.transact).not.toHaveBeenCalled()
    expect(api.checkpoint).not.toHaveBeenCalled()
    expect(sync.title).toBe('Renamed')
    expect(onAck).toHaveBeenCalledWith(1)
    expect(sync.current).toMatchObject({ status: 'saved', pending: 0 })
  })

  it('saves Keep-my-version on a shared note as transactions on the latest base', async () => {
    const server = contentDoc([['paragraph:a', 'server']])
    const mine = contentDoc([['paragraph:a', 'mine']])
    const conflict = () => new ApiError(409, 'NOTE_TRANSACTION_CONFLICT', 'r', null)
    api.transact.mockRejectedValueOnce(conflict()).mockRejectedValueOnce(conflict()).mockRejectedValueOnce(conflict())
    api.checkpoint.mockResolvedValue({ revision: revision(9), document: server })
    const sync = await open({ shared: true }, { revisionNumber: 1, document: server, title: 'Note' })
    sync.record({ mode: 'incremental', operations: [op('a')], document: mine })
    await sync.flushNow()
    expect(sync.current.status).toBe('conflict')
    await sync.keepMine()
    expect(api.saveCheckpoint).not.toHaveBeenCalled()
    expect(api.checkpoint).toHaveBeenCalledTimes(3)
    expect(api.transact).toHaveBeenLastCalledWith('n1', expect.objectContaining({ baseRevisionNumber: 9 }))
    expect(api.transact.mock.calls.at(-1)?.[1].operations).toMatchObject([{ type: 'updateNode', nodeId: 'paragraph:a' }])
    expect(sync.current.status).toBe('saved')
  })

  it('stops read-only with edits kept when access is lost mid-session', async () => {
    const onAccessDenied = vi.fn()
    api.transact.mockRejectedValueOnce(new ApiError(403, 'NOTE_ACCESS_DENIED', 'req-denied', null))
    const sync = await open({ shared: true, onAccessDenied })
    sync.record({ mode: 'incremental', operations: [op('a')], document: doc() })
    await sync.flushNow()
    expect(sync.current.status).toBe('denied')
    expect(onAccessDenied).toHaveBeenCalledTimes(1)
    expect(onAccessDenied).toHaveBeenCalledWith(expect.objectContaining({ code: 'NOTE_ACCESS_DENIED', requestId: 'req-denied' }))
    expect((await store.get(syncKey('u1', 'n1')))?.batches).toHaveLength(1)
    await sync.flushNow()
    expect(api.transact).toHaveBeenCalledTimes(1)
  })

  it('markAccessDenied stops the queue read-only without dropping work', async () => {
    const onAccessDenied = vi.fn()
    const sync = await open({ shared: true, onAccessDenied })
    sync.record({ mode: 'incremental', operations: [op('a')], document: doc() })
    const error = new ApiError(403, 'NOTE_ACCESS_DENIED', 'req-x', null)
    sync.markAccessDenied(error)
    expect(sync.current.status).toBe('denied')
    expect(onAccessDenied).toHaveBeenCalledWith(error)
    expect(sync.hasPending).toBe(true)
    sync.record({ mode: 'incremental', operations: [op('b')], document: doc() })
    expect(sync.hasPending).toBe(true)
    await sync.flushNow()
    expect(api.transact).not.toHaveBeenCalled()
    await sync.dispose()
    expect((await store.get(syncKey('u1', 'n1')))?.open).toHaveLength(2)
  })

  it('heals a note shared mid-session: USE_TRANSACTIONS flips to the transaction queue', async () => {
    const server = contentDoc([['paragraph:a', 'server']])
    api.saveCheckpoint.mockRejectedValueOnce(new ApiError(409, 'USE_TRANSACTIONS', null, null))
    const sync = await open({}, { revisionNumber: 1, document: server, title: 'Note' })
    sync.record({ mode: 'checkpoint', operations: [], document: contentDoc([['paragraph:a', 'edited']]) })
    await sync.flushNow()
    expect(api.saveCheckpoint).toHaveBeenCalledTimes(1)
    expect(api.transact).toHaveBeenCalledTimes(1)
    expect(api.transact.mock.calls[0][1]).toMatchObject({ baseRevisionNumber: 1 })
    expect(sync.current.status).toBe('saved')
    // And the flip sticks: later full saves convert without another PUT.
    sync.record({ mode: 'checkpoint', operations: [], document: contentDoc([['paragraph:a', 'edited again']]) })
    await sync.flushNow()
    expect(api.saveCheckpoint).toHaveBeenCalledTimes(1)
    expect(api.transact).toHaveBeenCalledTimes(2)
  })

  it('stops with the size-limit message when the room is full, without retrying', async () => {
    api.transact.mockRejectedValueOnce(new ApiError(413, 'ROOM_DOCUMENT_TOO_LARGE', 'req-413', null))
    const sync = await open({ shared: true })
    sync.record({ mode: 'incremental', operations: [op('a')], document: doc() })
    await sync.flushNow()
    expect(sync.current.status).toBe('error')
    expect(sync.current.message).toMatch(/size limit/)
    expect(sync.hasPending).toBe(true)
    expect(scheduled.some((entry) => entry.ms === 5000)).toBe(false)
    await sync.flushNow()
    expect(api.transact).toHaveBeenCalledTimes(1)
  })

  it('wedges with a background retry when a shared transaction keeps being rejected', async () => {
    api.transact.mockRejectedValue(new ApiError(422, 'INVALID_NOTE_TRANSACTION', null, null))
    api.checkpoint.mockResolvedValue({ revision: revision(9), document: contentDoc([['paragraph:a', 'server']]) })
    const sync = await open({ shared: true })
    sync.record({ mode: 'incremental', operations: [op('a')], document: contentDoc([['paragraph:a', 'mine']]) })
    await sync.flushNow()
    expect(sync.current.status).toBe('error')
    expect(api.saveCheckpoint).not.toHaveBeenCalled()
    expect(sync.hasPending).toBe(true)
    expect(scheduled.some((entry) => entry.ms === 5000)).toBe(true)
  })

  it('drops a stale conversion when a newer full document arrives mid-fetch', async () => {
    const server = contentDoc([['paragraph:a', 'server']])
    const sync = await open({ shared: true }, { revisionNumber: 1, document: server, title: 'Note' })
    sync.record({ mode: 'incremental', operations: [op('a')], document: contentDoc([['paragraph:a', 'server']]) })
    await sync.flushNow()
    expect(api.transact).toHaveBeenCalledTimes(1)
    const older = contentDoc([['paragraph:a', 'older']])
    const newer = contentDoc([['paragraph:a', 'newer']])
    let resolveFetch!: (value: never) => void
    api.checkpoint.mockReturnValueOnce(new Promise<never>((resolve) => { resolveFetch = resolve }))
    sync.record({ mode: 'checkpoint', operations: [], document: older })
    const flushing = sync.flushNow()
    await vi.waitFor(() => expect(api.checkpoint).toHaveBeenCalled())
    sync.record({ mode: 'checkpoint', operations: [], document: newer })
    resolveFetch({ revision: revision(2), document: older } as never)
    await flushing
    expect(api.saveCheckpoint).not.toHaveBeenCalled()
    expect(api.transact).toHaveBeenCalledTimes(2)
    expect(api.transact.mock.calls[1][1]).toMatchObject({ baseRevisionNumber: 2 })
    expect(api.transact.mock.calls[1][1].operations).toMatchObject([{ type: 'updateNode', nodeId: 'paragraph:a' }])
    expect(JSON.stringify(api.transact.mock.calls[1][1].operations)).toContain('newer')
    expect(JSON.stringify(api.transact.mock.calls[1][1].operations)).not.toContain('older')
    expect(sync.current.status).toBe('saved')
  })

  it('folds later checkpoints into a pending shared save instead of queueing their operations', async () => {
    const server = contentDoc([['paragraph:a', 'server']])
    const sync = await open({ shared: true }, { revisionNumber: 1, document: server, title: 'Note' })
    sync.record({ mode: 'checkpoint', operations: [], document: contentDoc([['paragraph:a', 'first']]) })
    sync.record({ mode: 'checkpoint', operations: [op('a')], document: contentDoc([['paragraph:a', 'second']]) })
    await sync.flushNow()
    expect(api.saveCheckpoint).not.toHaveBeenCalled()
    expect(api.transact).toHaveBeenCalledTimes(1)
    expect(api.transact.mock.calls[0][1].operations).toHaveLength(1)
    expect(api.transact.mock.calls[0][1].operations).toMatchObject([{ type: 'updateNode', nodeId: 'paragraph:a' }])
  })

  it('stops with an error when the shared head cannot be read safely', async () => {
    const sync = await open({ shared: true })
    sync.record({ mode: 'incremental', operations: [op('a')], document: doc() })
    await sync.flushNow()
    api.checkpoint.mockResolvedValueOnce({ revision: revision(2), document: { bogus: true } })
    sync.record({ mode: 'checkpoint', operations: [], document: doc('Note', 'local') })
    await sync.flushNow()
    expect(sync.current.status).toBe('error')
    expect(sync.hasPending).toBe(true)
    expect(api.saveCheckpoint).not.toHaveBeenCalled()
    expect(api.transact).toHaveBeenCalledTimes(1)
  })
})
