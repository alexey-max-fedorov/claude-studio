import { ArrowRight } from "lucide-react"
import { ScrollReveal } from "@/components/ui/ScrollReveal"
import { siteConfig } from "@/data/site"

export function CTA() {
  return (
    <section
      className="py-24 lg:py-32 px-4 sm:px-6 lg:px-8 bg-[#0a0a0a] border-t border-[#1a1a1a]"
      aria-label="Call to action"
    >
      <div className="max-w-4xl mx-auto text-center">
        <ScrollReveal>
          <p className="text-[#c9a84c] text-xs font-semibold tracking-[0.3em] uppercase mb-6">
            Get Started
          </p>
          <h2
            className="text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight mb-8"
            style={{ fontFamily: "var(--font-playfair-display), Georgia, serif" }}
          >
            Start building with Claude Studio
          </h2>

          {/* Install command */}
          <div className="mb-8">
            <code className="inline-block bg-[#111] border border-[#1a1a1a] rounded-lg px-6 py-3 text-[#c9a84c] text-sm sm:text-base font-mono">
              $ pnpm dlx claude-studio setup
            </code>
          </div>

          <a
            href={siteConfig.github}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-[#c9a84c] text-black font-semibold px-10 py-4 rounded-md text-base hover:bg-[#d4b65e] hover:shadow-[0_0_32px_rgba(201,168,76,0.45)] transition-all duration-200 active:scale-[0.98] group"
          >
            View on GitHub
            <ArrowRight
              size={18}
              className="group-hover:translate-x-1 transition-transform duration-200"
            />
          </a>
          <p className="text-[#555] text-xs mt-5 tracking-wide">
            Open source. No analytics. No telemetry.
          </p>
        </ScrollReveal>
      </div>
    </section>
  )
}
