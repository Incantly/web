import type { Metadata } from 'next'
import { noIndex } from '../../lib/brand/siteMetadata'
import { AuthScreen } from '../../components/product/AuthScreen'

export const metadata: Metadata = { title: 'Sign in · Incantly', ...noIndex }

export default async function AuthPage({ searchParams }: PageProps<'/auth'>) {
  const { error } = await searchParams
  return <AuthScreen oauthError={typeof error === 'string' ? error : error?.[0]} />
}
