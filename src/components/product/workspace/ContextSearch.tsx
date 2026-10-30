'use client'

import { useState } from 'react'
import { AppIcon, type IconName } from '../AppIcon'
import { assetsApi } from '../../../lib/api/assets'
import { apiErrorMessage } from '../../../lib/api/errors'
import type { EvidenceDto, IndexStatusDto } from '../../../lib/api/context'
import { groupEvidence, indexBadge, locatorLabel, previewBanners, youtubeLink } from './contextModel'
import type { ContentSearch } from './useContextSearch'
import { sourceKindMeta, type SourceKind } from './model'
import { ErrorState, ListSkeleton } from './ui'

const badgeTone = { muted: 'bg-surface text-muted', ready: 'bg-feature-research text-accent', danger: 'bg-danger-surface text-danger' }
const badgeIcon: Record<'muted' | 'ready' | 'danger', IconName> = { muted: 'clock', ready: 'checkCircle', danger: 'alert' }

/** Searchable · Keyword-ready · Indexing · Index failed, with a one-line explanation. */
export function IndexStatusView({ status, subject, loading }: { status: IndexStatusDto | undefined; subject: 'note' | 'source'; loading?: boolean }) {
  const badge = indexBadge(status, subject)
  if (!badge) return loading ? <p className="text-xs text-muted" role="status">Checking search status…</p> : null
  return <div role="status" aria-live="polite" className="space-y-1.5">
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${badgeTone[badge.tone]}`}><AppIcon name={badgeIcon[badge.tone]} className="size-3.5" />{badge.label}</span>
    <p className="text-xs leading-5 text-muted">{badge.detail}</p>
  </div>
}

export type BlockRange = { blockId: string; endBlockId: string }
export type EvidenceTarget = { openNote: (noteId: string, range?: BlockRange) => void; openSource: (sourceId: string) => void }

/**
 * Opens a passage where it lives: a note at its block, a PDF at its page, audio at its time, or
 * the Source's details. The file URL is fetched just in time and never stored or logged.
 */
async function openEvidence(item: EvidenceDto, target: EvidenceTarget): Promise<string | null> {
  const { citation } = item
  if (!citation.sourceId) {
    if (citation.noteId) target.openNote(citation.noteId, citation.blockId ? { blockId: citation.blockId, endBlockId: citation.endBlockId || citation.blockId } : undefined)
    return null
  }
  const { locator } = citation
  const fragment = locator.type === 'PAGE' && locator.page ? `#page=${locator.page}` : locator.type === 'TIME' && locator.startMs != null ? `#t=${Math.floor(locator.startMs / 1000)}` : ''
  if (!citation.assetId || !fragment) { target.openSource(citation.sourceId); return null }
  // Open the tab inside the click so pop-up blockers allow it, then point it at the file.
  const tab = window.open('', '_blank')
  try {
    const { url } = await assetsApi.download(citation.assetId)
    if (tab) { tab.opener = null; tab.location.href = url + fragment; return null }
    return window.open(url + fragment, '_blank', 'noopener,noreferrer') ? null : 'Your browser blocked the new tab. Allow pop-ups to open the file.'
  } catch (cause) {
    tab?.close()
    return apiErrorMessage(cause)
  }
}

function Passage({ item, target, onError }: { item: EvidenceDto; target: EvidenceTarget; onError: (message: string) => void }) {
  const { citation } = item
  const where = locatorLabel(citation)
  const path = citation.headingPath.join(' › ')
  const youtube = citation.locator.type === 'TIME' && citation.locator.youtubeVideoId && citation.locator.startMs != null ? youtubeLink(citation.locator.youtubeVideoId, citation.locator.startMs) : null
  const body = <>
    {where || path ? <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted">{where ? <span className="shrink-0 font-semibold text-foreground">{where}</span> : null}{path && path !== where ? <span className="truncate">{path}</span> : null}</span> : null}
    {/* Passage text is untrusted: rendered as text only. */}
    <span className="mt-1 line-clamp-4 whitespace-pre-line break-words text-sm leading-6 text-foreground">{item.text}</span>
  </>
  const className = 'block w-full min-w-0 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-surface'
  return <li>{youtube
    ? <a href={youtube} target="_blank" rel="noopener noreferrer" className={className}>{body}<span className="sr-only"> (opens YouTube)</span></a>
    : <button type="button" className={className} onClick={() => { void openEvidence(item, target).then((message) => { if (message) onError(message) }) }}>{body}</button>}</li>
}

/** Search results grouped by note or Source, with honest banners about what was (not) found. */
export function EvidenceResults({ search, target, emptyHint }: { search: ContentSearch; target: EvidenceTarget; emptyHint?: string }) {
  const [openError, setOpenError] = useState('')
  const { result, error, pending, wait } = search
  const groups = result ? groupEvidence(result.evidence) : []
  const passages = result?.evidence.length ?? 0
  const summary = pending ? 'Searching…' : result ? (passages ? `${passages} ${passages === 1 ? 'passage' : 'passages'} from ${groups.length} ${groups.length === 1 ? 'place' : 'places'}` : 'No passages found') : ''
  return <div className="space-y-4">
    <p role="status" aria-live="polite" className="sr-only">{summary}</p>
    {wait > 0 ? <p role="status" className="rounded-xl bg-surface p-3 text-sm text-muted">You’ve searched a lot in a short time. You can search again in {wait} s.</p> : null}
    {error && !wait ? <ErrorState message={apiErrorMessage(error)} /> : null}
    {openError ? <p role="alert" className="text-sm text-danger">{openError}</p> : null}
    {pending && !result ? <ListSkeleton rows={3} label="Searching" /> : null}
    {result ? <>
      {previewBanners(result).map((banner) => <p key={banner.text} className={`flex items-start gap-2 rounded-xl p-3 text-sm leading-6 ${banner.tone === 'danger' ? 'bg-danger-surface text-danger' : 'bg-surface text-muted'}`}><AppIcon name="alert" className="mt-1 size-4 shrink-0" />{banner.text}</p>)}
      {groups.length ? <div className={`space-y-5 ${pending ? 'opacity-60' : ''}`}>{groups.map((group) => {
        const meta = group.kind === 'note' ? { icon: 'document' as IconName, label: 'Note' } : sourceKindMeta((group.sourceKind ?? 'FILE') as SourceKind)
        return <section key={group.key} aria-label={group.title}>
          <h3 className="flex min-w-0 items-center gap-2 px-2 text-sm font-semibold text-foreground"><AppIcon name={meta.icon} className="size-4 shrink-0 text-muted" /><span className="truncate">{group.title}</span><span className="shrink-0 text-xs font-normal text-subtle">{meta.label}</span></h3>
          <ul className="mt-1 divide-y divide-default">{group.items.map((item) => <Passage key={item.evidenceId} item={item} target={target} onError={setOpenError} />)}</ul>
        </section>
      })}</div> : result.sufficiency !== 'NOT_FOUND' ? <p className="py-6 text-center text-sm text-muted">{emptyHint ?? 'No passages found.'}</p> : null}
    </> : null}
  </div>
}
