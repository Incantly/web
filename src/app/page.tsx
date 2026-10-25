import { IncantlyHero } from '../components/landing/IncantlyHero'
import { IncantlyProductShowcase } from '../components/landing/ProductShowcase'
import { IncantlyThinkFurther } from '../components/landing/ThinkFurther'
import { IncantlyThinkingAudience } from '../components/landing/ThinkingAudience'
import { IncantlyFeatureStack } from '../components/landing/FeatureStack'
import { IncantlyCloser } from '../components/landing/Closer'
import { IncantlyFooter } from '../components/landing/Footer'
import ScrollRoot from '../components/ScrollRoot'
import { pageMetadata, siteDescription, siteTitle } from '../lib/brand/siteMetadata'
import { homeStructuredData, jsonLd } from '../lib/brand/structuredData'

export const metadata = pageMetadata({ title: siteTitle, description: siteDescription, path: '/' })

export default function Home() {
  return (
    <ScrollRoot>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(homeStructuredData()) }} />
      <main id="top" className="min-h-svh">
          <IncantlyHero />
          <IncantlyProductShowcase />
          <IncantlyThinkFurther />
          <IncantlyThinkingAudience />
          <IncantlyFeatureStack />
          <IncantlyCloser />
      </main>
      <IncantlyFooter />
    </ScrollRoot>
  )
}
