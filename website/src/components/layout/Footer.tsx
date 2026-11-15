import Image from "next/image"
import { ArrowUpRight } from "lucide-react"
import { siteConfig } from "@/data/site"

export function Footer() {
  return (
    <footer className="site-footer" aria-label="Metatron footer">
      <div className="page-width">
        <div className="footer-grid">
          <div>
            <a href="/" aria-label="Metatron home" className="brand-link">
              <Image src="/icon.png" alt="" width={38} height={38} />
              <span>Metatron</span>
            </a>
            <p className="footer-description">{siteConfig.tagline}</p>
          </div>
          <nav aria-label="Footer navigation">
            <p className="eyebrow">Resources</p>
            <ul className="footer-links">
              {siteConfig.footerLinks.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    {...(link.href.startsWith("http")
                      ? { target: "_blank", rel: "noopener noreferrer" }
                      : {})}
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div>
            <p className="eyebrow">Source</p>
            <a
              href={siteConfig.github}
              target="_blank"
              rel="noopener noreferrer"
              className="text-link"
              aria-label="Metatron source on GitHub"
            >
              GitHub <ArrowUpRight size={14} aria-hidden="true" />
            </a>
            <p className="footer-package">npm / CLI: <code>claude-studio</code></p>
          </div>
        </div>
        <div className="footer-bottom">
          <p>&copy; {new Date().getFullYear()} Metatron</p>
          <p>Uses your Claude Code account or API provider.</p>
        </div>
      </div>
    </footer>
  )
}
