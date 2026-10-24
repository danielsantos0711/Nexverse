import type { MetadataRoute } from "next"
import { SITE_URL } from "@/lib/site-url"

/** Public pages are open to crawlers; members' own pages, forms, the admin and the API are not. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/admin",
        "/auth/",
        "/settings",
        "/messages",
        "/notifications",
        "/saved",
        "/you",
        "/for-you",
        "/welcome",
        "/reset-password",
        "/new/",
        "/*/new",
        "/p/*/edit",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
