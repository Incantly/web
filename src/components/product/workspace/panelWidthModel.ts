/** Docked right panel (chat, note context, history) width limits, in px. */
export const PANEL_MIN = 384
export const PANEL_MAX = 640
export const PANEL_DEFAULT = PANEL_MIN
/** The content box (where the note is written) never gets narrower than this because of the panel. */
export const CONTENT_MIN = 600
/** The gap between the content box and the panel column. */
const GUTTER = 8
/** The left sidebar's width: expanded (`w-[17.5rem]`) or folded to its icon rail (`w-16`). */
export const sidebarWidth = (expanded: boolean) => (expanded ? 280 : 64)
/** Where the chosen width is remembered on this device. */
export const PANEL_WIDTH_KEY = 'incantly:panel-width'
/** How far one arrow-key press moves the edge. */
export const PANEL_KEY_STEP = 16

/** Widest the panel may be with this window and left sidebar; never below `PANEL_MIN`. */
export function panelMaxWidth(viewport: number, sidebarWidth: number): number {
  return Math.max(PANEL_MIN, Math.min(PANEL_MAX, viewport - sidebarWidth - CONTENT_MIN - GUTTER))
}

/** A requested width, kept within the limits. */
export function clampPanelWidth(width: number, viewport: number, sidebarWidth: number): number {
  return Math.round(Math.min(panelMaxWidth(viewport, sidebarWidth), Math.max(PANEL_MIN, width)))
}

/**
 * The CSS width of the docked column: the chosen width (`--panel-width`), shrunk if the window gets
 * smaller so the content box keeps `CONTENT_MIN`, and never below `PANEL_MIN`. The browser applies
 * it on resize, so nothing has to run in JavaScript.
 */
export function dockedPanelWidth(sidebarWidth: number): string {
  return `clamp(${PANEL_MIN}px, calc(100vw - ${sidebarWidth + CONTENT_MIN + GUTTER}px), var(--panel-width, ${PANEL_DEFAULT}px))`
}

/** A saved width from storage, or the default when it's missing or nonsense. */
export function parsePanelWidth(saved: string | null): number {
  const value = Number(saved)
  return Number.isFinite(value) && value >= PANEL_MIN && value <= PANEL_MAX ? Math.round(value) : PANEL_DEFAULT
}
