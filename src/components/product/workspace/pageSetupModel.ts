import { DEFAULT_PAGE_SETUP, PAGE_PRESETS, normalizePageSetup, type DocumentMetadata, type PageSetup } from '@incantly/canvas-core/document'

/** Units the panel shows lengths in. The model always stores points (1/72 inch). */
export type LengthUnit = 'cm' | 'in' | 'mm' | 'pt'

const POINTS_PER_UNIT: Record<LengthUnit, number> = { pt: 1, in: 72, cm: 72 / 2.54, mm: 72 / 25.4 }
const DECIMALS: Record<LengthUnit, number> = { pt: 0, in: 2, cm: 2, mm: 1 }

export const lengthUnits: { value: LengthUnit; label: string }[] = [
  { value: 'cm', label: 'Centimetres' },
  { value: 'in', label: 'Inches' },
  { value: 'mm', label: 'Millimetres' },
  { value: 'pt', label: 'Points' },
]

/** A length in points, shown in `unit` and rounded for display. */
export function formatLength(points: number, unit: LengthUnit): string {
  const value = points / POINTS_PER_UNIT[unit]
  return String(Number(value.toFixed(DECIMALS[unit])))
}

/** User input in `unit` back to points; null for anything that isn't a finite, non-negative number. */
export function parseLength(text: string, unit: LengthUnit): number | null {
  const value = Number(text.trim().replace(',', '.'))
  if (!text.trim() || !Number.isFinite(value) || value < 0) return null
  return Number((value * POINTS_PER_UNIT[unit]).toFixed(2))
}

/** Inches in the US and a few others, centimetres elsewhere. */
export function defaultUnit(locale: string | undefined): LengthUnit {
  const region = locale?.split('-')[1]?.toUpperCase()
  return region === 'US' || region === 'LR' || region === 'MM' ? 'in' : 'cm'
}

export const paperSizes: { value: PageSetup['size']; label: string }[] = [
  { value: 'a4', label: 'A4' },
  { value: 'letter', label: 'US Letter' },
  { value: 'legal', label: 'US Legal' },
  { value: 'custom', label: 'Custom' },
]

/** Word's margin presets, in points. */
export const marginPresets = {
  normal: { label: 'Normal', margins: { top: 72, right: 72, bottom: 72, left: 72 } },
  narrow: { label: 'Narrow', margins: { top: 36, right: 36, bottom: 36, left: 36 } },
  moderate: { label: 'Moderate', margins: { top: 72, right: 54, bottom: 72, left: 54 } },
  wide: { label: 'Wide', margins: { top: 72, right: 144, bottom: 72, left: 144 } },
} as const

export type MarginPreset = keyof typeof marginPresets | 'custom'

export function marginPresetOf(margins: PageSetup['margins']): MarginPreset {
  const match = (Object.keys(marginPresets) as (keyof typeof marginPresets)[]).find((key) => {
    const preset = marginPresets[key].margins
    return preset.top === margins.top && preset.right === margins.right && preset.bottom === margins.bottom && preset.left === margins.left
  })
  return match ?? 'custom'
}

/** The note's page setup, or the default for a note that has none. */
export function currentPageSetup(setup: PageSetup | null | undefined): PageSetup {
  return setup ? { ...setup, margins: { ...setup.margins } } : { ...DEFAULT_PAGE_SETUP, margins: { ...DEFAULT_PAGE_SETUP.margins } }
}

/** Page size in points, with orientation applied. */
export function pageSize(setup: PageSetup): { width: number; height: number } {
  const preset = setup.size === 'custom' ? { width: setup.width ?? PAGE_PRESETS.a4.width, height: setup.height ?? PAGE_PRESETS.a4.height } : PAGE_PRESETS[setup.size]
  return setup.orientation === 'landscape' ? { width: preset.height, height: preset.width } : { width: preset.width, height: preset.height }
}

/** Below this the page has no usable room for text (one inch). */
const MIN_CONTENT = 72
const MIN_PAGE = 144
const MAX_PAGE = 72 * 48

export type PageSetupPatch = Partial<Omit<PageSetup, 'margins'>> & { margins?: Partial<PageSetup['margins']> }

/**
 * Applies a change and checks it: the page must be between 2 and 48 inches, and the margins must
 * leave at least an inch for text both ways. Switching to Custom keeps the current size; a named
 * size drops custom width and height. Returns the normalized setup, or the reason it isn't valid.
 */
export function applyPageSetup(setup: PageSetup, patch: PageSetupPatch): { ok: true; setup: PageSetup } | { ok: false; error: string } {
  const next: PageSetup = { ...setup, ...patch, margins: { ...setup.margins, ...patch.margins } }
  if (patch.size === 'custom' && setup.size !== 'custom') {
    const preset = PAGE_PRESETS[setup.size]
    next.width = patch.width ?? preset.width
    next.height = patch.height ?? preset.height
  }
  if (next.size === 'custom') {
    if (!next.width || !next.height || next.width < MIN_PAGE || next.height < MIN_PAGE || next.width > MAX_PAGE || next.height > MAX_PAGE) return { ok: false, error: 'Page size must be between 2 and 48 inches.' }
  }
  if (next.startingPageNumber !== undefined && (!Number.isInteger(next.startingPageNumber) || next.startingPageNumber < 1)) return { ok: false, error: 'Page numbers start at 1 or higher.' }
  if (next.columns !== 1 && next.columns !== 2) return { ok: false, error: 'Choose one or two columns.' }
  const { width, height } = pageSize(next)
  const { top, right, bottom, left } = next.margins
  if ([top, right, bottom, left].some((value) => !Number.isFinite(value) || value < 0)) return { ok: false, error: 'Margins can’t be negative.' }
  if (width - left - right < MIN_CONTENT || height - top - bottom < MIN_CONTENT) return { ok: false, error: 'Those margins leave no room for text. Make them smaller.' }
  try {
    return { ok: true, setup: normalizePageSetup(next) }
  } catch {
    return { ok: false, error: 'That page size isn’t valid.' }
  }
}

/**
 * Metadata with a new page setup. A note with a section layout keeps its default section's copy
 * in step; other sections keep their own setup. Never adds a `layout` key a note didn't have.
 */
export function withPageSetup(metadata: DocumentMetadata, setup: PageSetup): DocumentMetadata {
  if (!metadata.layout) return { ...metadata, pageSetup: setup }
  return { ...metadata, pageSetup: setup, layout: { ...metadata.layout, defaultSection: { ...metadata.layout.defaultSection, pageSetup: setup } } }
}

/** The page drawn small in the panel: its shape and the text area inside, as percentages. */
export function pagePreview(setup: PageSetup) {
  const { width, height } = pageSize(setup)
  const { top, right, bottom, left } = setup.margins
  const percent = (value: number, of: number) => `${Math.max(0, Math.min(100, (value / of) * 100)).toFixed(2)}%`
  return { aspectRatio: `${width} / ${height}`, inset: { top: percent(top, height), right: percent(right, width), bottom: percent(bottom, height), left: percent(left, width) } }
}
