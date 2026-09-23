import { IncantlyHero } from '../components/landing/IncantlyHero'
import { IncantlyProductShowcase } from '../components/landing/ProductShowcase'
import { IncantlyThinkFurther } from '../components/landing/ThinkFurther'
import { IncantlyThinkingAudience } from '../components/landing/ThinkingAudience'
import { IncantlyFeatureStack } from '../components/landing/FeatureStack'
import { IncantlyCloser } from '../components/landing/Closer'
import { IncantlyFooter } from '../components/landing/Footer'

export default function Home() {
  return (
    <>
      <main id="top">
          <IncantlyHero />
          <IncantlyProductShowcase />
          <IncantlyThinkFurther />
          <IncantlyThinkingAudience />
          <IncantlyFeatureStack />
          <IncantlyCloser />
      </main>
      <IncantlyFooter />
    </>
  )
}
