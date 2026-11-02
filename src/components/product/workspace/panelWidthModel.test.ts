import { describe, expect, it } from 'vitest'
import { CONTENT_MIN, PANEL_DEFAULT, PANEL_MAX, PANEL_MIN, clampPanelWidth, contentMinWidth, dockedPanelWidth, panelMaxWidth, parsePanelWidth } from './panelWidthModel'

describe('panelMaxWidth', () => {
  it('allows the full maximum on a wide screen', () => {
    expect(panelMaxWidth(1440, 64)).toBe(PANEL_MAX)
  })

  it('keeps the content box at least 600px', () => {
    // 1280 − 280 sidebar − 600 content − 8 gap
    expect(panelMaxWidth(1280, 280)).toBe(392)
  })

  it('never goes below the minimum on a small screen', () => {
    expect(panelMaxWidth(1024, 64)).toBe(PANEL_MIN)
  })
})

describe('contentMinWidth', () => {
  it('keeps the usual minimum for a continuous note', () => {
    expect(contentMinWidth(null)).toBe(CONTENT_MIN)
  })

  it('leaves room for the whole sheet in Pages mode', () => {
    // A4 portrait is 793.7px wide
    expect(contentMinWidth(793.7)).toBe(842)
    // so on a 1440px window with the sidebar open the panel stops at 1440 − 280 − 842 − 8
    expect(panelMaxWidth(1440, 280, contentMinWidth(793.7))).toBe(PANEL_MIN)
    expect(panelMaxWidth(1680, 280, contentMinWidth(793.7))).toBe(550)
    expect(clampPanelWidth(640, 1680, 280, contentMinWidth(793.7))).toBe(550)
  })
})

describe('clampPanelWidth', () => {
  it('keeps a drag inside the limits', () => {
    expect(clampPanelWidth(200, 1440, 64)).toBe(PANEL_MIN)
    expect(clampPanelWidth(900, 1440, 64)).toBe(PANEL_MAX)
    expect(clampPanelWidth(500.4, 1440, 64)).toBe(500)
  })
})

describe('dockedPanelWidth', () => {
  it('builds a CSS clamp from the chosen width and the room left', () => {
    expect(dockedPanelWidth(64)).toBe('clamp(384px, calc(100vw - 72px - var(--content-min, 600px)), var(--panel-width, 384px))')
  })
})

describe('parsePanelWidth', () => {
  it('reads a saved width and rejects anything out of range', () => {
    expect(parsePanelWidth('512')).toBe(512)
    expect(parsePanelWidth(null)).toBe(PANEL_DEFAULT)
    expect(parsePanelWidth('9000')).toBe(PANEL_DEFAULT)
    expect(parsePanelWidth('wide')).toBe(PANEL_DEFAULT)
  })
})
