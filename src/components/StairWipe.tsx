'use client'

import { useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'

const COLS = 15

/**
 * Full-screen staircase wipe. The section is tall; the viewport is sticky.
 * Columns rise 1 → 2 → 3… in the same dark color until they cover the screen
 * and hand off into How it works.
 */
export default function StairWipe() {
  const outerRef = useRef<HTMLDivElement | null>(null)
  const viewportRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const outer = outerRef.current
        const viewport = viewportRef.current
        if (!outer || !viewport) return
        const total = Math.max(1, outer.offsetHeight - window.innerHeight)
        const p = Math.min(1, Math.max(0, -outer.getBoundingClientRect().top / total))
        viewport.style.setProperty('--p', String(p))
      })
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div className="stair" ref={outerRef} aria-hidden>
      <div className="stair-viewport" ref={viewportRef}>
        {Array.from({ length: COLS }, (_, i) => (
          <span
            key={i}
            className="stair-col"
            style={
              {
                '--i': i,
                /* finish covering before the section ends so HIW box is ready */
                '--start': (i / COLS) * 0.5,
              } as CSSProperties
            }
          />
        ))}
      </div>
    </div>
  )
}
