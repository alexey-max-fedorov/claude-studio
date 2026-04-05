import { Navbar } from "@/components/layout/Navbar"
import { Hero } from "@/components/sections/Hero"
import { TrustBar } from "@/components/sections/TrustBar"
import { Features } from "@/components/sections/Features"
import { HowItWorks } from "@/components/sections/HowItWorks"
import { Demo } from "@/components/sections/Demo"
import { CTA } from "@/components/sections/CTA"
import { Footer } from "@/components/layout/Footer"

export default function Home() {
  return (
    <>
      <Navbar />
      <main id="main-content">
        <Hero />
        <TrustBar />
        <Features />
        <HowItWorks />
        <Demo />
        <CTA />
      </main>
      <Footer />
    </>
  )
}
