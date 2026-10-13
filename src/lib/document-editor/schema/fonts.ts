import { FONT_FAMILY_STACKS, type FontFamilyKey } from '@incantly/core/document'

export interface DocumentFontFamily {
  key: FontFamilyKey
  /** Visible name, as in Word's font dropdown. */
  label: string
  /** Full system stack; storage holds only the key. */
  stack: string
}

/**
 * Curated system-only preset list. System stacks are free in every sense
 * for a local-first app: no download, no license, no network, offline-safe.
 * They cover research typography: Arial/Helvetica (sans), Times New Roman
 * (serif body), Courier New (mono manuscripts).
 */
export const DOCUMENT_FONT_FAMILIES: readonly DocumentFontFamily[] = [
  { key: 'sans', label: 'System Sans', stack: FONT_FAMILY_STACKS.sans },
  { key: 'times', label: 'Times New Roman', stack: FONT_FAMILY_STACKS.times },
  { key: 'mono', label: 'Courier New', stack: FONT_FAMILY_STACKS.mono },
]

const normalizedNames = (stack: string): string[] =>
  stack.split(',').map((part) => part.trim().replace(/^['"]|['"]$/g, '').toLowerCase()).filter(Boolean)

/**
 * Translate a CSS font-family value (full stack or single family, as the
 * stock extension stores in ProseMirror) back to its canonical short key.
 * Unknown families return null so the adapter can omit them.
 */
export function matchFontFamilyKey(value: string): FontFamilyKey | null {
  const first = normalizedNames(value)[0]
  if (!first) return null
  const found = DOCUMENT_FONT_FAMILIES.find(
    (family) => family.key === first || family.label.toLowerCase() === first
      || normalizedNames(family.stack).includes(first),
  )
  return found ? found.key : null
}

/** Canonical key to CSS stack for ProseMirror attributes. */
export function fontStackForKey(key: FontFamilyKey): string {
  return FONT_FAMILY_STACKS[key]
}

/** Canonical font-size gate in points (mirrors core validation). */
export const FONT_SIZE_MIN_PT = 1
export const FONT_SIZE_MAX_PT = 200

/** Word's preset size list, in points. */
export const FONT_SIZE_PRESETS: readonly number[] = [8, 9, 10, 11, 12, 14, 18, 24, 36, 48, 72]

/**
 * Parse a CSS font-size value (as the stock extension stores in
 * ProseMirror) to canonical points. Unknown units and out-of-range values
 * return null so the adapter can omit them.
 */
export function parseFontSizeToPt(value: string): number | null {
  const match = /^\s*(\d+(?:\.\d+)?)\s*(px|pt)?\s*$/i.exec(value)
  if (!match) return null
  const num = Number(match[1])
  if (!Number.isFinite(num)) return null
  const pt = (match[2] ?? 'pt').toLowerCase() === 'px' ? (num * 72) / 96 : num
  const rounded = Math.round(pt * 10) / 10
  return rounded >= FONT_SIZE_MIN_PT && rounded <= FONT_SIZE_MAX_PT ? rounded : null
}

/** Canonical points to the CSS value ProseMirror holds. */
export function fontSizeToCss(size: number): string {
  return `${size}pt`
}
