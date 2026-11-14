import { describe, expect, it } from "vitest"
import { relPath, summarizeTool } from "../lib/tool-summary"

const P = "/Users/me/Projects/webapp"

describe("summarizeTool", () => {
  it("Bash shows the command on one line", () => {
    expect(summarizeTool("Bash", { command: "git status\n  && ls", description: "x" })).toMatchObject({ label: "Bash", detail: "git status && ls", icon: "terminal" })
  })
  it("file tools show paths relative to the project", () => {
    expect(summarizeTool("Read", { file_path: `${P}/courses/INDEX.md` }, P).detail).toBe("courses/INDEX.md")
    expect(summarizeTool("Read", { file_path: `${P}/a.ts`, offset: 40 }, P).detail).toBe("a.ts:40")
    expect(summarizeTool("Edit", { file_path: `${P}/b.ts` }, P)).toMatchObject({ detail: "b.ts", icon: "edit" })
    expect(summarizeTool("Write", { file_path: "/Users/me/other/c.ts" }, P).detail).toBe("~/other/c.ts")
  })
  it("Grep and Glob show the pattern", () => {
    expect(summarizeTool("Grep", { pattern: "TODO", path: `${P}/src` }, P).detail).toBe("TODO in src")
    expect(summarizeTool("Glob", { pattern: "**/*.ts" }, P).detail).toBe("**/*.ts")
  })
  it("web tools show the url or query", () => {
    expect(summarizeTool("WebFetch", { url: "https://example.com/a", prompt: "x" }).detail).toBe("https://example.com/a")
    expect(summarizeTool("WebSearch", { query: "plasmo side panel" }).detail).toBe("plasmo side panel")
  })
  it("Task and Agent show the description and subagent type", () => {
    expect(summarizeTool("Task", { description: "Find callers", prompt: "long", subagent_type: "Explore" })).toMatchObject({
      label: "Task (Explore)",
      detail: "Find callers",
      icon: "agent",
    })
    expect(summarizeTool("Agent", { description: "Review" }).detail).toBe("Review")
  })
  it("MCP tools read as server: tool", () => {
    expect(summarizeTool("mcp__github__create_issue", { title: "Bug", body: "..." })).toMatchObject({ label: "github: create_issue", detail: "Bug" })
    expect(summarizeTool("mcp__plugin_uh-mcp_uh-mcp__canvas_get_grades", { course: "ENTR" }).label).toBe("uh-mcp: canvas_get_grades")
  })
  it("unknown tools use the first string argument", () => {
    expect(summarizeTool("Mystery", { n: 3, q: "hello", z: "later" }).detail).toBe("hello")
    expect(summarizeTool("Mystery", {}).detail).toBe("")
  })
  it("TodoWrite counts todos", () => {
    expect(summarizeTool("TodoWrite", { todos: [{ status: "completed" }, { status: "pending" }] }).detail).toBe("2 todos, 1 done")
  })
  it("clips very long details", () => {
    expect(summarizeTool("Bash", { command: "x".repeat(1000) }).detail.length).toBeLessThanOrEqual(240)
  })
})

describe("relPath", () => {
  it("handles the project root and outside paths", () => {
    expect(relPath(P, P)).toBe(".")
    expect(relPath(`${P}/`, P + "/")).toBe(".")
    expect(relPath("/etc/hosts", P)).toBe("/etc/hosts")
    expect(relPath(`${P}x/y`, P)).toBe("~/Projects/webappx/y")
  })
})
