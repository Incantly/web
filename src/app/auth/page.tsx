import type { Metadata } from 'next'
import { AuthScreen } from '../../components/product/AuthScreen'

export const metadata: Metadata = { title: 'Sign in · Incantly' }

export default async function AuthPage({ searchParams }: PageProps<'/auth'>) {
  const { error } = await searchParams
  return <AuthScreen oauthError={typeof error === 'string' ? error : error?.[0]} />
}
