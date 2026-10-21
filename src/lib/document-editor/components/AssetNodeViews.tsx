import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react'
import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react'
import { useAssetHostOrLocal, type DocumentAssetHost } from '../assetHost'

type UrlState = { assetId: string | null; url: string | null; failed: boolean }

/**
 * A short-lived URL for one asset, fetched just before display. A media error (usually an
 * expired URL) asks for a fresh one once; repeated failures show a retry instead of looping.
 */
function useAssetUrl(host: DocumentAssetHost, assetId: string | null) {
  const [state, setState] = useState<UrlState>({ assetId: null, url: null, failed: false })
  const lastRefresh = useRef(0)
  const load = useCallback((refresh: boolean) => {
    if (!assetId) return
    host.resolveUrl(assetId, { refresh }).then(
      (url) => setState({ assetId, url, failed: false }),
      () => setState({ assetId, url: null, failed: true }),
    )
  }, [host, assetId])
  useEffect(() => { load(false) }, [load])
  const current = state.assetId === assetId ? state : { assetId, url: null, failed: false }
  const onMediaError = useCallback(() => {
    if (Date.now() - lastRefresh.current < 15_000) return setState({ assetId, url: null, failed: true })
    lastRefresh.current = Date.now()
    load(true)
  }, [assetId, load])
  return { url: current.url, failed: current.failed || !assetId, retry: () => { lastRefresh.current = Date.now(); load(true) }, onMediaError }
}

const attr = (value: unknown) => (typeof value === 'string' && value.trim() ? value : null)
const dimension = (value: unknown) => (typeof value === 'number' && value > 0 ? value : undefined)

function Unavailable({ label, onRetry }: { label: string; onRetry: () => void }) {
  return (
    <span className="incantly-asset__unavailable">
      <span>{label} couldn’t be loaded.</span>
      <button type="button" className="incantly-asset__button" onClick={onRetry}>Retry</button>
    </span>
  )
}

export function ImageAssetView({ node, selected }: ReactNodeViewProps) {
  const host = useAssetHostOrLocal()
  const { url, failed, retry, onMediaError } = useAssetUrl(host, attr(node.attrs.assetId))
  const width = dimension(node.attrs.width)
  const height = dimension(node.attrs.height)
  const alignment = attr(node.attrs.alignment)
  const caption = attr(node.attrs.caption)
  return (
    <NodeViewWrapper as="figure" data-incantly-node="image" data-asset-view="" data-selected={selected ? 'true' : undefined} data-align={alignment ?? undefined} contentEditable={false}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- private short-lived URL; next/image would proxy it
        <img src={url} alt={attr(node.attrs.alt) ?? ''} width={width} height={height} draggable={false} onError={onMediaError} className="incantly-asset__image" />
      ) : failed ? <Unavailable label="This image" onRetry={retry} /> : (
        <span className="incantly-asset__placeholder" style={width && height ? { aspectRatio: `${width} / ${height}` } : undefined} role="img" aria-label="Loading image" />
      )}
      {caption ? <figcaption>{caption}</figcaption> : null}
    </NodeViewWrapper>
  )
}

export function AudioAssetView({ node, selected }: ReactNodeViewProps) {
  const host = useAssetHostOrLocal()
  const { url, failed, retry, onMediaError } = useAssetUrl(host, attr(node.attrs.assetId))
  const resumeAt = useRef(0)
  const title = attr(node.attrs.title) ?? 'Audio'
  const onError = (event: SyntheticEvent<HTMLAudioElement>) => { resumeAt.current = event.currentTarget.currentTime; onMediaError() }
  const onLoaded = (event: SyntheticEvent<HTMLAudioElement>) => { if (resumeAt.current) { event.currentTarget.currentTime = resumeAt.current; resumeAt.current = 0 } }
  return (
    <NodeViewWrapper as="figure" data-incantly-node="audio" data-asset-view="" data-selected={selected ? 'true' : undefined} contentEditable={false}>
      <span className="incantly-asset__title">{title}</span>
      {url ? <audio controls preload="metadata" src={url} onError={onError} onLoadedMetadata={onLoaded} className="incantly-asset__audio" aria-label={title} />
        : failed ? <Unavailable label="This audio" onRetry={retry} /> : <span className="incantly-asset__muted">Loading…</span>}
      {attr(node.attrs.caption) ? <figcaption>{attr(node.attrs.caption)}</figcaption> : null}
    </NodeViewWrapper>
  )
}

/**
 * PDF and file cards. "Open" is a real link: its short-lived URL is fetched as the pointer or
 * focus arrives, so the click opens a tab without tripping pop-up blockers. The URL lives only
 * in this view's state.
 */
function FileCard({ node, selected, kind }: ReactNodeViewProps & { kind: 'pdfEmbed' | 'fileAttachment' }) {
  const host = useAssetHostOrLocal()
  const assetId = attr(node.attrs.assetId)
  const [href, setHref] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [opening, setOpening] = useState(false)
  const page = typeof node.attrs.page === 'number' && node.attrs.page > 0 ? node.attrs.page : null
  const name = attr(node.attrs.filename) ?? (assetId ? host.assetName?.(assetId) : null) ?? (kind === 'pdfEmbed' ? 'PDF document' : 'Attachment')
  const target = (url: string) => (page && kind === 'pdfEmbed' ? `${url}#page=${page}` : url)
  const prepare = useCallback(async () => {
    if (!assetId) return null
    try {
      const url = target(await host.resolveUrl(assetId))
      setHref(url)
      setError(null)
      return url
    } catch (cause) {
      setHref(null)
      setError(host.describeError?.(cause) ?? 'This file couldn’t be opened.')
      return null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- target depends only on page and kind
  }, [host, assetId, page, kind])
  const onClick = async (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (href) return
    // No URL yet (e.g. a keyboard shortcut straight to click): fetch it, then open.
    event.preventDefault()
    setOpening(true)
    const url = await prepare()
    setOpening(false)
    if (url && !window.open(url, '_blank', 'noopener,noreferrer')) setError('Your browser blocked the new tab. Select Open again.')
  }
  return (
    <NodeViewWrapper as={kind === 'pdfEmbed' ? 'figure' : 'aside'} data-incantly-node={kind} data-asset-view="" data-selected={selected ? 'true' : undefined} contentEditable={false} className="incantly-asset__card">
      <span className="incantly-asset__badge" aria-hidden="true">{kind === 'pdfEmbed' ? 'PDF' : 'FILE'}</span>
      <span className="incantly-asset__meta">
        <span className="incantly-asset__title">{name}</span>
        {page ? <span className="incantly-asset__muted">Page {page}</span> : null}
        {error ? <span className="incantly-asset__error" role="alert">{error}</span> : null}
      </span>
      {assetId ? (
        <a className="incantly-asset__button" href={href ?? undefined} target="_blank" rel="noopener noreferrer" aria-label={`Open ${name}`} aria-busy={opening || undefined}
          onPointerEnter={() => void prepare()} onFocus={() => void prepare()} onTouchStart={() => void prepare()} onClick={(event) => void onClick(event)}>
          {opening ? 'Opening…' : 'Open'}
        </a>
      ) : null}
    </NodeViewWrapper>
  )
}

export const PdfAssetView = (props: ReactNodeViewProps) => <FileCard {...props} kind="pdfEmbed" />
export const FileAssetView = (props: ReactNodeViewProps) => <FileCard {...props} kind="fileAttachment" />
