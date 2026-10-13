import type { CSSProperties, HTMLAttributes, ReactNode } from 'react'
import { PAGE_PRESETS, normalizePageSetup, type PageSetup } from '@incantly/core/document'

/** CSS pixels per typographic point at the UI boundary (model stores points). */
export const POINTS_TO_CSS_PX = 96 / 72

export interface ResolvedPageDimensions {
  widthPx: number
  heightPx: number
}

/** Resolve the physical page size to CSS pixels, honoring orientation. */
export function resolvePageDimensionsInPx(setup: PageSetup): ResolvedPageDimensions {
  const normalized = normalizePageSetup(setup)
  const preset = normalized.size === 'custom'
    ? { width: normalized.width ?? 612, height: normalized.height ?? 792 }
    : PAGE_PRESETS[normalized.size]
  const portrait = normalized.orientation === 'portrait'
  const widthPt = portrait ? preset.width : preset.height
  const heightPt = portrait ? preset.height : preset.width
  return { widthPx: widthPt * POINTS_TO_CSS_PX, heightPx: heightPt * POINTS_TO_CSS_PX }
}

/**
 * Convert a canonical PageSetup into the `--incantly-page-*` custom properties
 * consumed by `.incantly-document-page` in document.css. Hosts may override any
 * of these properties (or the class names below) with their own stylesheet; the
 * values here are only the defaults derived from the document.
 */
export function pageSetupToCssVars(setup: PageSetup): CSSProperties {
  const normalized = normalizePageSetup(setup)
  const { widthPx, heightPx } = resolvePageDimensionsInPx(normalized)
  const px = (points: number): string => `${points * POINTS_TO_CSS_PX}px`
  return {
    '--incantly-page-width': `${widthPx}px`,
    '--incantly-page-height': `${heightPx}px`,
    '--incantly-page-margin-top': px(normalized.margins.top),
    '--incantly-page-margin-right': px(normalized.margins.right),
    '--incantly-page-margin-bottom': px(normalized.margins.bottom),
    '--incantly-page-margin-left': px(normalized.margins.left),
    '--incantly-page-header-distance': px(normalized.headerDistance ?? 36),
    '--incantly-page-footer-distance': px(normalized.footerDistance ?? 36),
  } as CSSProperties
}

export interface DocumentPageViewProps extends HTMLAttributes<HTMLElement> {
  pageSetup: PageSetup
  /** Shown in the default header chrome; ignored when `header` is provided. */
  title?: string
  /** Override the header chrome. Pass `null` to suppress it. */
  header?: ReactNode
  /** Override the footer chrome. Pass `null` to suppress it. */
  footer?: ReactNode
  /** Defaults to true when `pageSetup.mode` is paginated. */
  showHeaderFooter?: boolean
  children?: ReactNode
}

/**
 * Composable paginated/continuous page container. It carries no product layout:
 * every visual is driven by documented `--incantly-page-*` properties,
 * `data-page-*` attributes, and `incantly-document-page*` classes that a host
 * stylesheet (or `className`/`style`/render props) may freely replace.
 */
export function DocumentPageView({
  pageSetup,
  title,
  header,
  footer,
  showHeaderFooter,
  className,
  style,
  children,
  ...props
}: DocumentPageViewProps) {
  const normalized = normalizePageSetup(pageSetup)
  const chrome = showHeaderFooter ?? normalized.mode === 'paginated'
  const defaultHeader = <div className="incantly-document-page__header">Header · {title || 'Untitled'}</div>
  const defaultFooter = (
    <div className="incantly-document-page__footer">Page {normalized.startingPageNumber ?? 1}</div>
  )
  return (
    <section
      {...props}
      className={['incantly-document-page', `incantly-document-page--${normalized.mode}`, className].filter(Boolean).join(' ')}
      style={{ ...pageSetupToCssVars(normalized), ...style }}
      data-page-mode={normalized.mode}
      data-page-size={normalized.size}
      data-page-orientation={normalized.orientation}
      data-starting-page={normalized.startingPageNumber ?? 1}
    >
      {chrome && (header !== undefined ? header : defaultHeader)}
      {children}
      {chrome && (footer !== undefined ? footer : defaultFooter)}
    </section>
  )
}
