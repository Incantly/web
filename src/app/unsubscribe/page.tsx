import type { Metadata } from 'next'
import { noIndex } from '../../lib/brand/siteMetadata'
import { UnsubscribeView } from '../../components/product/UnsubscribeView'

export const metadata: Metadata = { title: 'Unsubscribe · Incantly', ...noIndex }

/** Public email-unsubscribe confirmation. The token comes from the query string and is never stored. */
export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams
  return <UnsubscribeView token={token ?? null} />
}
