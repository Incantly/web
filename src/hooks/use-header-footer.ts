'use client'

import { PageLayoutError, setDifferentFirstPage, setDifferentOddEven, setHeaderFooter, type DocumentMetadata, type HeaderFooterContent, type HeaderFooterKind, type HeaderFooterVariant, type PageLayout } from '@incantly/canvas-core/document'
import type { Editor } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  activeVariant, headerFooterPresets, layoutOf, layoutOptions, numberStyleOf, numberStyles, previewPages, variantTabs, withNumberStyle, type NumberStyle,
} from '@/components/product/workspace/headerFooterModel'
import { documentMetadata, setDocumentMetadata } from '@/lib/document-editor/documentMetadata'

/** Typing in a header waits this long before the note saves it. */
const SAVE_DELAY_MS = 500

type Pending = { kind: HeaderFooterKind; variant: HeaderFooterVariant; content: HeaderFooterContent[] }

/**
 * The open note's headers and footers (its default section): text with page fields, a different
 * first page, different odd and even pages, presets, number style, and a preview of pages 1–3.
 * Read live from the editor and saved through it (`setDocumentMetadata`), like page setup. Typing
 * is batched so a long note isn't rebuilt on every key. Used by the note screen; no provider.
 */
export function useHeaderFooter(editor: Editor | null, editable: boolean) {
  const metadata = useEditorState({
    editor,
    selector: ({ editor: current }) => (current?.state.doc.attrs.metadata as DocumentMetadata | null | undefined) ?? null,
  })
  const layout = useMemo(() => (metadata ? layoutOf(metadata) : null), [metadata])
  const options = useMemo(() => (layout ? layoutOptions(layout) : { differentFirstPage: false, differentOddEven: false }), [layout])
  const tabs = useMemo(() => variantTabs(options), [options])
  const [selected, setSelected] = useState<HeaderFooterVariant>('default')
  const variant = activeVariant(selected, tabs)
  /** Bumped when content changes from outside the editors (a preset), so they reload it. */
  const [revision, setRevision] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const ready = Boolean(editor && metadata) && editable

  /** Applies a layout change to the note; a refused change keeps the note as it is and says why. */
  const change = useCallback((update: (layout: PageLayout) => PageLayout): boolean => {
    if (!editor || !editable) return false
    try {
      setDocumentMetadata(editor, (current) => ({ ...current, layout: update(layoutOf(current)) }))
      setError(null)
      return true
    } catch (cause) {
      setError(cause instanceof PageLayoutError ? 'That header or footer has content it can’t hold.' : 'That change couldn’t be applied.')
      return false
    }
  }, [editor, editable])

  const pending = useRef<Pending | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const flush = useCallback(() => {
    window.clearTimeout(timer.current)
    const next = pending.current
    pending.current = null
    const current = documentMetadata(editor)
    if (!next || !current) return
    const sectionId = layoutOf(current).defaultSection.id
    // An empty "all pages" header removes it; an empty first page stays as a deliberately blank one.
    const content = next.content.length || next.variant === 'first' ? next.content : undefined
    change((current) => setHeaderFooter(current, sectionId, next.kind, next.variant, content))
  }, [change, editor])
  // Leaving the panel or the note saves what was typed.
  useEffect(() => () => flush(), [flush])

  /** What a header/footer editor reports while typing; saved after a short pause. */
  const edit = useCallback((kind: HeaderFooterKind, editedVariant: HeaderFooterVariant, content: HeaderFooterContent[]) => {
    if (pending.current && (pending.current.kind !== kind || pending.current.variant !== editedVariant)) flush()
    pending.current = { kind, variant: editedVariant, content }
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(flush, SAVE_DELAY_MS)
  }, [flush])

  const section = layout?.defaultSection
  const sectionId = section?.id ?? ''
  return {
    ready,
    error,
    clearError: () => setError(null),
    tabs,
    variant,
    selectVariant: (next: HeaderFooterVariant) => { flush(); setSelected(next) },
    /** Remount key for the editors: changes with the variant and after a preset. */
    editorKey: `${variant}:${revision}`,
    header: section?.headers?.[variant],
    footer: section?.footers?.[variant],
    edit,
    differentFirstPage: options.differentFirstPage,
    differentOddEven: options.differentOddEven,
    setDifferentFirstPage: (enabled: boolean) => { flush(); if (change((current) => setDifferentFirstPage(current, sectionId, enabled))) setRevision((value) => value + 1) },
    setDifferentOddEven: (enabled: boolean) => { flush(); if (change((current) => setDifferentOddEven(current, sectionId, enabled))) setRevision((value) => value + 1) },
    presets: headerFooterPresets,
    applyPreset: (kind: HeaderFooterKind, presetId: string) => {
      const preset = headerFooterPresets[kind].find((item) => item.id === presetId)
      if (!preset) return
      flush()
      const content = preset.content()
      if (change((current) => setHeaderFooter(current, sectionId, kind, variant, content.length || variant === 'first' ? content : undefined))) setRevision((value) => value + 1)
    },
    numberStyle: layout ? numberStyleOf(layout) : 'decimal',
    numberStyles,
    setNumberStyle: (style: NumberStyle) => { flush(); if (change((current) => withNumberStyle(current, style))) setRevision((value) => value + 1) },
    preview: metadata ? previewPages(metadata) : [],
  }
}

export type HeaderFooterState = ReturnType<typeof useHeaderFooter>
