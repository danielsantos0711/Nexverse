/**
 * Pure checks and link helpers for member content. No React, no database client: safe to import from server
 * components (route pages, server cards) as well as the browser. lib/hub and lib/people re-export them.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HANDLE = /^[a-z0-9_]{3,30}$/

/** A project or shared-link id. */
export const isHubId = (id: string) => UUID.test(id)

/** A member's id or handle, as used in /people/<ref>. */
export const isMemberRef = (s: string) => UUID.test(s) || HANDLE.test(s)

/** A member's page, by handle when they have one. */
export const ownerHref = (o: { id: string | null; handle: string | null } | null) => (o?.handle ? `/people/${o.handle}` : o?.id ? `/people/${o.id}` : null)

/** "github.com", or "" when the link does not parse. */
export function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return ""
  }
}
