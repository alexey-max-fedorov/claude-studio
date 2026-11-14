/*
 * Request guards for the localhost daemon. The agent drives Claude Code with
 * the full toolset (Bash included), so only our own extension may connect.
 */

/** Pinned ID of the Claude Studio side panel extension. */
export const DEFAULT_EXTENSION_ORIGIN = "chrome-extension://geiimncmpakilhfdnkmcbgabpchhllol"

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"])

/** True for bind hosts that only accept connections from this machine. */
export function isLoopbackBindHost(host: string): boolean {
  const h = host.trim().toLowerCase().replace(/^\[(.*)\]$/, "$1")
  return h === "localhost" || h === "::1" || /^127(\.\d{1,3}){3}$/.test(h)
}

/** Hostname (lowercased, port stripped) from a Host header, or null if unparseable. */
export function hostnameFromHostHeader(host: string | undefined): string | null {
  if (!host) return null
  try {
    return new URL(`http://${host}`).hostname.toLowerCase()
  } catch {
    return null
  }
}

/**
 * DNS-rebinding guard: the Host header must name a loopback host (or one of
 * the explicitly bound extra hosts).
 */
export function isAllowedHost(hostHeader: string | undefined, extraHosts: string[] = []): boolean {
  const h = hostnameFromHostHeader(hostHeader)
  if (!h) return false
  if (LOOPBACK_HOSTS.has(h)) return true
  return extraHosts.map((x) => x.toLowerCase()).includes(h)
}

export function normalizeOrigin(o: string): string {
  return o.trim().replace(/\/+$/, "").toLowerCase()
}

/**
 * Origin allowlist check. A missing Origin header is accepted only when
 * allowNoOrigin is set (local test scripts; browsers always send Origin).
 */
export function isAllowedOrigin(origin: string | undefined, allowlist: string[], allowNoOrigin: boolean): boolean {
  if (origin === undefined || origin === "") return allowNoOrigin
  const o = normalizeOrigin(origin)
  return allowlist.some((a) => normalizeOrigin(a) === o)
}
