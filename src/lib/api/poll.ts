import { abortableSleep } from './client'

export type PollOptions = {
  signal?: AbortSignal
  /** First delay (default 1000 ms); grows by 1.5× up to `maxMs`. */
  startMs?: number
  maxMs?: number
  /** Test seams. */
  isHidden?: () => boolean
  waitUntilVisible?: (signal?: AbortSignal) => Promise<void>
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
}

function documentHidden() {
  return typeof document !== 'undefined' && document.hidden
}

function visibilityChange(signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason)
    const onChange = () => { if (!document.hidden) { cleanup(); resolve() } }
    const onAbort = () => { cleanup(); reject(signal?.reason) }
    const cleanup = () => { document.removeEventListener('visibilitychange', onChange); signal?.removeEventListener('abort', onAbort) }
    document.addEventListener('visibilitychange', onChange)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * Polls `read` until `isDone`, backing off 1 s → 5 s. Pauses while the tab is hidden and
 * stops (rejecting with the abort reason) when `signal` aborts, e.g. on unmount.
 */
export async function poll<T>(read: () => Promise<T>, isDone: (value: T) => boolean, options: PollOptions = {}): Promise<T> {
  const { signal, startMs = 1000, maxMs = 5000, isHidden = documentHidden, waitUntilVisible = visibilityChange, sleep = abortableSleep } = options
  let delay = startMs
  for (;;) {
    if (signal?.aborted) throw signal.reason
    if (isHidden()) await waitUntilVisible(signal)
    const value = await read()
    if (isDone(value)) return value
    await sleep(delay, signal)
    delay = Math.min(delay * 1.5, maxMs)
  }
}
