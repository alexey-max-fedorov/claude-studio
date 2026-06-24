import Image from "next/image"
import { ExternalLink } from "lucide-react"
import { siteConfig } from "@/data/site"

export function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="bg-[#0a0a0a] border-t border-[#1a1a1a]" aria-label="Site footer">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-8">
          {/* Brand */}
          <div className="md:col-span-1">
            <a href="/" aria-label="Claude Studio — Home" className="inline-flex items-center gap-3 group">
              <Image src="/icon.png" alt="" width={32} height={32} className="rounded-md" />
              <div className="flex flex-col leading-none">
                <span
                  className="text-white text-2xl font-bold tracking-tight group-hover:text-[#c9a84c] transition-colors duration-200"
                  style={{ fontFamily: "var(--font-playfair-display), Georgia, serif" }}
                >
                  CLAUDE
                </span>
                <span className="text-[#c9a84c] text-[9px] tracking-[0.35em] uppercase font-medium mt-0.5">
                  STUDIO
                </span>
              </div>
            </a>
            <p className="mt-4 text-[#666] text-sm leading-relaxed max-w-xs">
              {siteConfig.tagline}
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-white text-xs font-semibold tracking-[0.2em] uppercase mb-4">
              Navigate
            </h3>
            <ul className="space-y-2.5" role="list">
              {siteConfig.footerLinks.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    {...(link.href.startsWith("http")
                      ? { target: "_blank", rel: "noopener noreferrer" }
                      : {})}
                    className="text-[#a0a0a0] text-sm hover:text-white transition-colors duration-200"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Connect */}
          <div>
            <h3 className="text-white text-xs font-semibold tracking-[0.2em] uppercase mb-4">
              Connect
            </h3>
            <ul className="space-y-3" role="list">
              <li>
                <a
                  href={siteConfig.github}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-[#a0a0a0] text-sm hover:text-white transition-colors duration-200"
                  aria-label="Claude Studio on GitHub"
                >
                  <ExternalLink size={15} aria-hidden="true" />
                  GitHub
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 pt-6 border-t border-[#1a1a1a] flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-[#666] text-xs">
            &copy; {currentYear} Claude Studio. All rights reserved.
          </p>
          <p className="text-[#666] text-xs">
            Built with Claude Code.
          </p>
        </div>
      </div>
    </footer>
  )
}
