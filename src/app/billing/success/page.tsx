import type { Metadata } from 'next'
import { SiteHeader } from '../../../components/landing/SiteHeader'
import { CheckoutReturn } from '../../../components/pricing/CheckoutReturn'
import { noIndex } from '../../../lib/brand/siteMetadata'

export const metadata: Metadata = { title: 'Confirming payment · Incantly', ...noIndex }

export default function CheckoutSuccessPage() {
  return <>
    <SiteHeader />
    <CheckoutReturn />
  </>
}
