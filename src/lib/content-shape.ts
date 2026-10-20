import { routeFor } from "@/lib/site-map"

/*
 * The pure part of editable content, shared by the browser (src/lib/content.ts) and the server
 * (src/lib/content-server.ts): key rules, per-page visibility and SEO lookups, and how an override is
 * reshaped to the code's default. No React and no "use client", so server code can call it.
 */

type Values = Record<string, unknown>

export type Visibility = "everyone" | "members" | "staff" | "hidden"
export type Seo = { title: string; description: string; image: string }

export const VISIBILITIES: { id: Visibility; label: string; blurb: string }[] = [
  { id: "everyone", label: "Everyone", blurb: "Guests and members" },
  { id: "members", label: "Members", blurb: "Signed-in members only; guests see a sign-in wall" },
  { id: "staff", label: "Staff", blurb: "Moderators and admins only" },
  { id: "hidden", label: "Hidden", blurb: "Nobody but admins; the page acts as if it did not exist" },
]

export const isVisibility = (v: unknown): v is Visibility => typeof v === "string" && VISIBILITIES.some((x) => x.id === v)

/** The same rule the database enforces for copy and list keys. */
export const CONTENT_KEY = /^[a-z0-9][a-z0-9-]*(\.[a-zA-Z0-9][a-zA-Z0-9_-]*){1,7}$/
export const isContentKey = (k: string) => k.length <= 200 && CONTENT_KEY.test(k) && !/^(seo|visibility)\./.test(k)

export const seoKey = (path: string) => `seo.${path}`
export const visibilityKey = (path: string) => `visibility.${path}`

/** The same answer from a set of values, for code outside React (and the server, via content-server.ts). */
export function visibilityFor(values: Values, path: string): Visibility {
  const clean = path.split(/[?#]/)[0].replace(/(.)\/+$/, "$1") || "/"
  const exact = values[visibilityKey(clean)]
  if (isVisibility(exact)) return exact
  const route = routeFor(clean)
  const byRoute = route ? values[visibilityKey(route.path)] : undefined
  return isVisibility(byRoute) ? byRoute : "everyone"
}

export function seoFor(values: Values, path: string): Seo {
  const clean = path.split(/[?#]/)[0].replace(/(.)\/+$/, "$1") || "/"
  const route = routeFor(clean)
  const raw = (values[seoKey(clean)] ?? (route ? values[seoKey(route.path)] : undefined)) as Partial<Seo> | undefined
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "")
  return { title: str(raw?.title), description: str(raw?.description), image: str(raw?.image) }
}

// ─── Shapes: an override only applies where it matches the code's default ─────────────────────────────────

const isPlain = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v)

/**
 * The override reshaped to the fallback: the same type at every level, unknown fields dropped, missing fields
 * filled with an empty value of the right type. A saved list keeps working after the code adds a field.
 */
export function conform<T>(fallback: T, value: unknown): T {
  if (value === undefined || value === null) return fallback
  if (Array.isArray(fallback)) {
    if (!Array.isArray(value)) return fallback
    const template = fallback[0]
    if (template === undefined) return value as T
    if (isPlain(template)) return value.filter(isPlain).map((item) => conformItem(template, item)) as T
    return value.filter((x) => typeof x === typeof template) as T
  }
  if (isPlain(fallback)) {
    if (!isPlain(value)) return fallback
    const out: Record<string, unknown> = { ...fallback }
    for (const k of Object.keys(fallback)) {
      if (k in value) out[k] = conform(fallback[k], value[k])
    }
    return out as T
  }
  return typeof value === typeof fallback ? (value as T) : fallback
}

function conformItem(template: Record<string, unknown>, item: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  for (const [k, t] of Object.entries(template)) {
    const v = item[k]
    if (Array.isArray(t)) out[k] = Array.isArray(v) ? v.filter((x) => typeof x === typeof (t[0] ?? "")) : []
    else if (isPlain(t)) out[k] = isPlain(v) ? conformItem(t, v) : emptyOf(t)
    else out[k] = typeof v === typeof t ? v : emptyOf(t)
  }
  return out
}

/** An empty value of the same type: "" for text, 0 for numbers, false for switches. */
export function emptyOf(t: unknown): unknown {
  if (typeof t === "string") return ""
  if (typeof t === "number") return 0
  if (typeof t === "boolean") return false
  if (Array.isArray(t)) return []
  if (isPlain(t)) return Object.fromEntries(Object.entries(t).map(([k, v]) => [k, emptyOf(v)]))
  return null
}
