import type { Metadata } from 'next'
import { AuthScreen } from '../../../components/product/AuthScreen'
import { noIndex } from '../../../lib/brand/siteMetadata'

export const metadata: Metadata = { title: 'Create account · Incantly', ...noIndex }

export default function SignUpPage() { return <AuthScreen initialMode="signup" /> }
