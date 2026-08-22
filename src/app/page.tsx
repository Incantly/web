import Nav from '@/components/Nav'
import Hero from '@/components/Hero'
import StairWipe from '@/components/StairWipe'
import HowItWorks from '@/components/HowItWorks'
import Fields from '@/components/Fields'
import WhyGenerative from '@/components/WhyGenerative'
import Closer from '@/components/Closer'
import Footer from '@/components/Footer'

export default function Home() {
  return (
    <>
      <div id="top" />
      <Nav />
      <main>
        <Hero />
        <StairWipe />
        <HowItWorks />
        <Fields />
        <WhyGenerative />
        <Closer />
      </main>
      <Footer />
    </>
  )
}
