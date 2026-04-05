"use client"

import { motion } from "framer-motion"
import {
  MousePointerClick,
  MessageSquareText,
  Radio,
  History,
  DollarSign,
  Layers,
} from "lucide-react"
import { ScrollReveal } from "@/components/ui/ScrollReveal"
import { siteConfig } from "@/data/site"

const iconMap = {
  MousePointerClick,
  MessageSquareText,
  Radio,
  History,
  DollarSign,
  Layers,
} as const

export function Features() {
  return (
    <section
      id="features"
      className="py-24 lg:py-32 px-4 sm:px-6 lg:px-8 bg-[#000]"
      aria-labelledby="features-heading"
    >
      <div className="max-w-7xl mx-auto">
        <ScrollReveal>
          <div className="text-center mb-16">
            <p className="text-[#c9a84c] text-xs font-semibold tracking-[0.25em] uppercase mb-3">
              Features
            </p>
            <h2
              id="features-heading"
              className="text-3xl md:text-4xl lg:text-5xl font-semibold text-white leading-tight"
              style={{ fontFamily: "var(--font-playfair-display), Georgia, serif" }}
            >
              Everything you need
            </h2>
            <p className="mt-4 text-[#a0a0a0] text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
              A complete visual editing toolkit powered by Claude Code. Select, describe, ship.
            </p>
          </div>
        </ScrollReveal>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {siteConfig.features.map((feature, i) => {
            const Icon = iconMap[feature.icon as keyof typeof iconMap]
            return (
              <ScrollReveal key={feature.title} delay={i * 0.1}>
                <motion.div
                  className="group relative bg-[#111] border border-[#1a1a1a] rounded-xl p-8 flex flex-col h-full transition-all duration-300 cursor-default"
                  whileHover={{
                    borderColor: "rgba(201,168,76,0.35)",
                    boxShadow: "0 0 40px rgba(201,168,76,0.08)",
                    y: -4,
                  }}
                  transition={{ duration: 0.25 }}
                >
                  <div className="w-12 h-12 rounded-lg bg-[rgba(201,168,76,0.1)] flex items-center justify-center mb-6 group-hover:bg-[rgba(201,168,76,0.18)] transition-colors duration-300">
                    <Icon size={22} className="text-[#c9a84c]" aria-hidden="true" />
                  </div>

                  <h3
                    className="text-xl font-semibold text-white mb-3"
                    style={{ fontFamily: "var(--font-playfair-display), Georgia, serif" }}
                  >
                    {feature.title}
                  </h3>

                  <p className="text-[#a0a0a0] text-sm leading-relaxed flex-1">
                    {feature.description}
                  </p>
                </motion.div>
              </ScrollReveal>
            )
          })}
        </div>
      </div>
    </section>
  )
}
