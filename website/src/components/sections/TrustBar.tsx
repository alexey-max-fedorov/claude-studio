import { siteConfig } from "@/data/site"

export function TrustBar() {
  return (
    <div className="trust-bar" aria-label="Metatron at a glance">
      <dl className="page-width trust-grid">
        {siteConfig.metrics.map((metric) => (
          <div key={metric.value}>
            <dt>{metric.value}</dt>
            <dd>{metric.label}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
