import React from "react"

/* Hand-drawn 16px stroke icons. currentColor, no external assets. */

const P: Record<string, React.ReactNode> = {
  plus: <path d="M8 3v10M3 8h10" />,
  list: <path d="M5.5 4h8M5.5 8h8M5.5 12h8M2.5 4h.01M2.5 8h.01M2.5 12h.01" />,
  gear: (
    <>
      <circle cx="8" cy="8" r="2.2" />
      <path d="M8 1.8v1.6M8 12.6v1.6M14.2 8h-1.6M3.4 8H1.8M12.4 3.6l-1.1 1.1M4.7 11.3l-1.1 1.1M12.4 12.4l-1.1-1.1M4.7 4.7 3.6 3.6" />
    </>
  ),
  x: <path d="M4 4l8 8M12 4l-8 8" />,
  chevron: <path d="M6 4l4 4-4 4" />,
  chevronDown: <path d="M4 6l4 4 4-4" />,
  check: <path d="M3.5 8.5l3 3 6-7" />,
  arrowUp: <path d="M8 13V3.5M4 7.5l4-4 4 4" />,
  arrowDown: <path d="M8 3v9.5M4 8.5l4 4 4-4" />,
  stop: <rect x="4" y="4" width="8" height="8" rx="1.2" fill="currentColor" stroke="none" />,
  link: (
    <>
      <path d="M6.8 9.2a2.6 2.6 0 0 0 3.7 0l2.2-2.2a2.6 2.6 0 0 0-3.7-3.7l-.9.9" />
      <path d="M9.2 6.8a2.6 2.6 0 0 0-3.7 0L3.3 9a2.6 2.6 0 0 0 3.7 3.7l.9-.9" />
    </>
  ),
  selection: (
    <>
      <path d="M2.5 4.5h7M2.5 8h11M2.5 11.5h5" />
      <path d="M11.5 10v4M10.5 10h2M10.5 14h2" />
    </>
  ),
  doc: (
    <>
      <path d="M4 1.8h5.2L12.5 5v9.2H4z" />
      <path d="M9 1.8V5h3.5M6 8h4.5M6 10.5h4.5" />
    </>
  ),
  camera: (
    <>
      <path d="M2 5.2h2.6l1.2-1.8h4.4l1.2 1.8H14v7.6H2z" />
      <circle cx="8" cy="8.8" r="2.2" />
    </>
  ),
  target: (
    <>
      <circle cx="8" cy="8" r="4.6" />
      <path d="M8 1.5v3M8 11.5v3M1.5 8h3M11.5 8h3" />
    </>
  ),
  terminal: (
    <>
      <path d="M2.5 3.5h11v9h-11z" />
      <path d="M5 6.5l2 1.5-2 1.5M8.5 10h2.5" />
    </>
  ),
  file: (
    <>
      <path d="M4 1.8h5.2L12.5 5v9.2H4z" />
      <path d="M9 1.8V5h3.5" />
    </>
  ),
  edit: <path d="M10.6 2.6l2.8 2.8-7.6 7.6H3v-2.8zM9 4.2l2.8 2.8" />,
  search: (
    <>
      <circle cx="7" cy="7" r="4" />
      <path d="M10 10l3.5 3.5" />
    </>
  ),
  globe: (
    <>
      <circle cx="8" cy="8" r="5.8" />
      <path d="M2.2 8h11.6M8 2.2c1.7 1.6 2.5 3.6 2.5 5.8s-.8 4.2-2.5 5.8C6.3 12.2 5.5 10.2 5.5 8S6.3 3.8 8 2.2z" />
    </>
  ),
  agent: (
    <>
      <rect x="3" y="5" width="10" height="8" rx="2" />
      <path d="M8 2.5V5M6 9h.01M10 9h.01" />
    </>
  ),
  plug: <path d="M6 2v3M10 2v3M4.5 5h7v2.5a3.5 3.5 0 0 1-7 0zM8 11v3" />,
  question: (
    <>
      <circle cx="8" cy="8" r="5.8" />
      <path d="M6.3 6.3a1.8 1.8 0 1 1 2.4 1.7c-.5.2-.7.6-.7 1.1v.4M8 11.5h.01" />
    </>
  ),
  tool: <path d="M9.8 2.4a3.2 3.2 0 0 0-3.9 4.1L2.4 10a1.3 1.3 0 0 0 1.8 1.8l3.5-3.5a3.2 3.2 0 0 0 4.1-3.9l-2 2-1.6-.4-.4-1.6z" />,
  copy: (
    <>
      <rect x="5.2" y="5.2" width="8" height="8" rx="1.2" />
      <path d="M10.8 5V3.6a.9.9 0 0 0-.9-.9H3.6a.9.9 0 0 0-.9.9v6.3a.9.9 0 0 0 .9.9H5" />
    </>
  ),
  pencil: <path d="M10.6 2.6l2.8 2.8-7.6 7.6H3v-2.8z" />,
  refresh: <path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5v2.8h-2.8" />,
  brain: (
    <>
      <path d="M8 3.2v9.6M5.6 3a2.2 2.2 0 0 0-2.1 2.8A2.3 2.3 0 0 0 3 9.6a2.3 2.3 0 0 0 2.6 3.2c.9 0 1.7-.5 2.4-1.2M10.4 3a2.2 2.2 0 0 1 2.1 2.8 2.3 2.3 0 0 1 .5 3.8 2.3 2.3 0 0 1-2.6 3.2c-.9 0-1.7-.5-2.4-1.2" />
    </>
  ),
  alert: <path d="M8 2.2l6 10.6H2zM8 6.5v2.8M8 11.1h.01" />,
  lock: (
    <>
      <rect x="3.2" y="7" width="9.6" height="6.6" rx="1.2" />
      <path d="M5.4 7V5.2a2.6 2.6 0 0 1 5.2 0V7" />
    </>
  ),
}

export type IconName = keyof typeof P

export function Icon({ name, size = 14, className, title }: { name: IconName | string; size?: number; className?: string; title?: string }) {
  return (
    <svg
      className={className ? `ic ${className}` : "ic"}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.45}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}>
      {title ? <title>{title}</title> : null}
      {P[name] ?? P.tool}
    </svg>
  )
}
