/** Docked right panel (chat, note context, history) width limits, in px. */
export const PANEL_MIN = 384
export const PANEL_MAX = 640
export const PANEL_DEFAULT = PANEL_MIN
/** The content box (where the note is written) never gets narrower than this because of the panel. */
export const CONTENT_MIN = 600
/**
 * Room around a page in the content box: the editor's 1rem either side of the sheet, the box's own
 * border, and its right padding.
 */
const PAGE_FRAME = 48
/** The gap between the content box and the panel column. */
const GUTTER = 8
/** The left sidebar's width: expanded (`w-[17.5rem]`) or folded to its icon rail (`w-16`). */
export const sidebarWidth = (expanded: boolean) => (expanded ? 280 : 64)
/** Where the chosen width is remembered on this device. */
export const PANEL_WIDTH_KEY = 'incantly:panel-width'
/** How far one arrow-key press moves the edge. */
export const PANEL_KEY_STEP = 16

/**
 * How narrow the content box may get for the open note: `CONTENT_MIN`, or for a note in Pages
 * mode, enough for its whole sheet (`pageWidth`, CSS px), so dragging the panel never squeezes the
 * page and makes its lines wrap differently from print.
 */
export function contentMinWidth(pageWidth: number | null): number {
  return pageWidth === null ? CONTENT_MIN : Math.max(CONTENT_MIN, Math.ceil(pageWidth + PAGE_FRAME))
}

/** Widest the panel may be with this window, left sidebar and note; never below `PANEL_MIN`. */
export function panelMaxWidth(viewport: number, sidebarWidth: number, contentMin = CONTENT_MIN): number {
  return Math.max(PANEL_MIN, Math.min(PANEL_MAX, viewport - sidebarWidth - contentMin - GUTTER))
}

/** A requested width, kept within the limits. */
export function clampPanelWidth(width: number, viewport: number, sidebarWidth: number, contentMin = CONTENT_MIN): number {
  return Math.round(Math.min(panelMaxWidth(viewport, sidebarWidth, contentMin), Math.max(PANEL_MIN, width)))
}

/**
 * The CSS width of the docked column: the chosen width (`--panel-width`), shrunk if the window gets
 * smaller so the content box keeps its minimum (`--content-min`, see `contentMinWidth`), and never
 * below `PANEL_MIN`. The browser applies it on resize, so nothing has to run in JavaScript.
 */
export function dockedPanelWidth(sidebarWidth: number): string {
  return `clamp(${PANEL_MIN}px, calc(100vw - ${sidebarWidth + GUTTER}px - var(--content-min, ${CONTENT_MIN}px)), var(--panel-width, ${PANEL_DEFAULT}px))`
}

/** A saved width from storage, or the default when it's missing or nonsense. */
export function parsePanelWidth(saved: string | null): number {
  const value = Number(saved)
  return Number.isFinite(value) && value >= PANEL_MIN && value <= PANEL_MAX ? Math.round(value) : PANEL_DEFAULT
}
