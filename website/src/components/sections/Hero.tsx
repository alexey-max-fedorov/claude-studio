import Image from "next/image"
import { ArrowDown, ArrowUpRight } from "lucide-react"
import { siteConfig } from "@/data/site"

export function Hero() {
  return (
    <section className="hero" aria-labelledby="hero-heading">
      <div className="page-width hero-grid">
        <div className="hero-copy">
          <p className="hero-brand">{siteConfig.name}</p>
          <h1 id="hero-heading">{siteConfig.tagline}</h1>
          <div className="hero-actions">
            <a href="#how-it-works" className="button button-primary">
              Install Metatron <ArrowDown size={16} aria-hidden="true" />
            </a>
            <a
              href={siteConfig.github}
              target="_blank"
              rel="noopener noreferrer"
              className="button button-outline"
            >
              View on GitHub <ArrowUpRight size={16} aria-hidden="true" />
            </a>
          </div>
          <p className="hero-note">Browser extension + local daemon</p>
        </div>

        <div className="brand-study" aria-hidden="true">
          <div className="study-topline"><span>Metatron</span><span>01 / 03</span></div>
          <div className="study-drawing">
            <div className="study-orbit study-orbit-outer" />
            <div className="study-orbit study-orbit-inner" />
            <div className="study-axis study-axis-horizontal" />
            <div className="study-axis study-axis-vertical" />
            <Image
              src="/icon.png"
              alt=""
              width={280}
              height={280}
              priority
              className="study-logo"
            />
          </div>
          <div className="study-bottomline"><span>Browser</span><span className="study-connector" /><span>Local project</span></div>
        </div>
      </div>
      <div className="page-width hero-bottom">
        <span>Chrome & Brave</span>
        <a href="#features">Explore the features <ArrowDown size={14} aria-hidden="true" /></a>
        <span>Release v3.0.0</span>
      </div>
    </section>
  )
}
