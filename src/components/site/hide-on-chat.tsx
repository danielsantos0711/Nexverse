"use client"

import { usePathname } from "next/navigation"

/** Chat fills the screen under the header, so the footer steps out of the way there. */
export function HideOnChat({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  return pathname === "/chat" || pathname.startsWith("/chat/") ? null : children
}
