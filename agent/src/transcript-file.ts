import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"

/*
 * Newer Claude Code versions store local slash-command output (/usage,
 * /context, ...) in `system` transcript entries (subtype "local_command"),
 * and getSessionMessages() returns those entries without their content.
 * This reads just that content from the JSONL file, read-only. Best effort:
 * any problem returns an empty map.
 */

/** Transcript path the CLI uses for short project paths. */
export function transcriptPath(projectDir: string, sessionId: string, configDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude")): string {
  return join(configDir, "projects", projectDir.replace(/[^a-zA-Z0-9]/g, "-"), `${sessionId}.jsonl`)
}

const ANSI_RE = /\x1b\[[0-9;?]*[A-Za-z]/g

export function parseLocalCommandOutputs(jsonl: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const line of jsonl.split("\n")) {
    if (!line.includes('"local_command"')) continue
    try {
      const e = JSON.parse(line)
      if (e?.type !== "system" || e.subtype !== "local_command" || typeof e.uuid !== "string" || typeof e.content !== "string") continue
      const text = e.content
        .replace(/<\/?local-command-(stdout|stderr)>/g, "")
        .replace(ANSI_RE, "")
        .trim()
      if (text) out.set(e.uuid, text)
    } catch {
      /* partial line */
    }
  }
  return out
}

export async function readLocalCommandOutputs(projectDir: string, sessionId: string): Promise<Map<string, string>> {
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return new Map()
  try {
    return parseLocalCommandOutputs(await readFile(transcriptPath(projectDir, sessionId), "utf-8"))
  } catch {
    return new Map()
  }
}
