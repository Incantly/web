import { IncantlyFooter } from '../../components/landing/Footer'
import { SiteHeader } from '../../components/landing/SiteHeader'
import { PricingApp } from '../../components/pricing/PricingApp'
import { PricingFaq } from '../../components/pricing/PricingFaq'
import { pageMetadata } from '../../lib/brand/siteMetadata'

export const metadata = pageMetadata({ title: 'Pricing · Incantly', description: 'Incantly is free to start. Pro and Max add more AI, storage, lecture transcription and sharing.', path: '/pricing' })

export default function PricingPage() {
  return <>
    <SiteHeader current="pricing" />
    <main className="bg-canvas">
      <PricingApp />
      <PricingFaq />
    </main>
    <IncantlyFooter />
  </>
}
