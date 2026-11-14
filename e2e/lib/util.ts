import { request } from "node:http"
import { createServer } from "node:net"
import { deflateSync } from "node:zlib"

/** A free TCP port on 127.0.0.1. */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer()
    s.unref()
    s.on("error", reject)
    s.listen(0, "127.0.0.1", () => {
      const addr = s.address()
      const port = typeof addr === "object" && addr ? addr.port : 0
      s.close(() => resolve(port))
    })
  })
}

export interface HttpResult {
  status: number
  body: string
  headers: Record<string, string | string[] | undefined>
}

/** Plain HTTP GET to 127.0.0.1:port with optional Host override. */
export function httpGet(port: number, path: string, headers: Record<string, string> = {}, timeoutMs = 5000, host = "127.0.0.1"): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const req = request({ host, port, path, method: "GET", headers, timeout: timeoutMs }, (res) => {
      let body = ""
      res.setEncoding("utf8")
      res.on("data", (c) => (body += c))
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body, headers: res.headers }))
    })
    req.on("timeout", () => req.destroy(new Error(`HTTP ${path} timed out`)))
    req.on("error", reject)
    req.end()
  })
}

// --- tiny PNG encoder (RGBA, no filter) -------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, "ascii"), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

/** PNG bytes for a width x height image; pixel(x, y) returns [r, g, b, a]. */
export function makePng(width: number, height: number, pixel: (x: number, y: number) => [number, number, number, number]): Buffer {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixel(x, y)
      const o = y * (width * 4 + 1) + 1 + x * 4
      raw[o] = r
      raw[o + 1] = g
      raw[o + 2] = b
      raw[o + 3] = a
    }
  }
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))])
}

/** 2x2 red/green/blue/white PNG as a data URL. */
export function tinyPngDataUrl(): string {
  const colors: [number, number, number, number][] = [
    [255, 0, 0, 255],
    [0, 255, 0, 255],
    [0, 0, 255, 255],
    [255, 255, 255, 255],
  ]
  return `data:image/png;base64,${makePng(2, 2, (x, y) => colors[y * 2 + x]).toString("base64")}`
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
