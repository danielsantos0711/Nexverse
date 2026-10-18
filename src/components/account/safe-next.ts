/** Only same-site paths are followed after signing in, so a crafted link cannot send someone elsewhere. */
export function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/you"
}
