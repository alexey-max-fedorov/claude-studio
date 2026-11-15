import { ArrowUpRight, Download } from "lucide-react"
import { siteConfig } from "@/data/site"

export function CTA() {
  return (
    <section className="download-section" aria-labelledby="download-heading">
      <div className="page-width download-grid">
        <div>
          <p className="eyebrow">Release v3.0.0</p>
          <h2 id="download-heading">Download Metatron</h2>
          <p>Browser extension for Chrome and Brave. Requires the local v3 daemon.</p>
        </div>
        <div className="download-actions">
          <a href={siteConfig.extensionZip} className="button button-light">
            <Download size={16} aria-hidden="true" /> Download extension ZIP
          </a>
          <a href="#how-it-works" className="text-link">
            Installation instructions <ArrowUpRight size={15} aria-hidden="true" />
          </a>
        </div>
      </div>
    </section>
  )
}
