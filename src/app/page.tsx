import { IncantlyHero } from '../components/landing/IncantlyHero'
import { IncantlyProductShowcase } from '../components/landing/ProductShowcase'
import { IncantlyThinkFurther } from '../components/landing/ThinkFurther'
import { IncantlyThinkingAudience } from '../components/landing/ThinkingAudience'
import { IncantlyFeatureStack } from '../components/landing/FeatureStack'

export default function Home() {
  return (
    <main id="top">
        <IncantlyHero />
        <IncantlyProductShowcase />
        <IncantlyThinkFurther />
        <IncantlyThinkingAudience />
        <IncantlyFeatureStack />
    </main>
  )
}
