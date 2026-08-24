type LogoMarkProps = {
  size?: number
  className?: string
}

/** Cast stroke: ink that flares at the tip, on a faint page corner. */
export default function LogoMark({ size = 26, className }: LogoMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      aria-hidden
      focusable="false"
    >
      <path
        d="M10 8.5 H30.5 L38 16 V39.5 H10 Z"
        stroke="currentColor"
        strokeWidth="2.2"
        opacity="0.38"
      />
      <path d="M30.5 8.5 L38 16 H30.5 Z" fill="currentColor" opacity="0.28" />
      <path
        d="M16 34 C18 24 22 16 33 13"
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
      <path
        d="M33 13 L35.4 8.2 L40.2 11.1 L35.2 12.6 L36.1 17.8 Z"
        fill="var(--accent-amber, #e3a23c)"
      />
    </svg>
  )
}
