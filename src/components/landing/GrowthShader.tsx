'use client'
import { useEffect, useState } from 'react'
import { Dithering } from '@paper-design/shaders-react'

export function GrowthShader() {
  const [colors, setColors] = useState<{ front: string; back: string } | null>(null)
  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => {
      const style = getComputedStyle(document.documentElement)
      setColors(motion.matches ? null : { front: style.getPropertyValue('--ui-shader-front').trim(), back: style.getPropertyValue('--ui-shader-back').trim() })
    }
    update()
    motion.addEventListener('change', update)
    return () => motion.removeEventListener('change', update)
  }, [])
  return <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden opacity-90">
    {colors ? <Dithering speed={0.25} shape="warp" type="4x4" size={4} scale={1} frame={5929.724999967142} colorBack={colors.back} colorFront={colors.front} style={{ width: '100%', height: '100%' }} /> : null}
  </div>
}
