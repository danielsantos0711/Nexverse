/*
 * The site's public address, for absolute links in metadata, robots.txt and the sitemap. NEXT_PUBLIC_SITE_URL
 * wins (a custom domain); on Vercel the production domain is known without it; the fallback is the live site.
 */
function siteUrl(): string {
  const set = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (set) return set.replace(/\/+$/, "")
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
  if (vercel) return `https://${vercel.replace(/\/+$/, "")}`
  return "https://nexverse-one.vercel.app"
}

export const SITE_URL = siteUrl()
