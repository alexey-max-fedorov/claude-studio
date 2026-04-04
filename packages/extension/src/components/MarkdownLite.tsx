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

function renderBlocks(text: string, startKey: number): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  const lines = text.split("\n")
  let i = startKey
  let listItems: { type: "ul" | "ol"; content: string; num?: string }[] = []

  const flushList = () => {
    if (listItems.length === 0) return
    const type = listItems[0].type
    nodes.push(
      <div key={`list-${i++}`} style={{ paddingLeft: 16, margin: "4px 0" }}>
        {listItems.map((item, idx) => (
          <div key={idx} style={{ lineHeight: 1.6 }}>
            <span style={{ color: "#c9a84c", marginRight: 6 }}>
              {type === "ul" ? "\u2022" : `${item.num}.`}
            </span>
            {renderInline(item.content, i++)}
          </div>
        ))}
      </div>
    )
    listItems = []
  }

  for (const line of lines) {
    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      flushList()
      nodes.push(<div key={`hr-${i++}`} style={{ borderBottom: "1px solid #1a1a1a", margin: "8px 0" }} />)
      continue
    }

    // Headers
    const headerMatch = line.match(/^(#{1,3})\s+(.+)/)
    if (headerMatch) {
      flushList()
      const level = headerMatch[1].length
      const sizes = [16, 14, 13]
      nodes.push(
        <div key={`h-${i++}`} style={{
          fontSize: sizes[level - 1], fontWeight: 600, color: "#fff",
          margin: "8px 0 4px 0",
        }}>
          {renderInline(headerMatch[2], i++)}
        </div>
      )
      continue
    }

    // Bullet list
    const bulletMatch = line.match(/^[-*]\s+(.+)/)
    if (bulletMatch) {
      if (listItems.length > 0 && listItems[0].type !== "ul") flushList()
      listItems.push({ type: "ul", content: bulletMatch[1] })
      continue
    }

    // Numbered list
    const numMatch = line.match(/^(\d+)\.\s+(.+)/)
    if (numMatch) {
      if (listItems.length > 0 && listItems[0].type !== "ol") flushList()
      listItems.push({ type: "ol", content: numMatch[2], num: numMatch[1] })
      continue
    }

    // Regular text / empty line
    flushList()
    if (line.trim() === "") {
      nodes.push(<div key={`br-${i++}`} style={{ height: 4 }} />)
    } else {
      nodes.push(<div key={`p-${i++}`} style={{ lineHeight: 1.6 }}>{renderInline(line, i++)}</div>)
    }
  }
  flushList()
  return nodes
}

export function MarkdownLite({ text }: { text: string }) {
  const nodes: React.ReactNode[] = []
  const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g
  let last = 0
  let match: RegExpExecArray | null
  let i = 0

  while ((match = codeBlockRegex.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push(...renderBlocks(text.slice(last, match.index), i++))
    }
    nodes.push(
      <pre key={`cb-${i++}`} style={codeBlockStyle}>
        <code>{match[2]}</code>
      </pre>
    )
    last = match.index + match[0].length
  }
  if (last < text.length) {
    nodes.push(...renderBlocks(text.slice(last), i))
  }
  return <>{nodes}</>
}
