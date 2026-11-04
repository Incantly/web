import type { Metadata } from 'next'
import { noIndex } from '../../../lib/brand/siteMetadata'
import { SharedViewer } from '../../../components/product/SharedViewer'

export const metadata: Metadata = { title: 'Shared note · Incantly', ...noIndex }

/** Public view-only note. The token comes from the route and is never stored. */
export default async function SharedPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <SharedViewer token={token} />
}
