import { ScrollReveal } from "@/components/ui/ScrollReveal"

export function Demo() {
  return (
    <section
      className="py-24 lg:py-32 px-4 sm:px-6 lg:px-8 bg-[#000]"
      aria-label="Demo"
    >
      <div className="max-w-7xl mx-auto">
        <ScrollReveal>
          <div className="text-center mb-12">
            <p className="text-[#c9a84c] text-xs font-semibold tracking-[0.25em] uppercase mb-3">
              See It In Action
            </p>
            <h2
              className="text-3xl md:text-4xl lg:text-5xl font-semibold text-white leading-tight"
              style={{ fontFamily: "var(--font-playfair-display), Georgia, serif" }}
            >
              From prompt to production
            </h2>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={0.2}>
          <div className="max-w-3xl mx-auto">
            {/* Terminal window */}
            <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl overflow-hidden shadow-[0_0_60px_rgba(0,0,0,0.5)]">
              {/* Title bar */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-[#1a1a1a]">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
                  <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
                  <div className="w-3 h-3 rounded-full bg-[#28c840]" />
                </div>
                <span className="text-[#666] text-xs font-mono ml-2">claude-studio</span>
              </div>

              {/* Terminal content */}
              <div className="px-5 py-5 font-mono text-sm leading-7 space-y-1">
                <p>
                  <span className="text-[#666]">$</span>{" "}
                  <span className="text-[#c9a84c]">pnpm dlx claude-studio serve</span>
                </p>
                <p className="text-[#a0a0a0]">
                  Bridge server running on ws://localhost:7281
                </p>
                <p className="text-[#333]">&nbsp;</p>
                <p className="text-[#a0a0a0]">
                  <span className="text-[#666]">[ext]</span> Element selected:{" "}
                  <span className="text-white">button.cta-primary</span>
                </p>
                <p className="text-[#a0a0a0]">
                  <span className="text-[#666]">[you]</span>{" "}
                  <span className="text-white">&quot;Make this button rounded with a gold border&quot;</span>
                </p>
                <p className="text-[#333]">&nbsp;</p>
                <p className="text-[#666]">
                  Reading app/components/Button.tsx...
                </p>
                <p className="text-[#c9a84c]">
                  Editing app/components/Button.tsx:12-15
                </p>
                <p className="text-green-500">
                  Done. 1 file changed.
                </p>
                <p className="text-[#a0a0a0]">
                  <span className="text-[#666]">[hmr]</span> Page reloaded
                </p>
              </div>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  )
}
