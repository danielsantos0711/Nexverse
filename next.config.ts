import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  // Security headers on every response. No full Content-Security-Policy yet (only frame-ancestors): the site
  // loads Supabase, Google Fonts, README images from any host, embeds and WebGL, so a resource policy needs its
  // own verified pass before it can be switched on without breaking pages.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
        ],
      },
      {
        // The GitHub download proxy sends its own stricter policy (sandboxed, frame-ancestors included); a header
        // here would replace it.
        source: "/((?!api/gh/download).*)",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors 'self'" }],
      },
    ]
  },
  // Addresses from the first version keep working.
  async redirects() {
    return [
      { source: "/threads/:id", destination: "/forum/:id", permanent: true },
      { source: "/new", destination: "/forum/new", permanent: true },
      { source: "/orbits/:slug*", destination: "/forum", permanent: true },
      { source: "/signal", destination: "/news", permanent: true },
      { source: "/artifacts/:slug", destination: "/explore", permanent: true },
      // Papers were replaced by the Nexverse newsroom (round 8).
      { source: "/papers", destination: "/news", permanent: true },
      { source: "/papers/:path*", destination: "/news", permanent: true },
      // Round 12: pages that did the same thing were merged (the menus remap saved links the same way, see
      // MOVED in src/lib/menus.ts). Query strings carry over (/cosmos?focus=… keeps its focus).
      { source: "/repos", destination: "/code?from=members", permanent: false },
      { source: "/gh/topics", destination: "/code?from=github", permanent: false },
      { source: "/cosmos", destination: "/explore?show=map", permanent: false },
      { source: "/constellations", destination: "/collections?show=map", permanent: false },
      { source: "/studio", destination: "/you", permanent: false },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
