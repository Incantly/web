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
