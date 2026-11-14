/*
 * Plain timestamped logging for a headless daemon. stdout gets info lines,
 * stderr gets errors; a LaunchAgent captures both into its log files.
 */

type Level = "info" | "warn" | "error"

let quiet = false

/** Silence all output (used by tests). */
export function setQuiet(q: boolean): void {
  quiet = q
}

function emit(level: Level, tag: string, msg: string): void {
  if (quiet) return
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} [${tag}] ${msg}\n`
  if (level === "error") process.stderr.write(line)
  else process.stdout.write(line)
}

export const log = {
  info: (tag: string, msg: string) => emit("info", tag, msg),
  warn: (tag: string, msg: string) => emit("warn", tag, msg),
  error: (tag: string, msg: string) => emit("error", tag, msg),
}

export function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
