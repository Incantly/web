/** How long an export waits for the live note's checkpoint before going ahead without it. */
export const EXPORT_VERSION_WAIT_MS = 3000

/**
 * Asks the note to record a version (a live note checkpoints its room) before an export, so
 * version history holds what was exported. Best effort: resolves once the flush settles or after
 * `timeoutMs`, never rejects, and says nothing to the user when the version is skipped.
 */
export async function recordExportVersion(flush: (() => Promise<unknown>) | undefined, timeoutMs = EXPORT_VERSION_WAIT_MS): Promise<void> {
  if (!flush) return
  let timer: ReturnType<typeof setTimeout> | undefined
  const attempt = (async () => { await flush() })().catch(() => undefined)
  const timeout = new Promise<void>((resolve) => { timer = setTimeout(resolve, timeoutMs) })
  try {
    await Promise.race([attempt, timeout])
  } finally {
    clearTimeout(timer)
  }
}

/** Records the export's version (bounded, see `recordExportVersion`), then runs the export. */
export async function exportAfterVersion<T>(flush: (() => Promise<unknown>) | undefined, run: () => Promise<T> | T, timeoutMs = EXPORT_VERSION_WAIT_MS): Promise<T> {
  await recordExportVersion(flush, timeoutMs)
  return run()
}
