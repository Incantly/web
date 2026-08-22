import type { CSSProperties } from 'react'

interface DecodeTextProps {
  text: string
  start: boolean
  className?: string
  /** ms between each word's reveal */
  stagger?: number
  baseDelay?: number
  /** word indices rendered in the accent (violet italic) style */
  accents?: number[]
}

/**
 * Headline reveal: every word starts as a solid violet redacted block,
 * then the blocks wipe away word by word — form resolving out of nothing.
 */
export default function DecodeText({
  text,
  start,
  className,
  stagger = 90,
  baseDelay = 0,
  accents = [],
}: DecodeTextProps) {
  const words = text.split(' ')
  return (
    <span className={`decode${start ? ' decode--go' : ''}${className ? ` ${className}` : ''}`}>
      {words.map((word, i) => (
        <span key={i}>
          <span
            className={`decode-word${accents.includes(i) ? ' decode-word--accent' : ''}`}
            style={{ '--d': `${baseDelay + i * stagger}ms` } as CSSProperties}
          >
            <span className="decode-txt">{word}</span>
          </span>
          {i < words.length - 1 ? ' ' : ''}
        </span>
      ))}
    </span>
  )
}
