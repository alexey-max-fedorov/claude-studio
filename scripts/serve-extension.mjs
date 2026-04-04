import { createServer } from "http"
import { createReadStream, existsSync, statSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import { execSync } from "child_process"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, "..")
const ZIP_PATH = join(ROOT, "dist", "claude-studio-extension.zip")
const BUILD_SCRIPT = join(ROOT, "scripts", "build-extension-zip.sh")
const PORT = 3002
const HOST = "0.0.0.0"

createServer((req, res) => {
  if (req.url === "/" || req.url === "/extension.zip") {
    // Always rebuild before serving to ensure latest code
    try {
      console.log("Building extension...")
      execSync(`bash "${BUILD_SCRIPT}"`, { cwd: ROOT, stdio: "pipe" })
      console.log("Build complete")
    } catch (e) {
      console.error("Build failed:", e.stderr?.toString() || e.message)
      res.writeHead(500, { "Content-Type": "text/plain" })
      res.end("Extension build failed")
      return
    }
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
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
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
