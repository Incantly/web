'use client'

import { useEffect } from 'react'
import Lenis from 'lenis'
import 'lenis/dist/lenis.css'

export default function ScrollRoot({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    document.documentElement.style.setProperty('--curl', '0')
    if (reduced) return

    const lenis = new Lenis({
      anchors: true,
      lerp: 0.09,
      autoRaf: true,
    })

    let activity = 0
    const onScroll = (instance: Lenis) => {
      const target = Math.min(1, Math.abs(instance.velocity) / 2.4)
      const blend = target > activity ? 0.22 : 0.08
      activity += (target - activity) * blend
      document.documentElement.style.setProperty('--curl', activity.toFixed(4))
    }
    lenis.on('scroll', onScroll)

    const ro = new ResizeObserver(() => {
      lenis.resize()
    })
    ro.observe(document.documentElement)

    return () => {
      ro.disconnect()
      lenis.off('scroll', onScroll)
      lenis.destroy()
      document.documentElement.style.setProperty('--curl', '0')
    }
  }, [])

  return <>{children}</>
}
