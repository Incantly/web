import type { ContextPreviewResult, EvidenceDto, IndexStatusDto } from '../../../lib/api/context'

export type IndexBadge = { label: string; tone: 'muted' | 'ready' | 'danger'; detail: string }

/** Searchable badge: Failed, Indexing, Ready (semantic), Keyword-ready, or not yet. */
export function indexBadge(status: IndexStatusDto | undefined, subject: 'note' | 'source'): IndexBadge | null {
  if (!status) return null
  const passages = `${status.passageCount} ${status.passageCount === 1 ? 'passage' : 'passages'}`
  if (status.failureCode && !status.building) return { label: 'Index failed', tone: 'danger', detail: subject === 'note' ? 'Search couldn’t index this note. Try “Index now”.' : 'Search couldn’t index this source. Retry processing to try again.' }
  if (status.building) return { label: 'Indexing', tone: 'muted', detail: status.lexicalReady ? `Updating the index. Earlier content stays searchable (${passages}).` : 'Building the search index…' }
  if (status.vectorReady) return { label: 'Searchable', tone: 'ready', detail: `Search by keyword and meaning · ${passages}` }
  if (status.lexicalReady) return { label: 'Keyword-ready', tone: 'ready', detail: `Search by keyword now; search by meaning follows shortly · ${passages}` }
  return { label: 'Not searchable yet', tone: 'muted', detail: subject === 'note' ? 'New edits are indexed about a minute after you stop typing.' : 'It becomes searchable once processing finishes.' }
}

/** Poll index status only while a build is running (or nothing is indexed yet). */
export function indexStillBuilding(status: IndexStatusDto | undefined) {
  return Boolean(status && (status.building || (!status.lexicalReady && !status.failureCode)))
}

export type Banner = { tone: 'muted' | 'danger'; text: string }

/** Honest notes about a result: not enough material, ambiguity, staleness, keyword-only, sensitivity. */
export function previewBanners(result: ContextPreviewResult): Banner[] {
  const banners: Banner[] = []
  const sufficiency: Partial<Record<ContextPreviewResult['sufficiency'], Banner>> = {
    NOT_FOUND: { tone: 'muted', text: 'Nothing in this scope matches. Try other words, or search a wider scope.' },
    PARTIAL: { tone: 'muted', text: 'Only part of the answer is here. These passages may not cover the whole question.' },
    AMBIGUOUS: { tone: 'muted', text: 'The question could mean several things. Add detail to narrow it down.' },
    STALE: { tone: 'muted', text: 'Some of this changed after it was indexed. Results may be out of date.' },
    FORBIDDEN: { tone: 'danger', text: 'Some material in this scope isn’t available to you.' },
  }
  const main = sufficiency[result.sufficiency]
  if (main) banners.push(main)
  if (result.stale && result.sufficiency !== 'STALE') banners.push({ tone: 'muted', text: 'Some content changed after it was indexed. Recent edits may not show yet.' })
  if (result.degraded) banners.push({ tone: 'muted', text: 'Matched by keyword only for some content; search by meaning isn’t ready for it yet.' })
  if (result.sensitivity === 'SENSITIVE') banners.push({ tone: 'muted', text: 'Includes material marked Sensitive.' })
  if (result.sensitivity === 'RESTRICTED') banners.push({ tone: 'muted', text: 'Includes Restricted material. It’s never sent to an external AI.' })
  return banners
}

export function formatTimestamp(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = String(total % 60).padStart(2, '0')
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`
}

/** "Page 4", "2:13", or the heading the passage sits under. */
export function locatorLabel(citation: EvidenceDto['citation']) {
  const { locator } = citation
  if (locator.type === 'PAGE' && locator.page) return `Page ${locator.page}`
  if (locator.type === 'TIME' && locator.startMs != null) return formatTimestamp(locator.startMs)
  return citation.headingPath.at(-1) ?? null
}

/** Only a bare video ID becomes a link, so passage data can never inject another URL. */
export function youtubeLink(videoId: string, startMs: number) {
  if (!/^[A-Za-z0-9_-]{6,20}$/.test(videoId)) return null
  return `https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(startMs / 1000)}s`
}

export type EvidenceGroup = { key: string; kind: 'note' | 'source'; id: string; title: string; sourceKind: string | null; items: EvidenceDto[] }

/** Groups passages by the note or Source they came from, keeping the ranking order. */
export function groupEvidence(evidence: EvidenceDto[]): EvidenceGroup[] {
  const groups = new Map<string, EvidenceGroup>()
  for (const item of evidence) {
    const { citation } = item
    const kind = citation.sourceId ? 'source' : 'note'
    const id = citation.sourceId ?? citation.noteId
    if (!id) continue
    const key = `${kind}:${id}`
    const group = groups.get(key) ?? { key, kind, id, title: '', sourceKind: citation.sourceKind ?? null, items: [] }
    // A selection passage can arrive without a title; take the first real one in the group.
    if (!group.title && citation.title) group.title = citation.title
    group.items.push(item)
    groups.set(key, group)
  }
  return [...groups.values()].map((group) => (group.title ? group : { ...group, title: group.kind === 'note' ? 'Untitled note' : 'Untitled source' }))
}

/** Seconds until a rate-limited action may run again (Retry-After), or null. */
export function retryAfterSeconds(error: unknown) {
  if (error && typeof error === 'object' && 'status' in error && (error as { status: number }).status === 429) {
    const seconds = (error as { retryAfterSeconds?: number | null }).retryAfterSeconds
    return Math.max(1, Math.ceil(seconds ?? 5))
  }
  return null
}
