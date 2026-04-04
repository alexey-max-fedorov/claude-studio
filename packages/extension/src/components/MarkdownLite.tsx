import React from "react"

const codeBlockStyle: React.CSSProperties = {
  background: "#0a0a0a", border: "1px solid #1a1a1a", borderRadius: 6,
  padding: "10px 12px", overflowX: "auto" as const, whiteSpace: "pre" as const,
  fontFamily: "ui-monospace, 'Cascadia Code', monospace", fontSize: 12,
  lineHeight: 1.5, margin: "6px 0", color: "#d4d4d4",
}

const inlineCodeStyle: React.CSSProperties = {
  background: "#1a1a1a", color: "#c9a84c", fontFamily: "ui-monospace, monospace",
  padding: "1px 5px", borderRadius: 3, fontSize: "0.9em",
}

function renderInline(text: string, keyBase: number): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  const regex = /(`[^`]+`)|(\*\*[^*]+\*\*)/g
  let last = 0
  let match: RegExpExecArray | null
  let i = 0

  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push(<span key={`${keyBase}-t${i++}`}>{text.slice(last, match.index)}</span>)
    }
    if (match[1]) {
      nodes.push(<code key={`${keyBase}-c${i++}`} style={inlineCodeStyle}>{match[1].slice(1, -1)}</code>)
    } else if (match[2]) {
      nodes.push(<strong key={`${keyBase}-b${i++}`} style={{ color: "#fff", fontWeight: 600 }}>{match[2].slice(2, -2)}</strong>)
    }
    last = match.index + match[0].length
  }
  if (last < text.length) {
    nodes.push(<span key={`${keyBase}-t${i}`}>{text.slice(last)}</span>)
  }
  return nodes.length ? nodes : [<span key={keyBase}>{text}</span>]
}

export function MarkdownLite({ text }: { text: string }) {
  const nodes: React.ReactNode[] = []
  const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g
  let last = 0
  let match: RegExpExecArray | null
  let i = 0

  while ((match = codeBlockRegex.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push(...renderInline(text.slice(last, match.index), i++))
    }
    nodes.push(
      <pre key={`cb-${i++}`} style={codeBlockStyle}>
        <code>{match[2]}</code>
      </pre>
    )
    last = match.index + match[0].length
  }
  if (last < text.length) {
    nodes.push(...renderInline(text.slice(last), i))
  }
  return <>{nodes}</>
}
