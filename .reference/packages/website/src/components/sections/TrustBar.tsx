import { siteConfig } from "@/data/site"

export function TrustBar() {
  return (
    <div
      className="bg-[#0a0a0a] border-y border-[#1a1a1a] py-5 px-4 sm:px-6 lg:px-8"
      aria-label="Key highlights"
    >
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-0 md:divide-x md:divide-[#1a1a1a]">
          {siteConfig.metrics.map((m) => (
            <div key={m.label} className="flex flex-col items-center text-center md:px-8">
              <span
                className="text-xl font-bold text-[#c9a84c]"
                style={{ fontFamily: "var(--font-playfair-display), Georgia, serif" }}
              >
                {m.value}
              </span>
              <span className="text-[#666] text-xs tracking-wide mt-0.5">{m.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
