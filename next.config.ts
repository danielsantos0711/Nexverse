import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Addresses from the first version keep working.
  async redirects() {
    return [
      { source: "/threads/:id", destination: "/forum/:id", permanent: true },
      { source: "/new", destination: "/forum/new", permanent: true },
      { source: "/orbits/:slug*", destination: "/forum", permanent: true },
      { source: "/signal", destination: "/news", permanent: true },
      { source: "/artifacts/:slug", destination: "/explore", permanent: true },
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
