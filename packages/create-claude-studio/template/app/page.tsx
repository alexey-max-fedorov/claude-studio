"use client"

import { useEffect, useRef, useState } from "react"

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
    const cols = Math.floor(canvas.width / fontSize)
    const drops: number[] = Array(cols).fill(1)

    const chars =
      "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEF"

    const draw = () => {
      ctx.fillStyle = "rgba(0, 0, 0, 0.05)"
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      ctx.fillStyle = "#0f0"
      ctx.font = `${fontSize}px monospace`

      for (let i = 0; i < drops.length; i++) {
        const char = chars[Math.floor(Math.random() * chars.length)]
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
        connected ? "bg-green-400" : "bg-red-500"
      }`}
      style={{
        boxShadow: connected
          ? "0 0 6px 2px rgba(74, 222, 128, 0.8)"
          : "0 0 6px 2px rgba(239, 68, 68, 0.8)",
      }}
    />
  )
}

export default function Home() {
  const [wsConnected, setWsConnected] = useState(false)
  const [extDetected, setExtDetected] = useState(false)
  const [tick, setTick] = useState(0)

  // Probe the bridge server WebSocket
  useEffect(() => {
    let ws: WebSocket | null = null
    let cancelled = false

    const connect = () => {
      if (cancelled) return
      try {
        ws = new WebSocket("ws://localhost:3333")
        ws.onopen = () => setWsConnected(true)
        ws.onclose = () => {
          setWsConnected(false)
          setTimeout(connect, 3000)
        }
        ws.onerror = () => {
          ws?.close()
        }
      } catch {
        setTimeout(connect, 3000)
      }
    }
    connect()

    return () => {
      cancelled = true
      ws?.close()
    }
  }, [])

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
    <main className="relative min-h-screen flex flex-col items-center justify-center bg-black text-green-400 font-mono overflow-hidden">
      <MatrixRain />

      <div
        className="relative z-10 max-w-2xl w-full mx-4 border border-green-700 bg-black/80 p-8"
        style={{ boxShadow: "0 0 40px rgba(0, 255, 0, 0.15)" }}
      >
        {/* Header */}
        <div className="mb-6">
          <p className="text-green-600 text-xs mb-1">
            CLAUDE STUDIO // VISUAL EDITOR v1.0.0
          </p>
          <h1 className="text-3xl font-bold text-green-300 tracking-widest">
            CLAUDE
            <span className="text-green-500"> STUDIO</span>
          </h1>
          <p className="text-green-600 text-sm mt-1">
            AI-powered visual editing for Next.js
          </p>
        </div>

        {/* Status panel */}
        <div className="border border-green-900 bg-black p-4 mb-6">
          <p className="text-green-600 text-xs mb-3 tracking-widest">
            SYSTEM STATUS
          </p>

          <div className="space-y-2 text-sm">
            <div className="flex items-center">
              <StatusDot connected={wsConnected} />
              <span className="text-green-400">Bridge server</span>
              <span className="ml-auto text-xs text-green-700">
                ws://localhost:3333
              </span>
              <span
                className={`ml-3 text-xs font-bold ${wsConnected ? "text-green-400" : "text-red-500"}`}
              >
                {wsConnected ? "ONLINE" : "OFFLINE"}
              </span>
            </div>

            <div className="flex items-center">
              <StatusDot connected={extDetected} />
              <span className="text-green-400">Browser extension</span>
              <span
                className={`ml-auto text-xs font-bold ${extDetected ? "text-green-400" : "text-yellow-500"}`}
              >
                {extDetected ? "DETECTED" : "NOT FOUND"}
              </span>
            </div>
          </div>
        </div>

        {/* Instructions */}
        <div className="border border-green-900 bg-black p-4 mb-6 text-xs text-green-600 space-y-1">
          <p className="text-green-500 font-bold mb-2 tracking-widest">
            QUICK START
          </p>
          {!wsConnected && (
            <p>
              <span className="text-green-400">$</span> npx claude-studio serve
            </p>
          )}
          {!extDetected && (
            <p>
              Install the{" "}
              <a
                href="https://chromewebstore.google.com/detail/claude-studio/YOUR_EXTENSION_ID"
                target="_blank"
                rel="noopener noreferrer"
                className="text-green-400 underline hover:text-green-200"
              >
                Claude Studio extension
              </a>
            </p>
          )}
          {wsConnected && extDetected && (
            <p className="text-green-400">
              All systems nominal. Start editing!
            </p>
          )}
          <p className="mt-2">
            Hold <kbd className="border border-green-700 px-1">Shift</kbd> and
            hover over any element to select it for editing.
          </p>
        </div>

        {/* Terminal prompt */}
        <div className="text-xs text-green-700">
          <span className="text-green-500">claude-studio</span>
          <span className="text-green-700">@</span>
          <span className="text-green-500">localhost</span>
          <span className="text-green-700">:~$ </span>
          <span className="text-green-400">ready{cursor}</span>
        </div>
      </div>
    </main>
  )
}
