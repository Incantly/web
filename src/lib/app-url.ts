/** Product app origin (workspace / auth). Empty = stay on this landing page. */
export function appHref(path: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? ''
  if (!base) return '#access'
  return path.startsWith('/') ? `${base}${path}` : `${base}/${path}`
}
