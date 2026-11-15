import Image from "next/image"
import { Check, Code2, FileText, MousePointerClick } from "lucide-react"
import { ScrollReveal } from "@/components/ui/ScrollReveal"

export function Demo() {
  return (
    <section id="demo" className="section demo-section" aria-labelledby="demo-heading">
      <div className="page-width">
        <div className="section-heading">
          <p className="eyebrow">03 / Conversation</p>
          <h2 id="demo-heading">Panel preview</h2>
        </div>
        <ScrollReveal>
          <figure className="demo-figure" aria-label="Illustrative Metatron side-panel conversation">
            <div className="demo-window">
              <div className="demo-titlebar">
                <div className="demo-identity">
                  <Image src="/icon.png" alt="" width={30} height={30} />
                  <span>Metatron</span>
                </div>
                <span className="demo-status"><span /> Local daemon</span>
              </div>
              <div className="demo-body">
                <aside className="demo-context" aria-label="Example attached browser context">
                  <p className="demo-label">Project</p>
                  <p className="demo-project">~/projects/my-site</p>
                  <div className="demo-divider" />
                  <p className="demo-label">Attached context</p>
                  <div className="demo-attachment"><MousePointerClick size={16} aria-hidden="true" /><span>button.primary</span></div>
                  <p className="demo-context-note">Picked element<br />Selector, HTML & styles</p>
                </aside>
                <div className="demo-conversation">
                  <div className="demo-message demo-user">
                    <p className="demo-label">You</p>
                    <p>Give this button a midnight background and an ivory label. Keep the focus state accessible.</p>
                  </div>
                  <div className="demo-message">
                    <p className="demo-label">Metatron</p>
                    <p>I&apos;ll check the component and its existing styles before making the change.</p>
                  </div>
                  <div className="demo-tool"><FileText size={16} aria-hidden="true" /><span>Read</span><code>src/components/Button.tsx</code><Check size={14} aria-hidden="true" /></div>
                  <div className="demo-tool"><Code2 size={16} aria-hidden="true" /><span>Edit</span><code>src/components/Button.tsx</code><Check size={14} aria-hidden="true" /></div>
                  <div className="demo-message demo-result">
                    <p className="demo-label">Metatron</p>
                    <p>Updated the button colors and kept the visible keyboard focus ring.</p>
                  </div>
                </div>
              </div>
              <div className="demo-footer"><span>Claude Code session</span><span>Browser context attached by you</span></div>
            </div>
            <figcaption>
              Illustrative conversation, not a live session. Tool output and permission requests depend on your project and settings.
            </figcaption>
          </figure>
        </ScrollReveal>
      </div>
    </section>
  )
}
