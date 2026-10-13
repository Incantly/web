import type { Metadata } from 'next'
import { AuthScreen } from '../../components/product/AuthScreen'

export const metadata: Metadata = { title: 'Join Incantly' }

export default function AuthPage() {
  return <AuthScreen />
}
