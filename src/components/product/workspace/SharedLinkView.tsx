'use client'

import dynamic from 'next/dynamic'
import { useNavigation } from '@/hooks/use-navigation'
import { useSharedLink } from '@/hooks/use-shared-link'
import { AppIcon } from '../AppIcon'
import { ConnectionBanner, TopBarLeading, TopBarTrailing } from './WorkspaceChrome'
import { EmptyState, ErrorState, PageFrame, TopBar, buttonPrimary, buttonSecondary } from './ui'

const DocumentEditor = dynamic(
  () => import('../../../lib/document-editor').then((module) => module.DocumentEditor),
  { ssr: false, loading: () => <div className="mx-auto mt-20 h-28 w-full max-w-[46rem] animate-pulse rounded-2xl bg-surface" role="status" aria-label="Loading shared note" /> },
)

/**
 * A share-link note inside the normal workspace: sidebar, top bar, and panels
 * around a read-only editor. No saves, sync, comments, or owner actions: link
 * viewers hold no grant, so every session-backed call would be denied.
 */
export function SharedLinkRoute({ token }: { token: string }) {
  const { navigate } = useNavigation()
  const link = useSharedLink(token)
  const title = link.phase === 'ready' ? link.title : 'Shared note'
  const onBack = () => navigate('notes')

  return <>
    <TopBar banner={<ConnectionBanner />}>
      <TopBarLeading />
      <span className="min-w-0 flex-1 truncate px-1.5 font-display text-base text-foreground">{title}</span>
      <div className="ml-auto flex shrink-0 items-center gap-0.5">
        <span role="status" aria-label="View only" className="flex min-h-11 shrink-0 items-center gap-1.5 px-2 text-xs text-muted">
          <AppIcon name="link" className="size-4 shrink-0" /><span className="hidden sm:inline">View only</span>
        </span>
        <TopBarTrailing />
      </div>
    </TopBar>

    {link.phase === 'loading' ? <div className="mx-auto mt-16 h-28 w-full max-w-[46rem] animate-pulse rounded-2xl bg-surface motion-reduce:animate-none" role="status" aria-label="Loading shared note" /> : null}
    {link.phase === 'invalid' ? <PageFrame><EmptyState icon="unlink" title="This link didn’t open"
      body="This share link is invalid or has expired. Ask the owner for a new one."
      action={<><button type="button" onClick={link.retry} className={buttonPrimary}>Try again</button><button type="button" onClick={onBack} className={buttonSecondary}>All notes</button></>} /></PageFrame> : null}
    {link.phase === 'error' ? <PageFrame><ErrorState message={link.message} onRetry={link.retry} /></PageFrame> : null}
    {link.phase === 'unreadable' ? <PageFrame><EmptyState icon="document" title="This copy can’t be opened safely"
      body="The shared content didn’t pass validation, so it isn’t shown. Ask the owner for a new link."
      action={<button type="button" onClick={onBack} className={buttonSecondary}>All notes</button>} /></PageFrame> : null}

    {link.phase === 'ready' ? <>
      {link.gate.repaired ? <p role="status" className="mx-auto mt-2 w-fit rounded-full bg-surface px-3 py-1 text-xs text-muted">Some content in this note was repaired when it opened.</p> : null}
      <div>
        <DocumentEditor key={token} initialDocument={link.gate.document} readonly ui="none" aria-label={`Shared note: ${title}`} />
      </div>
    </> : null}
  </>
}
