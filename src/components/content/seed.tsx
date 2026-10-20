"use client"

import { ContentSeed } from "@/lib/content"

/** Passes the server's overrides to the content hooks until the live store has loaded. */
export function ContentSeedProvider({ values, children }: { values: Record<string, unknown>; children: React.ReactNode }) {
  return <ContentSeed value={values}>{children}</ContentSeed>
}
