import { createServer } from "http"
import { createReadStream, existsSync, statSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ZIP_PATH = join(__dirname, "..", "dist", "claude-studio-extension.zip")
const PORT = 3002
const HOST = "0.0.0.0"

createServer((req, res) => {
  if (req.url === "/" || req.url === "/extension.zip") {
    if (!existsSync(ZIP_PATH)) {
      res.writeHead(404, { "Content-Type": "text/plain" })
      res.end("Extension ZIP not found. Run: pnpm build:extension-zip")
      return
    }
    const size = statSync(ZIP_PATH).size
    res.writeHead(200, {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="claude-studio-extension.zip"',
      "Content-Length": size,
    })
    createReadStream(ZIP_PATH).pipe(res)
    console.log(`Served extension ZIP (${(size / 1024).toFixed(0)} KB)`)
  } else {
    res.writeHead(404)
    res.end()
  }
}).listen(PORT, HOST, () => {
  console.log(`Extension ZIP server running`)
  console.log(`Download: http://192.168.0.73:${PORT}/extension.zip`)
})
