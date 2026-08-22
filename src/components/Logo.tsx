type LogoMarkProps = {
  size?: number
  className?: string
}

/**
 * Incantly mark: a speech bubble that is also a UI window — the spoken
 * incantation becoming an interface — with a spark for the moment of casting.
 */
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
      {/* window / speech bubble */}
      <rect
        x="4.5"
        y="9.5"
        width="33"
        height="26"
        rx="8"
        stroke="var(--brand-violet, #6d28d9)"
        strokeWidth="3"
      />
      {/* window header dots */}
      <circle cx="12.5" cy="17" r="1.8" fill="var(--brand-violet, #6d28d9)" opacity="0.5" />
      <circle cx="18.5" cy="17" r="1.8" fill="var(--brand-violet, #6d28d9)" opacity="0.5" />
      {/* generated interface inside */}
      <rect x="11" y="24" width="5.5" height="7" rx="1.8" fill="var(--brand-violet, #6d28d9)" opacity="0.55" />
      <rect x="19.5" y="21" width="5.5" height="10" rx="1.8" fill="var(--brand-violet, #6d28d9)" />
      <rect x="28" y="26" width="5.5" height="5" rx="1.8" fill="var(--brand-violet, #6d28d9)" opacity="0.75" />
      {/* speech tail */}
      <path
        d="M13 35 L13 44.6 C13 46 14.2 46.4 15.2 45.4 L24.5 36 Z"
        fill="var(--brand-violet, #6d28d9)"
      />
      {/* the spark of the incantation */}
      <path
        d="M40 1 L42.2 6.8 L48 9 L42.2 11.2 L40 17 L37.8 11.2 L32 9 L37.8 6.8 Z"
        fill="var(--accent-amber, #e3a23c)"
      />
      <circle cx="33" cy="2.8" r="1.6" fill="var(--accent-amber, #e3a23c)" opacity="0.7" />
    </svg>
  )
}
