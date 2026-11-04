import type { Metadata } from 'next'
import { noIndex } from '../../../lib/brand/siteMetadata'
import { Workspace } from '../../../components/product/Workspace'

export const metadata: Metadata = { title: 'Shared note · Incantly', ...noIndex }

/**
 * A share link opens the normal workspace around the linked note (read-only).
 * The session gate signs visitors in first and returns them to this URL.
 * The token comes from the route, lives in memory only, and is never stored.
 */
export default async function SharedPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <Workspace sharedToken={token} />
}
