import {
  MousePointerClick,
  MessageSquareText,
  History,
  FolderOpen,
  SlidersHorizontal,
  Radio,
} from "lucide-react"
import { ScrollReveal } from "@/components/ui/ScrollReveal"
import { siteConfig } from "@/data/site"

const iconMap = {
  MousePointerClick,
  MessageSquareText,
  History,
  FolderOpen,
  SlidersHorizontal,
  Radio,
} as const

export function Features() {
  return (
    <section id="features" className="section" aria-labelledby="features-heading">
      <div className="page-width">
        <ScrollReveal>
          <div className="section-heading">
            <p className="eyebrow">01 / Capabilities</p>
            <h2 id="features-heading">Features</h2>
            <p className="section-intro">
              The side panel connects to Claude Code running in your project.
              Browser context is attached to the conversation only when you choose to capture it.
            </p>
          </div>
        </ScrollReveal>
        <div className="features-grid">
          {siteConfig.features.map((feature, index) => {
            const Icon = iconMap[feature.icon]
            return (
              <ScrollReveal key={feature.title} delay={(index % 3) * 0.06}>
                <article className="feature-card">
                  <div className="feature-topline">
                    <Icon size={22} strokeWidth={1.4} aria-hidden="true" />
                    <span aria-hidden="true">0{index + 1}</span>
                  </div>
                  <h3>{feature.title}</h3>
                  <p>{feature.description}</p>
                </article>
              </ScrollReveal>
            )
          })}
        </div>
      </div>
    </section>
  )
}
