import type { Metadata } from "next"
import { cacheLife, cacheTag } from "next/cache"
import { conform, seoFor, visibilityFor, type Seo, type Visibility } from "@/lib/content-shape"
import { publicDb, select } from "@/lib/newsroom/rest"

/*
 * Server only. The admins' content overrides for server components and generateMetadata: the same rows the
 * browser reads (src/lib/content.ts), fetched with the publishable key, cached and tagged "site-content". The
 * cache turns over within minutes; open pages also follow edits live in the browser. Missing database or
 * table: no overrides, so the code's defaults apply.
 */

type Values = Record<string, unknown>

/** Every override (key → value), or an empty object when the database or the table is missing. */
export async function getContentValues(): Promise<Values> {
  "use cache"
  cacheTag("site-content")
  cacheLife("minutes")
  const db = publicDb()
  if (!db) return {}
  const values: Values = {}
  try {
    for (let offset = 0; offset < 20_000; offset += 1000) {
      const rows = await select<{ key: string; value: unknown }>(db, "site_content", `select=key,value&value=not.is.null&order=key&limit=1000&offset=${offset}`)
      for (const r of rows) values[r.key] = r.value
      if (rows.length < 1000) break
    }
  } catch {
    // Not available yet: the defaults describe a complete site.
    return {}
  }
  return values
}

/** The site's brand settings (name and description) as the admins saved them. */
async function getBrand(): Promise<{ name: string; description: string }> {
  "use cache"
  cacheTag("site-settings")
  cacheLife("minutes")
  const fallback = { name: "Nexverse", description: "" }
  const db = publicDb()
  if (!db) return fallback
  try {
    const rows = await select<{ value: { name?: unknown; description?: unknown } }>(db, "site_settings", "select=value&key=eq.brand&limit=1")
    const v = rows[0]?.value ?? {}
    return {
      name: typeof v.name === "string" && v.name.trim() ? v.name.trim() : fallback.name,
      description: typeof v.description === "string" ? v.description.trim() : "",
    }
  } catch {
    return fallback
  }
}

/** Editable text on the server. */
export async function getCopy(key: string, fallback: string): Promise<string> {
  const v = (await getContentValues())[key]
  return typeof v === "string" && v.trim() ? v : fallback
}

/** An editable list or config on the server, reshaped to the fallback like useBlock does. */
export async function getBlock<T>(key: string, fallback: T): Promise<T> {
  return conform(fallback, (await getContentValues())[key])
}

export async function getSeo(path: string): Promise<Seo> {
  return seoFor(await getContentValues(), path)
}

export async function getPageVisibility(path: string): Promise<Visibility> {
  return visibilityFor(await getContentValues(), path)
}

/**
 * A page's metadata with the admins' SEO overrides on top: use in generateMetadata.
 *   export async function generateMetadata() { return seoMetadata("/forum", { title: "Forum", description: "…" }) }
 * Hidden and staff-only pages also ask search engines not to index them.
 */
export async function seoMetadata(path: string, fallback: Metadata): Promise<Metadata> {
  const [seo, visibility] = await Promise.all([getSeo(path), getPageVisibility(path)])
  const out: Metadata = { ...fallback }
  if (seo.title) out.title = path === "/" ? { absolute: seo.title } : seo.title
  if (seo.description) out.description = seo.description
  const title = typeof out.title === "string" ? out.title : undefined
  const description = typeof out.description === "string" ? out.description : undefined
  if (seo.image || seo.title || seo.description) {
    out.openGraph = { ...(fallback.openGraph ?? {}), ...(title ? { title } : {}), ...(description ? { description } : {}), ...(seo.image ? { images: [{ url: seo.image }] } : {}) }
    out.twitter = { card: seo.image ? "summary_large_image" : "summary", ...(title ? { title } : {}), ...(description ? { description } : {}), ...(seo.image ? { images: [seo.image] } : {}) }
  }
  if (visibility !== "everyone") out.robots = { index: false, follow: false }
  return out
}

/** The root layout's metadata: the site's name as the title template, and the home page's SEO as the default. */
export async function rootMetadata(fallback: { title: string; description: string }): Promise<Metadata> {
  const [brand, seo] = await Promise.all([getBrand(), getSeo("/")])
  const title = seo.title || fallback.title
  const description = seo.description || brand.description || fallback.description
  return {
    title: { default: title, template: `%s · ${brand.name}` },
    description,
    applicationName: brand.name,
    openGraph: { type: "website", siteName: brand.name, title, description, ...(seo.image ? { images: [{ url: seo.image }] } : {}) },
    twitter: { card: seo.image ? "summary_large_image" : "summary", title, description, ...(seo.image ? { images: [seo.image] } : {}) },
  }
}
