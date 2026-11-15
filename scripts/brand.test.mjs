import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { test } from "node:test"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const read = (path) => readFileSync(join(root, path), "utf8")
const json = (path) => JSON.parse(read(path))
const brand = json("brand.json")

test("Metatron uses one approved product name and exact headline", () => {
  assert.deepEqual(brand, { name: "Metatron", headline: "Local Claude Code CLI in your browser." })
  const extension = json("extension/package.json")
  assert.equal(extension.displayName, brand.name)
  assert.equal(extension.description, brand.headline)
  assert.equal(json("agent/package.json").description, brand.headline)
  assert.ok(read("docs/store/description.txt").startsWith(`${brand.name}\n${brand.headline}\n`))
  assert.match(read("website/src/data/site.ts"), /import brand from ["'].*brand\.json["']/)
  assert.match(read("extension/src/sidepanel.tsx"), /brand\.headline/)
})

test("the published npm package, CLI, and extension identity remain compatible", () => {
  const agent = json("agent/package.json")
  assert.equal(agent.name, "claude-studio")
  assert.deepEqual(Object.keys(agent.bin), ["claude-studio"])
  const extension = json("extension/package.json")
  assert.equal(extension.name, "@claude-studio/extension")
  const digest = createHash("sha256").update(Buffer.from(extension.manifest.key, "base64")).digest("hex").slice(0, 32)
  const id = [...digest].map((digit) => String.fromCharCode(97 + parseInt(digit, 16))).join("")
  assert.equal(id, "geiimncmpakilhfdnkmcbgabpchhllol")
  assert.equal(extension.manifest.action.default_title, "Open Metatron")
  assert.equal(extension.manifest.commands["toggle-picker"].description, "Pick an element for Metatron")
})

test("extension and website expose the approved palette and typography", () => {
  const tokens = { midnight: "19354B", slate: "536A82", atmosphere: "91A8BD", ivory: "F5F0E8", stone: "D9D2C9", champagne: "E7D2B8" }
  for (const path of ["extension/src/sidepanel.css", "website/src/app/globals.css"]) {
    const css = read(path)
    for (const [name, value] of Object.entries(tokens)) {
      assert.match(css, new RegExp(`--color-${name}:\\s*#${value}\\b`, "i"), `${path}: ${name}`)
    }
  }
  for (const path of ["extension/src/sidepanel.css", "website/src/app/globals.css"]) {
    const source = read(path)
    assert.match(source, /Cormorant[ _]Garamond/)
    assert.match(source, /Montserrat/)
  }
  for (const family of ["cormorantgaramond", "montserrat"]) {
    assert.match(read(`extension/assets/fonts/${family}-OFL.txt`), /SIL OPEN FONT LICENSE/)
  }
})

test("the supplied raster identity is sized for the extension and shared with the website", () => {
  for (const [path, size] of [["extension/assets/icon.png", 512], ["extension/assets/icon-128.png", 128], ["website/public/icon.png", 512]]) {
    const png = readFileSync(join(root, path))
    assert.equal(png.subarray(1, 4).toString(), "PNG")
    assert.equal(png.readUInt32BE(16), size)
    assert.equal(png.readUInt32BE(20), size)
  }
  assert.deepEqual(readFileSync(join(root, "extension/assets/icon.png")), readFileSync(join(root, "website/public/icon.png")))
  assert.doesNotMatch(read("extension/assets/icon.svg"), /#c9a84c|<path/)
})

test("markdown table header links and paths retain readable contrast in both themes", () => {
  const css = read("extension/src/sidepanel.css")
  assert.match(css, /\.md-table th a,\s*\.md-table th \.md-path\s*\{\s*color: var\(--ink\);/)
  const declarations = (source) => Object.fromEntries([...source.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((match) => [match[1], match[2]]))
  const light = declarations(css.match(/:root\s*\{([^}]+)\}/)[1])
  const dark = { ...light, ...declarations(css.match(/@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{([^}]+)\}/)[1]) }
  const resolveColor = (value, theme) => value.startsWith("var(") ? resolveColor(theme[value.slice(4, -1)], theme) : value
  const luminance = (hex) => {
    const channels = hex.slice(1).match(/../g).map((channel) => parseInt(channel, 16) / 255)
      .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
  }
  for (const theme of [light, dark]) {
    const foreground = luminance(resolveColor(theme["--ink"], theme))
    const background = luminance(resolveColor(theme["--fill"], theme))
    const contrast = (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05)
    assert.ok(contrast >= 4.5, `Table header text contrast: ${contrast.toFixed(2)}:1`)
  }
})

test("website reduced-motion rendering keeps branded content visible", () => {
  const css = read("website/src/app/globals.css")
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*\}[^}]*\.scroll-reveal\s*\{\s*opacity: 1 !important;\s*transform: none !important;/)
  const reveal = read("website/src/components/ui/ScrollReveal.tsx")
  assert.match(reveal, /\["scroll-reveal", className\]/)
  assert.doesNotMatch(reveal, /if \(prefersReducedMotion\)/)
})
