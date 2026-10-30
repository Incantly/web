import type { ContextBindingDto, UpsertContextBinding } from '../../../lib/api/bindings'
import { isUsableSource, type SourceRecord } from './model'

export type BindingType = ContextBindingDto['type']
export type RevisionPolicy = ContextBindingDto['revisionPolicy']
/** What a person can pick; `GENERATED_FROM` is provenance the system records. */
export type BindingUsage = Exclude<BindingType, 'GENERATED_FROM'>

export const bindingUsages: { value: BindingUsage; label: string; help: string }[] = [
  { value: 'PINNED', label: 'Always include', help: 'Questions about this note look here first.' },
  { value: 'AVAILABLE', label: 'Use when relevant', help: 'Used when it matches the question. The default.' },
  { value: 'RELATED', label: 'Reference only', help: 'Listed with this note for reference, not searched.' },
]

export const revisionPolicies: { value: RevisionPolicy; label: string; help: string }[] = [
  { value: 'TRACK_LATEST', label: 'Latest version', help: 'Follows the source when a newer version is ready. The default.' },
  { value: 'PINNED_VERSION', label: 'Keep this version', help: 'Stays on the version it has now, even if the source is updated.' },
]

/** A new binding: used when relevant, following the latest version. */
export const defaultBinding: UpsertContextBinding = { type: 'AVAILABLE', revisionPolicy: 'TRACK_LATEST', priority: 0 }

type Current = Pick<ContextBindingDto, 'type' | 'revisionPolicy' | 'pinnedSourceVersionId' | 'priority'> & { source: Pick<ContextBindingDto['source'], 'currentReadyVersionId'> }
export type BindingChange = { type?: BindingUsage; revisionPolicy?: RevisionPolicy; /** Move a kept version to the source's newest ready one. */ useNewest?: boolean }

/**
 * The PUT body for a change. A PUT replaces the whole binding, so it carries over what isn't changing.
 * Keeping a version pins the source's current ready version; tracking the latest never sends one.
 */
export function bindingBody(current: Current, change: BindingChange): UpsertContextBinding | { error: string } {
  const type = change.type ?? current.type
  const revisionPolicy = change.revisionPolicy ?? current.revisionPolicy
  const body: UpsertContextBinding = { type, revisionPolicy, priority: current.priority }
  if (revisionPolicy === 'TRACK_LATEST') return body
  const keep = current.revisionPolicy === 'PINNED_VERSION' && !change.useNewest ? current.pinnedSourceVersionId : current.source.currentReadyVersionId
  if (!keep) return { error: 'This source has no ready version to keep yet.' }
  return { ...body, pinnedSourceVersionId: keep }
}

export type BindingNotice = { tone: 'warning' | 'info'; text: string; canUseNewest?: boolean }

/** Why a bound source isn't being used right now, or that a kept version has a newer one. */
export function bindingNotice(binding: Pick<ContextBindingDto, 'revisionPolicy' | 'pinnedSourceVersionId' | 'source'>): BindingNotice | null {
  const { status, currentReadyVersionId } = binding.source
  if (status === 'ARCHIVED') return { tone: 'warning', text: 'Archived, so it isn’t used. Restore it in the Library to use it again.' }
  if (status === 'DELETED') return { tone: 'warning', text: 'This source was deleted. Remove it from this note.' }
  if (status === 'FAILED' || status === 'QUARANTINED') return { tone: 'warning', text: 'This source couldn’t be processed, so it isn’t used.' }
  if (status === 'PENDING' || status === 'PROCESSING') return { tone: 'info', text: 'Still processing. It’s used once it’s ready.' }
  if (binding.revisionPolicy === 'PINNED_VERSION' && currentReadyVersionId && currentReadyVersionId !== binding.pinnedSourceVersionId) {
    return { tone: 'info', text: 'A newer version of this source is ready.', canUseNewest: true }
  }
  return null
}

/** Sources that can be added: ready, not already bound, with the note's Space sources first. */
export function pickableSources(sources: SourceRecord[], boundIds: Iterable<string>, spaceSourceIds: Iterable<string> = []): (SourceRecord & { inSpace: boolean })[] {
  const bound = new Set(boundIds)
  const inSpace = new Set(spaceSourceIds)
  return sources
    .filter((source) => isUsableSource(source) && !bound.has(source.id))
    .map((source) => ({ ...source, inSpace: inSpace.has(source.id) }))
    .sort((a, b) => Number(b.inSpace) - Number(a.inSpace))
}
