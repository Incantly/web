import type { ReactNode, SVGProps } from 'react'

export type IconName = 'archive' | 'check' | 'chevron' | 'code' | 'document' | 'home' | 'inbox' | 'journal' | 'math' | 'menu' | 'minus' | 'panel' | 'paper' | 'plus' | 'quote' | 'search' | 'settings' | 'share' | 'sparkles' | 'table'

const paths: Record<IconName, ReactNode> = {
  archive: <><path d="M4 7h16v13H4z"/><path d="M3 4h18v3H3zM9 11h6"/></>,
  check: <path d="m5 13 4 4L19 7"/>,
  chevron: <path d="m9 18 6-6-6-6"/>,
  code: <><path d="m8 8-4 4 4 4M16 8l4 4-4 4"/></>,
  document: <><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5M9 12h6M9 16h6"/></>,
  home: <><path d="m3 11 9-8 9 8"/><path d="M5 10v11h14V10M9 21v-7h6v7"/></>,
  inbox: <><path d="M4 5h16v14H4z"/><path d="M4 14h5l2 3h2l2-3h5"/></>,
  journal: <><path d="M5 4h13v17H5zM8 4v17"/><path d="M11 8h4M11 12h4"/></>,
  math: <><path d="M5 6h14M7 6v2a5 5 0 0 0 10 0V6M9 20l1-8M15 20l-1-8"/></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16"/>,
  minus: <path d="M5 12h14"/>,
  panel: <><path d="M6 4h3v16H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3Z" fill="currentColor" stroke="none"/><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/></>,
  paper: <><path d="M6 4h12v16H6z"/><path d="M9 8h6M9 12h6M9 16h4"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  quote: <path d="M9 6C6 8 4 11 4 15v3h6v-6H7c0-2 1-4 2-5zM20 6c-3 2-5 5-5 9v3h6v-6h-3c0-2 1-4 2-5z"/>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m16.5 16.5 4 4"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a8 8 0 0 0-1.7-1L14.5 3h-5l-.4 3.1a8 8 0 0 0-1.7 1L5 6.1 3 9.5 5.1 11a7 7 0 0 0 0 2L3 14.5 5 18l2.4-1a8 8 0 0 0 1.7 1l.4 3h5l.4-3a8 8 0 0 0 1.7-1l2.4 1 2-3.5-2.1-1.5a7 7 0 0 0 .1-1Z"/></>,
  share: <><circle cx="18" cy="5" r="2"/><circle cx="6" cy="12" r="2"/><circle cx="18" cy="19" r="2"/><path d="m8 11 8-5M8 13l8 5"/></>,
  sparkles: <><path d="m12 3 1.2 4.8L18 9l-4.8 1.2L12 15l-1.2-4.8L6 9l4.8-1.2z"/><path d="m19 14 .6 2.4L22 17l-2.4.6L19 20l-.6-2.4L16 17l2.4-.6z"/></>,
  table: <><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 10h16M10 10v10"/></>,
}

export function AppIcon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return <svg aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" {...props}>{paths[name]}</svg>
}
