"use client"

import { usePathname } from "next/navigation"

/** Chat and messages fill the screen under the header, so the footer steps out of the way there. */
export function HideOnChat({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  return /^\/(chat|messages)(\/|$)/.test(pathname) ? null : children
}
