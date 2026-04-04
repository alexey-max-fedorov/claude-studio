"use client"

import { useEffect, useRef, useState, useCallback } from "react"

function MatrixRain() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener("resize", resize)

    const fontSize = 14
    let cols = Math.floor(canvas.width / fontSize)
    let drops: number[] = Array(cols).fill(1)

    const chars =
      "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEF"

    const draw = () => {
      const newCols = Math.floor(canvas.width / fontSize)
      if (newCols !== cols) {
        cols = newCols
        drops = Array(cols).fill(1)
      }

      ctx.fillStyle = "rgba(0, 0, 0, 0.05)"
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      ctx.font = `${fontSize}px monospace`

      for (let i = 0; i < drops.length; i++) {
        const char = chars[Math.floor(Math.random() * chars.length)]
        const bright = Math.random() > 0.95
        ctx.fillStyle = bright ? "#e8d5a3" : drops[i] < 3 ? "#c9a84c" : "#7a6530"
        ctx.fillText(char, i * fontSize, drops[i] * fontSize)

        if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
          drops[i] = 0
        }
        drops[i]++
      }
    }

    const interval = setInterval(draw, 33)
    return () => {
      clearInterval(interval)
      window.removeEventListener("resize", resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 opacity-20"
      style={{ zIndex: 0 }}
    />
  )
}

