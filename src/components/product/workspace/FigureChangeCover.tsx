'use client'

import { useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { startPixelShader, type PlaceholderEnergy } from '@/lib/document-editor/pixelShader'

/**
 * The pixel-shader veil over a figure while its change job runs: the same shader as the
 * generation placeholder, canvas-sized, so both moments mean "a figure is becoming" in one
 * language. Blue (#2b62d9) on bone (#f6f3ec) — never blue on white.
 *
 * Positioned over the figure's mounted DOM and tracked across scroll and resize; purely a
 * cover, so it unmounts with the popup and never touches the document. Energy follows the
 * job's events (checking breathes, repairing throbs); reduced motion renders one still
 * frame.
 */
export function FigureChangeCover({
  editor,
  figureId,
  visible,
  energy,
}: {
  editor: Editor | null
  figureId: string
  visible: boolean
  energy: PlaceholderEnergy
}) {
  const [rect, setRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const shaderRef = useRef<{ stop: () => void; setEnergy: (energy: PlaceholderEnergy) => void } | null>(null)
  const energyRef = useRef(energy)

  useEffect(() => {
    // A stale rect while hidden is harmless: rendering is gated on `visible`.
    if (!visible || !editor || editor.isDestroyed) return
    const place = () => {
      const live = editor
      if (live.isDestroyed) {
        setRect(null)
        return
      }
      let pos: number | null = null
      live.state.doc.descendants((node, at) => {
        if (node.type.name === 'incantlyFigure' && node.attrs.figureId === figureId) {
          pos = at
          return false
        }
        return true
      })
      if (pos === null) {
        setRect(null)
        return
      }
      const dom = live.view.nodeDOM(pos) as HTMLElement | null
      if (!dom || !dom.isConnected) {
        setRect(null)
        return
      }
      const box = dom.getBoundingClientRect()
      if (box.width < 2 || box.height < 2) {
        setRect(null)
        return
      }
      setRect({ top: box.top, left: box.left, width: box.width, height: box.height })
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [visible, editor, figureId])

  // Framed is stable across scrolls: rect updates move the frame, never restart the shader.
  const framed = rect !== null
  useEffect(() => {
    const canvas = canvasRef.current
    if (!visible || !framed || !canvas || shaderRef.current) return
    const shader = startPixelShader(canvas)
    shader.setEnergy(energyRef.current)
    shaderRef.current = shader
    return () => {
      shader.stop()
      shaderRef.current = null
    }
  }, [visible, framed])

  useEffect(() => {
    energyRef.current = energy
    shaderRef.current?.setEnergy(energy)
  }, [energy])

  if (!visible || !rect) return null
  return (
    <div
      aria-hidden="true"
      className="pointer-events-auto fixed z-30 cursor-wait overflow-hidden rounded-xl"
      style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
    >
      <canvas ref={canvasRef} className="absolute -inset-[8%] h-[116%] w-[116%] [image-rendering:pixelated]" />
    </div>
  )
}
