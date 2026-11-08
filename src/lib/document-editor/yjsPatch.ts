import type { DocumentOperation, IncantlyDocument } from '@incantly/canvas-core/document'
import { diffDocuments } from '../notes/documentDiff'

/**
 * Where a server-originated head revision came from. Decides patch vs reseed:
 * content, AI-accepted edits, figure attaches and imports patch; a restore
 * re-seeds (an explicit full replace, never a merge).
 */
export type ServerRevisionOrigin = 'content' | 'ai-edit' | 'figure' | 'import' | 'restore'

/**
 * A live Yjs binding (Phase 1) that can take server revisions without
 * remounting the editor. The binding registers itself on enter and drops
 * itself on leave; while none is registered every apply falls back to the
 * legacy reload, so this module is inert until Phase 1 lands.
 */
export type YjsPatchHost = {
  readonly noteId: string
  /** The canonical document the Yjs doc currently folds to (the diff base), or null when unknown. */
  currentDocument: () => IncantlyDocument | null
  /** Applies targeted canonical operations (insert/update/delete/moveNode) to the live Yjs doc. */
  applyOperations: (operations: readonly DocumentOperation[]) => void
  /** Replaces the Yjs doc content with a canonical document (restore, room rotation). */
  reseed: (document: IncantlyDocument) => void
}

const hosts = new Map<string, YjsPatchHost>()

/** The Phase 1 binding calls this on room enter, after seeding from the head checkpoint. */
export function registerYjsPatchHost(host: YjsPatchHost): void {
  hosts.set(host.noteId, host)
}

/**
 * Drops the binding for a note: room leave, rotation, teardown. The next
 * enter re-seeds from the head checkpoint, so Yjs state never merges across
 * rooms. Safe to call with no host registered.
 */
export function dropYjsPatchHost(noteId: string): void {
  hosts.delete(noteId)
}

export function yjsPatchHost(noteId: string): YjsPatchHost | null {
  return hosts.get(noteId) ?? null
}

/** True when the origin always re-seeds instead of patching (restore only; rotation drops the host). */
export function serverRevisionNeedsReseed(origin: ServerRevisionOrigin): boolean {
  return origin === 'restore'
}

export type ServerPatchPlan =
  | { kind: 'patch'; operations: DocumentOperation[] }
  | { kind: 'reseed' }
  | { kind: 'noop' }

/**
 * Pure plan for a server head revision against the live base: targeted
 * content operations from the existing document diff, a reseed for restores,
 * for an unknown base (nothing to diff against), and for page-setup changes
 * (outside the text fragment), or a noop when only metadata moved (a
 * title-only change carries no operations; the caller still adopts the head).
 */
/**
 * Above this many content operations a patch re-seeds instead: one giant
 * applyOperations call would jank the main thread, and the reseed applies the
 * same load-gated server document, so the outcome is identical, just cheaper.
 */
const MAX_SERVER_PATCH_OPS = 2000

export function planServerPatch(origin: ServerRevisionOrigin, before: IncantlyDocument | null, after: IncantlyDocument): ServerPatchPlan {
  if (serverRevisionNeedsReseed(origin) || !before) return { kind: 'reseed' }
  const diff = diffDocuments(before, after)
  if (diff.pageSetup) return { kind: 'reseed' }
  if (diff.content.length === 0) return { kind: 'noop' }
  if (diff.content.length > MAX_SERVER_PATCH_OPS) return { kind: 'reseed' }
  return { kind: 'patch', operations: diff.content }
}

export type ServerPatchOutcome = 'patched' | 'reseeded' | 'noop' | 'unsupported'

/**
 * Applies a server head revision to the live Yjs doc: targeted patch,
 * reseed, or noop per `planServerPatch`. Returns `unsupported` when no
 * binding is registered or the host throws, in which case the caller falls
 * back to the legacy reload. Never throws; `before` defaults to the host's
 * own fold. Both documents must already be load-gated.
 */
export function applyServerPatch(noteId: string, origin: ServerRevisionOrigin, after: IncantlyDocument, before?: IncantlyDocument | null): ServerPatchOutcome {
  const host = yjsPatchHost(noteId)
  if (!host) return 'unsupported'
  try {
    // The fold and the diff run inside the try: a throwing host or a malformed
    // base fails closed to the legacy reload, never out to the caller.
    const plan = planServerPatch(origin, before ?? host.currentDocument(), after)
    if (plan.kind === 'patch') host.applyOperations(plan.operations)
    else if (plan.kind === 'reseed') host.reseed(after)
    return plan.kind === 'patch' ? 'patched' : plan.kind === 'reseed' ? 'reseeded' : 'noop'
  } catch {
    return 'unsupported'
  }
}
