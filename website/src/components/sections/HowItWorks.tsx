import { ScrollReveal } from "@/components/ui/ScrollReveal"
import { siteConfig } from "@/data/site"

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="py-24 lg:py-32 px-4 sm:px-6 lg:px-8 bg-[#0a0a0a]"
      aria-labelledby="how-it-works-heading"
    >
      <div className="max-w-7xl mx-auto">
        <ScrollReveal>
          <div className="text-center mb-16">
            <p className="text-[#c9a84c] text-xs font-semibold tracking-[0.25em] uppercase mb-3">
              How It Works
            </p>
            <h2
              id="how-it-works-heading"
              className="text-3xl md:text-4xl lg:text-5xl font-semibold text-white leading-tight"
              style={{ fontFamily: "var(--font-playfair-display), Georgia, serif" }}
            >
              Four steps to visual editing
            </h2>
            <p className="mt-4 text-[#a0a0a0] text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
              From setup to shipping changes in under a minute.
            </p>
          </div>
        </ScrollReveal>

        <div className="max-w-3xl mx-auto">
          {siteConfig.howItWorks.map((step, i) => (
            <ScrollReveal key={step.step} delay={i * 0.12}>
              <div className="flex gap-6 sm:gap-8 mb-12 last:mb-0">
                {/* Step number + line */}
                <div className="flex flex-col items-center">
                  <span
                    className="text-4xl font-bold text-[#c9a84c] opacity-40 leading-none"
                    style={{ fontFamily: "var(--font-playfair-display), Georgia, serif" }}
                  >
                    {step.step}
                  </span>
                  {i < siteConfig.howItWorks.length - 1 && (
                    <div className="flex-1 w-px bg-[#1a1a1a] mt-3" />
                  )}
                </div>

                {/* Content */}
                <div className="pb-2 flex-1">
                  <h3
                    className="text-xl font-semibold text-white mb-2"
                    style={{ fontFamily: "var(--font-playfair-display), Georgia, serif" }}
                  >
                    {step.title}
                  </h3>
                  <p className="text-[#a0a0a0] text-sm leading-relaxed mb-3">
                    {step.description}
                  </p>
                  {step.code && (
                    <div className="bg-[#000] border border-[#1a1a1a] rounded-lg px-4 py-3 inline-block">
                      <code className="text-[#c9a84c] text-sm font-mono">
                        $ {step.code}
                      </code>
                    </div>
                  )}
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  )
}
