import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { configureApiClient } from './client'
import { ApiError } from './errors'
import { simulationsApi, streamSimulationEvents, type SimulationJobEvent } from './simulations'

function json(status: number, body?: unknown, headers: Record<string, string> = {}) {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
}

let replies: Response[]
let fetchMock: ReturnType<typeof vi.fn>
let restore: () => void

beforeEach(() => {
  replies = []
  fetchMock = vi.fn(async () => replies.shift() ?? json(500, { code: 'HTTP_500' }))
  restore = configureApiClient({ fetch: fetchMock as unknown as typeof fetch, sleep: async () => {} })
})
afterEach(() => restore())

const initOf = (call: number) => fetchMock.mock.calls[call][1] as RequestInit & { headers: Headers }

describe('simulationsApi.create', () => {
  it('posts the concept with note and selection by reference, under one idempotency key', async () => {
    replies.push(json(202, { jobId: 'job_1', status: 'ACCEPTED', created: true }))
    const created = await simulationsApi.create(
      { concept: 'Projectile motion', noteId: 'note_1', selection: { revisionNumber: 7, ranges: [{ nodeId: 'node_1', from: 0, to: 12 }] } },
      'sim-key-1',
    )
    expect(fetchMock.mock.calls[0][0]).toBe('/v1/simulations')
    const init = initOf(0)
    expect(init.method).toBe('POST')
    expect(init.headers.get('Idempotency-Key')).toBe('sim-key-1')
    expect(JSON.parse(init.body as string)).toEqual({
      concept: 'Projectile motion',
      noteId: 'note_1',
      selection: { revisionNumber: 7, ranges: [{ nodeId: 'node_1', from: 0, to: 12 }] },
    })
    expect(created).toEqual({ jobId: 'job_1', status: 'ACCEPTED', created: true })
  })

  it('replays the stored job on a same-key retry', async () => {
    replies.push(json(202, { jobId: 'job_1', status: 'RUNNING', created: false }))
    const created = await simulationsApi.create({ concept: 'Projectile motion' }, 'sim-key-1')
    expect(created.created).toBe(false)
    expect(created.jobId).toBe('job_1')
  })

  it('surfaces creation failures by code without retrying them', async () => {
    replies.push(json(422, { code: 'SIMULATION_CONCEPT_TOO_LONG' }))
    const error = await simulationsApi.create({ concept: 'x'.repeat(2001) }, 'sim-key-2').catch((cause) => cause)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).code).toBe('SIMULATION_CONCEPT_TOO_LONG')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('simulationsApi job reads', () => {
  it('reads the job, its events page, and the approved fragments', async () => {
    replies.push(
      json(200, { jobId: 'job_1', status: 'COMPLETED', concept: 'c', attempts: 1, createdAt: '2026-01-01T00:00:00.000Z', figure: { figureId: 'job_1', sdkVersion: '0.2.0', fallback: false, nodeId: 'fig-job_1' } }),
      json(200, { events: [{ seq: 0, type: 'ACCEPTED', createdAt: '2026-01-01T00:00:00.000Z' }], nextAfter: 0, done: false, status: 'RUNNING' }),
      json(200, { version: 1, figureId: 'job_1', sdkVersion: '0.2.0', concept: 'c', plan: {}, fragments: { html: '<h>', css: 'c', js: 'j' }, fallback: false }),
    )
    const job = await simulationsApi.job('job_1')
    expect(job.figure?.nodeId).toBe('fig-job_1')
    const page = await simulationsApi.events('job_1', -1)
    expect(page.nextAfter).toBe(0)
    const fragments = await simulationsApi.fragments('job_1')
    expect(fragments.fragments.js).toBe('j')
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      '/v1/simulations/job_1',
      '/v1/simulations/job_1/events?after=-1',
      '/v1/figures/job_1/fragments',
    ])
  })

  it('surfaces a missing job by code', async () => {
    replies.push(json(404, { code: 'SIMULATION_JOB_NOT_FOUND' }))
    const error = await simulationsApi.job('job_gone').catch((cause) => cause)
    expect((error as ApiError).code).toBe('SIMULATION_JOB_NOT_FOUND')
  })
})

class FakeEventSource {
  static instances: FakeEventSource[] = []
  url: string
  closed = false
  private readonly listeners = new Map<string, ((message: { data: string }) => void)[]>()
  onmessage: ((message: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  constructor(url: string) {
    this.url = url
    FakeEventSource.instances.push(this)
  }
  addEventListener(type: string, listener: (message: { data: string }) => void) {
    const list = this.listeners.get(type) ?? []
    list.push(listener)
    this.listeners.set(type, list)
  }
  removeEventListener() {}
  emit(type: string, data: string) {
    for (const listener of this.listeners.get(type) ?? []) listener({ data })
  }
  close() {
    this.closed = true
  }
}

describe('streamSimulationEvents', () => {
  const RealEventSource = globalThis.EventSource

  beforeEach(() => {
    FakeEventSource.instances = []
  })
  afterEach(() => {
    if (RealEventSource === undefined) delete (globalThis as { EventSource?: unknown }).EventSource
    else globalThis.EventSource = RealEventSource
  })

  it('falls back to polling without an EventSource', async () => {
    delete (globalThis as { EventSource?: unknown }).EventSource
    const outcome = await streamSimulationEvents('job_1', -1, () => {}, new AbortController().signal)
    expect(outcome).toBe('fallback')
  })

  it('delivers typed events and resolves done on the done close', async () => {
    globalThis.EventSource = FakeEventSource as unknown as typeof EventSource
    const seen: SimulationJobEvent[] = []
    const outcome = streamSimulationEvents('job_1', -1, (event) => seen.push(event), new AbortController().signal)
    const source = FakeEventSource.instances[0]
    expect(source.url).toBe('/v1/simulations/job_1/stream?after=-1')
    source.emit('STEP_COMPLETED', JSON.stringify({ seq: 3, type: 'STEP_COMPLETED', data: { stage: 'planned' }, createdAt: '2026-01-01T00:00:00.000Z' }))
    source.emit('done', JSON.stringify({ status: 'COMPLETED' }))
    await expect(outcome).resolves.toBe('done')
    expect(source.closed).toBe(true)
    expect(seen).toEqual([{ seq: 3, type: 'STEP_COMPLETED', data: { stage: 'planned' }, createdAt: '2026-01-01T00:00:00.000Z' }])
  })

  it('hands over to polling on stream errors and aborts', async () => {
    globalThis.EventSource = FakeEventSource as unknown as typeof EventSource
    const controller = new AbortController()
    const outcome = streamSimulationEvents('job_1', 5, () => {}, controller.signal)
    const source = FakeEventSource.instances[0]
    expect(source.url).toBe('/v1/simulations/job_1/stream?after=5')
    controller.abort()
    await expect(outcome).resolves.toBe('fallback')
    expect(source.closed).toBe(true)
  })
})
