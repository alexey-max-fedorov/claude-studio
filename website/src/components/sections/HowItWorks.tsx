import { ArrowUpRight, Download } from "lucide-react"
import { ScrollReveal } from "@/components/ui/ScrollReveal"
import { siteConfig } from "@/data/site"

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="section installation-section"
      aria-labelledby="how-it-works-heading"
    >
      <div className="page-width installation-grid">
        <div className="installation-heading">
          <p className="eyebrow">02 / Setup</p>
          <h2 id="how-it-works-heading">Installation</h2>
          <p className="section-intro">
            Two parts: a local daemon for your project and an unpacked browser extension.
            Install the matching v3 releases.
          </p>
          <a
            href={siteConfig.extensionZip}
            className="button button-primary"
          >
            <Download size={16} aria-hidden="true" /> Download extension ZIP
          </a>
          <a
            href={siteConfig.release}
            target="_blank"
            rel="noopener noreferrer"
            className="text-link"
          >
            Release v3.0.0 <ArrowUpRight size={14} aria-hidden="true" />
          </a>
          <p className="installation-note">
            Manual installation via Developer mode. Not a Chrome Web Store install.
          </p>
        </div>
        <ol className="installation-steps">
          {siteConfig.howItWorks.map((step) => (
            <li key={step.step}>
              <ScrollReveal>
                <div className="installation-step">
                  <span className="step-number" aria-hidden="true">0{step.step}</span>
                  <div className="step-copy">
                    <h3>{step.title}</h3>
                    <p>{step.description}</p>
                    {step.code && <pre className="install-command"><code>{step.code}</code></pre>}
                    {step.step === 1 && (
                      <a
                        href={siteConfig.docs}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-link"
                      >
                        Authentication & requirements <ArrowUpRight size={14} aria-hidden="true" />
                      </a>
                    )}
                    {step.step === 3 && (
                      <a href={siteConfig.extensionZip} className="text-link">
                        Download the ZIP <Download size={14} aria-hidden="true" />
                      </a>
                    )}
                  </div>
                </div>
              </ScrollReveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