function StatusDot({ connected }: { connected: boolean }) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full mr-2 ${
        connected ? "bg-amber-400" : "bg-red-500"
      }`}
      style={{
        boxShadow: connected
          ? "0 0 6px 2px rgba(201, 168, 76, 0.8)"
          : "0 0 6px 2px rgba(239, 68, 68, 0.8)",
      }}
    />
  )
}

export default function Home() {
  const [wsConnected, setWsConnected] = useState(false)
  const [extDetected, setExtDetected] = useState(false)
  const [tick, setTick] = useState(0)
  const [serverUrl, setServerUrl] = useState("ws://localhost:7281")
  const [urlInput, setUrlInput] = useState("ws://localhost:7281")
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Connect to bridge server — reconnects on URL change
  const connect = useCallback(() => {
    // Clean up previous connection
    if (reconnectRef.current) clearTimeout(reconnectRef.current)
    if (wsRef.current) {
      wsRef.current.onclose = null
      wsRef.current.onerror = null
      wsRef.current.close()
    }
    setWsConnected(false)

    let cancelled = false

    const tryConnect = () => {
      if (cancelled) return
      try {
        const ws = new WebSocket(serverUrl)
        wsRef.current = ws
        ws.onopen = () => setWsConnected(true)
        ws.onclose = () => {
          setWsConnected(false)
          if (!cancelled) reconnectRef.current = setTimeout(tryConnect, 3000)
        }
        ws.onerror = () => ws.close()
      } catch {
        if (!cancelled) reconnectRef.current = setTimeout(tryConnect, 3000)
      }
    }
    tryConnect()

    return () => {
      cancelled = true
      if (reconnectRef.current) clearTimeout(reconnectRef.current)
      wsRef.current?.close()
    }
  }, [serverUrl])

  useEffect(() => {
    const cleanup = connect()
    return cleanup
  }, [connect])

  // Handle URL edit submission
  const handleUrlSubmit = () => {
    const trimmed = urlInput.trim()
    if (trimmed && trimmed !== serverUrl) {
      setServerUrl(trimmed)
    }
  }

  // Probe for extension via custom DOM attribute injected by content script
  useEffect(() => {
    const check = () => {
      setExtDetected(
        document.documentElement.hasAttribute("data-claude-studio-ext")
      )
    }
    check()
    const id = setInterval(check, 1000)
    return () => clearInterval(id)
  }, [])

  // Blinking cursor tick
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 500)
    return () => clearInterval(id)
  }, [])

  const cursor = tick % 2 === 0 ? "█" : " "

  return (
    <main className="relative min-h-screen flex flex-col items-center justify-center bg-black font-mono overflow-hidden">
      <MatrixRain />

      <div
        className="relative z-10 max-w-2xl w-full mx-4 border bg-black/80 p-8"
        style={{
          borderColor: "#7a6530",
          boxShadow: "0 0 40px rgba(201, 168, 76, 0.15)",
        }}
      >
        {/* Header */}
        <div className="mb-6">
          <p className="text-xs mb-1" style={{ color: "#7a6530" }}>
            CLAUDE STUDIO // VISUAL EDITOR v1.0.0
          </p>
          <h1 className="text-3xl font-bold tracking-widest" style={{ color: "#e8d5a3" }}>
            CLAUDE
            <span style={{ color: "#c9a84c" }}> CANVAS</span>
          </h1>
          <p className="text-sm mt-1" style={{ color: "#7a6530" }}>
            AI-powered visual editing for Next.js
          </p>
        </div>

        {/* Status panel */}
        <div className="bg-black p-4 mb-6" style={{ border: "1px solid #3d3218" }}>
          <p className="text-xs mb-3 tracking-widest" style={{ color: "#7a6530" }}>
            SYSTEM STATUS
          </p>

          <div className="space-y-2 text-sm">
            <div className="flex items-center">
              <StatusDot connected={wsConnected} />
              <span style={{ color: "#c9a84c" }}>Bridge server</span>
              <span className="ml-auto text-xs" style={{ color: "#5a4a28" }}>
                {serverUrl}
              </span>
              <span
                className={`ml-3 text-xs font-bold ${wsConnected ? "" : "text-red-500"}`}
                style={wsConnected ? { color: "#c9a84c" } : undefined}
              >
                {wsConnected ? "ONLINE" : "OFFLINE"}
              </span>
            </div>

            <div className="flex items-center">
              <StatusDot connected={extDetected} />
              <span style={{ color: "#c9a84c" }}>Browser extension</span>
              <span
                className={`ml-auto text-xs font-bold ${extDetected ? "" : "text-yellow-600"}`}
                style={extDetected ? { color: "#c9a84c" } : undefined}
              >
                {extDetected ? "DETECTED" : "NOT FOUND"}
              </span>
            </div>
          </div>

          {/* Editable server URL */}
          <div className="mt-3 pt-3" style={{ borderTop: "1px solid #3d3218" }}>
            <label className="block text-xs mb-1" style={{ color: "#5a4a28" }}>
              Server URL
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleUrlSubmit()}
                className="flex-1 bg-black text-xs px-2 py-1 outline-none"
                style={{
                  border: "1px solid #3d3218",
                  color: "#c9a84c",
                  fontFamily: "inherit",
                }}
              />
              <button
                onClick={handleUrlSubmit}
                className="text-xs px-3 py-1 cursor-pointer"
                style={{
                  border: "1px solid #7a6530",
                  color: "#c9a84c",
                  background: "transparent",
                }}
              >
                Connect
              </button>
            </div>
          </div>
        </div>

        {/* Instructions */}
        <div className="bg-black p-4 mb-6 text-xs space-y-1" style={{ border: "1px solid #3d3218", color: "#7a6530" }}>
          <p className="font-bold mb-2 tracking-widest" style={{ color: "#c9a84c" }}>
            QUICK START
          </p>
          {!wsConnected && (
            <p>
              <span style={{ color: "#c9a84c" }}>$</span> pnpm dlx claude-studio serve
              <span style={{ color: "#5a4a28" }}> # or: npx claude-studio serve</span>
            </p>
          )}
          {!extDetected && (
            <p>
              Install the{" "}
              <a
                href="https://github.com/alexey-max-fedorov/claude-studio"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
                style={{ color: "#c9a84c" }}
              >
                Claude Studio extension
              </a>
            </p>
          )}
          {wsConnected && extDetected && (
            <p style={{ color: "#c9a84c" }}>
              All systems nominal. Start editing!
            </p>
          )}
          <p className="mt-2">
            Hold <kbd className="px-1" style={{ border: "1px solid #7a6530" }}>Shift</kbd> and
            hover over any element to select it for editing.
          </p>
        </div>

        {/* Terminal prompt */}
        <div className="text-xs" style={{ color: "#5a4a28" }}>
          <span style={{ color: "#c9a84c" }}>claude-studio</span>
          <span style={{ color: "#5a4a28" }}>@</span>
          <span style={{ color: "#c9a84c" }}>localhost</span>
          <span style={{ color: "#5a4a28" }}>:~$ </span>
          <span style={{ color: "#e8d5a3" }}>ready{cursor}</span>
        </div>
      </div>
    </main>
  )
}
