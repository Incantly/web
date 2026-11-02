'use client'

import type { DocumentMetadata } from '@incantly/canvas-core/document'
import type { Editor } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  applyPageSetup, currentPageSetup, defaultUnit, formatLength, lengthUnits, marginPresetOf, marginPresets, pagePreview, paperSizes, parseLength, withPageSetup,
  type LengthUnit, type MarginPreset, type PageSetupPatch,
} from '@/components/product/workspace/pageSetupModel'
import { CONTENT_MIN, contentMinWidth } from '@/components/product/workspace/panelWidthModel'
import { setDocumentMetadata } from '@/lib/document-editor/documentMetadata'
import { pageMetrics } from '@/lib/document-editor/pageChrome'
import { useWorkspaceUI } from '@/hooks/use-workspace-ui'

const UNIT_KEY = 'incantly:length-unit'

function storedUnit(): LengthUnit {
  try {
    const value = localStorage.getItem(UNIT_KEY)
    if (value === 'cm' || value === 'in' || value === 'mm' || value === 'pt') return value
  } catch { /* storage blocked: fall back to the locale */ }
  return defaultUnit(typeof navigator === 'undefined' ? undefined : navigator.language)
}

/**
 * The open note's page setup: paper, orientation, margins, columns, page numbering, and
 * continuous or Pages mode. It is read live from the editor and changed through it
 * (`setDocumentMetadata`), so each change saves with the note like any other edit. The display
 * unit is a per-device preference. Used by the note screen; no provider (one note at a time).
 */
export function usePageSetup(editor: Editor | null, editable: boolean) {
  const stored = useEditorState({
    editor,
    selector: ({ editor: current }) => (current?.state.doc.attrs.metadata as DocumentMetadata | null | undefined)?.pageSetup ?? null,
  })
  const setup = useMemo(() => currentPageSetup(stored), [stored])
  const [unit, setUnitState] = useState<LengthUnit>(storedUnit)
  const [error, setError] = useState<string | null>(null)
  const ready = Boolean(editor) && editable

  /** Applies a change if it is valid; otherwise keeps the note as it is and says why. */
  // In Pages mode the docked panel stops growing where the whole sheet still fits beside it.
  const { setContentMin } = useWorkspaceUI()
  const sheetWidth = setup.mode === 'paginated' ? pageMetrics(setup).width : null
  useEffect(() => {
    setContentMin(contentMinWidth(sheetWidth))
    return () => setContentMin(CONTENT_MIN)
  }, [sheetWidth, setContentMin])

  const update = useCallback((patch: PageSetupPatch): boolean => {
    if (!editor || !editable) return false
    const result = applyPageSetup(setup, patch)
    if (!result.ok) { setError(result.error); return false }
    setError(null)
    setDocumentMetadata(editor, (metadata) => withPageSetup(metadata, result.setup))
    return true
  }, [editor, editable, setup])

  const setUnit = useCallback((next: LengthUnit) => {
    setUnitState(next)
    try { localStorage.setItem(UNIT_KEY, next) } catch { /* not remembered on this device */ }
  }, [])

  /** A length typed in the current unit; false (with a reason) when it isn't a number. */
  const updateLength = useCallback((apply: (points: number) => PageSetupPatch, text: string): boolean => {
    const points = parseLength(text, unit)
    if (points === null) { setError('Enter a number of 0 or more.'); return false }
    return update(apply(points))
  }, [unit, update])

  const applyMarginPreset = useCallback((preset: MarginPreset) => {
    if (preset !== 'custom') update({ margins: { ...marginPresets[preset].margins } })
  }, [update])

  return {
    setup,
    paginated: setup.mode === 'paginated',
    /** False while the note is loading or read-only. */
    ready,
    error,
    clearError: () => setError(null),
    unit,
    setUnit,
    /** A length in points, as text in the current unit. */
    show: (points: number) => formatLength(points, unit),
    unitLabel: unit,
    update,
    updateLength,
    marginPreset: marginPresetOf(setup.margins),
    applyMarginPreset,
    preview: pagePreview(setup),
    /** Margin labels: inside/outside when margins mirror on facing pages. */
    marginLabels: setup.mirroredMargins ? { left: 'Inside', right: 'Outside' } : { left: 'Left', right: 'Right' },
    options: {
      paperSizes,
      units: lengthUnits,
      marginPresets: [...(Object.keys(marginPresets) as (keyof typeof marginPresets)[]).map((key) => ({ value: key as MarginPreset, label: marginPresets[key].label })), { value: 'custom' as MarginPreset, label: 'Custom' }],
    },
  }
}

export type PageSetupState = ReturnType<typeof usePageSetup>
