'use client'

import { useEffect, useRef, useState, useSyncExternalStore, type DragEvent } from 'react'
import { SOURCE_DRAG_TYPE, dropFeedback, isSourceDrag, type DropFeedback } from '@/components/product/workspace/sourceDragModel'

/**
 * Whether a Library source is being dragged anywhere, so every Space can outline itself as a drop
 * target at once. One module-level store with one pair of window listeners, however many targets.
 */
let dragging = false
const listeners = new Set<() => void>()
function setDragging(next: boolean) {
  if (dragging === next) return
  dragging = next
  listeners.forEach((listener) => listener())
}
const end = () => setDragging(false)
function subscribe(listener: () => void) {
  listeners.add(listener)
  if (listeners.size === 1) {
    // Capture phase: a drop or cancelled drag (Esc, dropped outside) always ends it.
    window.addEventListener('dragend', end, true)
    window.addEventListener('drop', end, true)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      window.removeEventListener('dragend', end, true)
      window.removeEventListener('drop', end, true)
    }
  }
}

export function useIsDraggingSource(): boolean {
  return useSyncExternalStore(subscribe, () => dragging, () => false)
}

/** Props that make an element drag a Library source (mouse and trackpad; not touch). */
export function sourceDragProps(sourceId: string, title: string) {
  return {
    draggable: true,
    onDragStart: (event: DragEvent<HTMLElement>) => {
      event.dataTransfer.setData(SOURCE_DRAG_TYPE, sourceId)
      // Dropped outside the app (e.g. into a text field), it's just the title.
      event.dataTransfer.setData('text/plain', title)
      event.dataTransfer.effectAllowed = 'link'
      setDragging(true)
    },
    onDragEnd: end,
  }
}

const FEEDBACK_MS = 2500

/**
 * A Space that accepts a dropped Library source and links it (`link` resolves `true` when newly
 * added, `false` when it was already there). Shows a short "Added" / reason afterwards.
 */
export function useSpaceDropTarget(link: ((sourceId: string) => Promise<boolean>) | undefined, options: { onLinked?: () => void; spaceName?: string } = {}) {
  const anyDragging = useIsDraggingSource()
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<DropFeedback | null>(null)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const show = (next: DropFeedback) => {
    setFeedback(next)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setFeedback(null), FEEDBACK_MS)
  }

  const accepts = (event: DragEvent<HTMLElement>) => Boolean(link) && isSourceDrag([...event.dataTransfer.types])

  return {
    /** A source drag is under way, so this target should look droppable. */
    armed: Boolean(link) && anyDragging,
    /** The drag is over this target. */
    over,
    busy,
    feedback,
    dropProps: {
      onDragEnter: (event: DragEvent<HTMLElement>) => { if (accepts(event)) { event.preventDefault(); setOver(true) } },
      onDragOver: (event: DragEvent<HTMLElement>) => { if (accepts(event)) { event.preventDefault(); event.dataTransfer.dropEffect = 'link' } },
      onDragLeave: (event: DragEvent<HTMLElement>) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false) },
      onDrop: (event: DragEvent<HTMLElement>) => {
        setOver(false)
        if (!link || !accepts(event)) return
        event.preventDefault()
        const sourceId = event.dataTransfer.getData(SOURCE_DRAG_TYPE)
        if (!sourceId) return
        setBusy(true)
        link(sourceId)
          .then((created) => { show(dropFeedback({ created }, options.spaceName)); options.onLinked?.() })
          .catch((error: unknown) => show(dropFeedback({ error }, options.spaceName)))
          .finally(() => setBusy(false))
      },
    },
  }
}
