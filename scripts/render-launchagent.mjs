import { readFileSync, realpathSync } from "node:fs"
import { pathToFileURL } from "node:url"

function xmlString(value) {
  if (typeof value !== "string" || /[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/u.test(value)) {
    throw new Error("LaunchAgent values must be valid XML strings")
  }
  const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;", "\r": "&#13;" }
  return value.replace(/[&<>"'\r]/g, (char) => entities[char])
}

export function renderLaunchAgent({ label, node, cli, project, port, path, log }) {
  const values = { LABEL: label, NODE: node, CLI: cli, PROJECT: project, PORT: port, PATH: path, LOG: log }
  const escaped = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, xmlString(value)]))
  const template = readFileSync(new URL("./launchagent.plist.template", import.meta.url), "utf8")
  return template.replace(/__([A-Z]+)__/g, (_, key) => {
    if (!(key in escaped)) throw new Error(`Unknown plist placeholder: ${key}`)
    return escaped[key]
  })
}

if (process.argv[1] && pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url) {
  const [label, node, cli, project, port, path, log] = process.argv.slice(2)
  process.stdout.write(renderLaunchAgent({ label, node, cli, project, port, path, log }))
}
