"use client"

import { motion, useReducedMotion } from "framer-motion"
import { ArrowRight, ChevronDown, ExternalLink } from "lucide-react"
import Image from "next/image"
import { AnimatedText, FadeIn } from "@/components/ui/AnimatedText"
import { siteConfig } from "@/data/site"

export function Hero() {
  const prefersReducedMotion = useReducedMotion()

  const scrollToNext = () => {
    const nextSection = document.getElementById("features")
    if (nextSection) {
      nextSection.scrollIntoView({ behavior: "smooth" })
    }
  }

  return (
    <section
      className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden"
      aria-label="Hero"
    >
      {/* Background */}
      <div
        className="absolute inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse 45% 18% at 50% 0%, rgba(255,255,255,0.04) 0%, transparent 100%), " +
            "radial-gradient(ellipse 70% 55% at 50% 35%, #020202 0%, #000000 100%)",
        }}
        aria-hidden="true"
      />

      {/* Subtle grid overlay */}
      <div
        className="absolute inset-0 z-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)",
          backgroundSize: "80px 80px",
        }}
        aria-hidden="true"
      />

      {/* Gold accent glow */}
      <div
        className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] rounded-full opacity-[0.06] blur-[100px] z-0"
        style={{ background: "#c9a84c" }}
        aria-hidden="true"
      />

      {/* Content */}
      <div className="relative z-10 text-center px-4 sm:px-6 max-w-5xl mx-auto pt-24 pb-32">
        {/* Icon */}
        <FadeIn delay={0}>
          <div className="flex justify-center mb-8">
            <Image
              src="/icon.png"
              alt="Claude Studio"
              width={120}
              height={120}
              className="rounded-2xl shadow-[0_0_60px_rgba(201,168,76,0.15)]"
              priority
            />
          </div>
        </FadeIn>

        {/* Eyebrow */}
        <FadeIn delay={0.15}>
          <p className="text-[#c9a84c] text-xs font-semibold tracking-[0.3em] uppercase mb-6">
            Visual AI Coding Assistant
          </p>
        </FadeIn>

        {/* Wordmark */}
        <h1
          className="mb-2"
          style={{
            fontFamily: "var(--font-playfair-display), Georgia, serif",
          }}
        >
          <AnimatedText
            className="block text-5xl sm:text-6xl md:text-7xl lg:text-8xl xl:text-9xl font-bold text-white leading-none tracking-tight"
            delay={0.25}
            as="span"
          >
            CLAUDE STUDIO
          </AnimatedText>
        </h1>

        <FadeIn delay={0.65}>
          <p className="text-lg md:text-xl text-[#a0a0a0] max-w-2xl mx-auto mb-10 leading-relaxed">
            {siteConfig.description}
          </p>
        </FadeIn>

        {/* CTAs */}
        <FadeIn delay={0.8}>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href={siteConfig.github}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 border border-[#c9a84c] text-[#c9a84c] font-semibold px-8 py-4 rounded-md text-sm hover:bg-[rgba(201,168,76,0.08)] hover:shadow-[0_0_20px_rgba(201,168,76,0.2)] transition-all duration-200 active:scale-[0.98] w-full sm:w-auto justify-center"
            >
              <ExternalLink size={16} />
              View on GitHub
            </a>
            <a
              href="#how-it-works"
              className="inline-flex items-center gap-2 bg-[#c9a84c] text-black font-semibold px-8 py-4 rounded-md text-sm hover:bg-[#d4b65e] hover:shadow-[0_0_24px_rgba(201,168,76,0.4)] transition-all duration-200 active:scale-[0.98] w-full sm:w-auto justify-center"
            >
              Get Started
              <ArrowRight size={16} />
            </a>
          </div>
        </FadeIn>
      </div>

      {/* Scroll indicator */}
      <FadeIn
        delay={1.2}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10"
      >
        <button
          onClick={scrollToNext}
          className="flex flex-col items-center gap-2 text-[#666] hover:text-[#c9a84c] transition-colors duration-200 group cursor-pointer"
          aria-label="Scroll to next section"
        >
          <span className="text-xs tracking-widest uppercase">Scroll</span>
          <motion.div
            animate={prefersReducedMotion ? {} : { y: [0, 6, 0] }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          >
            <ChevronDown size={18} />
          </motion.div>
        </button>
      </FadeIn>
    </section>
  )
}
