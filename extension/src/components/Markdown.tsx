import React, { useMemo } from "react"
import { parseBlocks, parseInline, type Block, type Inline } from "../lib/markdown"
import { CopyButton } from "./CopyButton"

/*
 * Renders the markdown AST as React elements. Never uses dangerouslySetInnerHTML:
 * any HTML in the text shows up as literal characters.
 */

function renderInline(nodes: Inline[], key = "i"): React.ReactNode[] {
  return nodes.map((n, i) => {
    const k = `${key}.${i}`
    switch (n.t) {
      case "text":
        return <React.Fragment key={k}>{n.v}</React.Fragment>
      case "br":
        return <br key={k} />
      case "code":
        return (
          <code key={k} className={n.path ? "md-ic md-path" : "md-ic"} title={n.path ? "Path" : undefined}>
            {n.v}
          </code>
        )
      case "strong":
        return <strong key={k}>{renderInline(n.c, k)}</strong>
      case "em":
        return <em key={k}>{renderInline(n.c, k)}</em>
      case "del":
        return <del key={k}>{renderInline(n.c, k)}</del>
      case "link":
        return (
          <a key={k} href={n.href} target="_blank" rel="noopener noreferrer" title={n.href}>
            {renderInline(n.c, k)}
          </a>
        )
    }
  })
}

export function InlineMd({ text }: { text: string }) {
  return <>{renderInline(parseInline(text))}</>
}

function CodeBlock({ lang, text }: { lang: string; text: string }) {
  return (
    <div className="md-code">
      <div className="md-code-bar">
        <span className="md-code-lang">{lang || "text"}</span>
        <CopyButton text={text} label="Copy" />
      </div>
      <pre>
        <code>{text}</code>
      </pre>
    </div>
  )
}

function renderBlocks(blocks: Block[], key = "b"): React.ReactNode[] {
  return blocks.map((b, i) => {
    const k = `${key}.${i}`
    switch (b.t) {
      case "p":
        return <p key={k}>{renderInline(parseInline(b.text), k)}</p>
      case "h": {
        const Tag = (`h${Math.min(6, Math.max(1, b.level))}` as unknown) as keyof JSX.IntrinsicElements
        return <Tag key={k}>{renderInline(parseInline(b.text), k)}</Tag>
      }
      case "code":
        return <CodeBlock key={k} lang={b.lang} text={b.text} />
      case "hr":
        return <hr key={k} />
      case "quote":
        return <blockquote key={k}>{renderBlocks(b.children, k)}</blockquote>
      case "list": {
        const items = b.items.map((it, j) => (
          <li key={j} className={it.task === null ? undefined : "md-task"}>
            {it.task !== null ? <input type="checkbox" checked={it.task} disabled readOnly /> : null}
            {renderBlocks(it.children, `${k}.${j}`)}
          </li>
        ))
        return b.ordered ? (
          <ol key={k} start={b.start !== 1 ? b.start : undefined}>
            {items}
          </ol>
        ) : (
          <ul key={k}>{items}</ul>
        )
      }
      case "table":
        return (
          <div key={k} className="md-table">
            <table>
              <thead>
                <tr>
                  {b.head.map((h, j) => (
                    <th key={j} style={b.align[j] ? { textAlign: b.align[j]! } : undefined}>
                      {renderInline(parseInline(h), `${k}.h${j}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.rows.map((r, ri) => (
                  <tr key={ri}>
                    {b.head.map((_, ci) => (
                      <td key={ci} style={b.align[ci] ? { textAlign: b.align[ci]! } : undefined}>
                        {renderInline(parseInline(r[ci] ?? ""), `${k}.${ri}.${ci}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
    }
  })
}

export function Markdown({ text, caret }: { text: string; caret?: boolean }) {
  const blocks = useMemo(() => parseBlocks(text), [text])
  return (
    <div className={caret ? "md md-streaming" : "md"}>
      {renderBlocks(blocks)}
      {caret ? <span className="caret" aria-hidden /> : null}
    </div>
  )
}
