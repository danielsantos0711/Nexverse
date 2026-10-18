"use client"

import { useState } from "react"
import { seeded } from "@/components/hub/bits"
import { cn } from "@/lib/utils"

const HUES = [222, 200, 245, 168, 32, 275, 190]

export function initials(name: string | null | undefined) {
  return (name?.trim() || "You")
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => [...w][0] ?? "")
    .join("")
    .toUpperCase()
}

/** Only pictures from this project's "avatars" bucket are shown; anything else falls back to initials. */
function safeAvatar(url: string | null | undefined) {
  if (!url) return null
  try {
    const u = new URL(url)
    return u.protocol === "https:" && u.pathname.includes("/storage/v1/object/public/avatars/") ? u.toString() : null
  } catch {
    return null
  }
}

/**
 * A member's picture: their uploaded avatar, or initials on a gradient drawn from their id (or name), so
 * everyone has a recognisable picture even when storage is switched off.
 */
export function ProfileAvatar({
  name,
  seed,
  url,
  size = 32,
  className,
}: {
  name: string | null | undefined
  /** What the gradient is drawn from; the member id keeps it stable when they rename. */
  seed?: string
  url?: string | null
  size?: number
  className?: string
}) {
  const src = safeAvatar(url)
  const [broken, setBroken] = useState<string | null>(null)
  const r = seeded(seed || name || "member")
  const h1 = HUES[Math.floor(r() * HUES.length)]
  const h2 = (h1 + 40 + r() * 60) % 360
  const style = { width: size, height: size, fontSize: size * 0.38 }
  if (src && broken !== src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- member uploads from Supabase Storage; the host depends on the deployment
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        style={style}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setBroken(src)}
        className={cn("shrink-0 rounded-full object-cover ring-1 ring-white/15", className)}
      />
    )
  }
  return (
    <span
      aria-hidden
      style={{ ...style, background: `linear-gradient(135deg, hsl(${h1} 60% 62%), hsl(${h2} 50% 30%))` }}
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white/95 ring-1 ring-white/15 ring-inset", className)}
    >
      {initials(name)}
    </span>
  )
}
