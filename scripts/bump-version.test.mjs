import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"

const packages = ["protocol", "agent", "extension", "website"]

function fixture(versions) {
  const dir = mkdtempSync(join(tmpdir(), "claude-studio-version-"))
  mkdirSync(join(dir, "scripts"))
  const script = join(dir, "scripts/bump-version.sh")
  copyFileSync(new URL("./bump-version.sh", import.meta.url), script)
  for (const [i, name] of packages.entries()) {
    mkdirSync(join(dir, name))
    writeFileSync(join(dir, name, "package.json"), JSON.stringify({ name, version: versions[i], dependencies: { untouched: "1.2.3" } }))
  }
  const manifests = () => packages.map((name) => JSON.parse(readFileSync(join(dir, name, "package.json"), "utf8")))
  return { dir, script, manifests }
}

const options = { skip: process.platform === "win32" }

test("relative version bumps reject mixed versions without modifying manifests", options, () => {
  const f = fixture(["2.1.0", "3.0.0", "2.1.0", "2.1.0"])
  try {
    const before = f.manifests()
    const result = spawnSync("bash", [f.script, "patch"], { encoding: "utf8" })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /versions differ.*explicit X\.Y\.Z/)
    assert.deepEqual(f.manifests(), before)
  } finally { rmSync(f.dir, { recursive: true, force: true }) }
})

for (const [arg, expected] of [["patch", "3.0.1"], ["minor", "3.1.0"], ["major", "4.0.0"]]) {
  test(`aligned ${arg} version bumps preserve other fields`, options, () => {
    const f = fixture(Array(4).fill("3.0.0"))
    try {
      const result = spawnSync("bash", [f.script, arg], { encoding: "utf8" })
      assert.equal(result.status, 0, result.stderr)
      for (const [i, manifest] of f.manifests().entries()) assert.deepEqual(manifest, { name: packages[i], version: expected, dependencies: { untouched: "1.2.3" } })
    } finally { rmSync(f.dir, { recursive: true, force: true }) }
  })
}

test("explicit versions can deliberately align mixed package versions", options, () => {
  const f = fixture(["2.1.0", "3.0.0", "2.1.0", "2.1.0"])
  try {
    const result = spawnSync("bash", [f.script, "3.0.0"], { encoding: "utf8" })
    assert.equal(result.status, 0, result.stderr)
    assert.deepEqual(f.manifests().map((manifest) => manifest.version), Array(4).fill("3.0.0"))
  } finally { rmSync(f.dir, { recursive: true, force: true }) }
})
