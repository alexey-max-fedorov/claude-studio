import React, { useState } from "react"
import { copyText } from "../lib/clipboard"
import { Icon } from "./Icons"

export function CopyButton({ text, label, className }: { text: string | (() => string); label?: string; className?: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      className={`copy-btn ${className ?? ""}`}
      title={done ? "Copied" : "Copy"}
      onClick={async (e) => {
        e.stopPropagation()
        const ok = await copyText(typeof text === "function" ? text() : text)
        if (ok) {
          setDone(true)
          setTimeout(() => setDone(false), 1200)
        }
      }}>
      <Icon name={done ? "check" : "copy"} size={12} />
      {label ? <span>{done ? "Copied" : label}</span> : null}
    </button>
  )
}
