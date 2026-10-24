const BASE = "https://nexverse.invalid"

/**
 * Only same-site paths are followed after signing in, so a crafted link cannot send someone elsewhere.
 * Backslashes, whitespace and control characters are refused outright (browsers drop tabs and newlines from
 * URLs, so "/\t/evil.example" would otherwise become "//evil.example"), and the path must still resolve on
 * this origin.
 */
export function safeNext(next: string | null) {
  if (!next || next.length > 2048 || !next.startsWith("/") || next.startsWith("//") || /[\\\s\u0000-\u001f\u007f]/.test(next)) return "/you"
  try {
    const u = new URL(next, BASE)
    return u.origin === BASE ? `${u.pathname}${u.search}${u.hash}` : "/you"
  } catch {
    return "/you"
  }
}
