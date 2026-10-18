import { useId } from "react"
import { seeded } from "@/components/hub/bits"
import { cn } from "@/lib/utils"

const HUES = [222, 200, 245, 168, 32, 275, 190, 340]

/** A room's planet: colour, ring and moon drawn from its address, so every room has its own. */
export function RoomGlyph({ slug, active, size = 28, className }: { slug: string; active?: boolean; size?: number; className?: string }) {
  const r = seeded(`room:${slug}`)
  const hue = HUES[Math.floor(r() * HUES.length)]
  const ring = r() > 0.45
  const tilt = -35 + r() * 70
  const moon = r() > 0.5
  const moonAngle = r() * Math.PI * 2
  const id = `rg-${useId().replace(/:/g, "")}`
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      aria-hidden
      className={cn("shrink-0 transition-[filter,opacity] duration-200", active ? "opacity-100" : "opacity-75 group-hover:opacity-100", className)}
      style={active ? { filter: `drop-shadow(0 0 6px hsl(${hue} 90% 70% / 0.55))` } : undefined}
    >
      <defs>
        <radialGradient id={id} cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor={`hsl(${hue} 85% 82%)`} />
          <stop offset="55%" stopColor={`hsl(${hue} 55% 52%)`} />
          <stop offset="100%" stopColor={`hsl(${hue} 50% 18%)`} />
        </radialGradient>
      </defs>
      {ring && (
        <ellipse cx="16" cy="16" rx="14" ry="4.2" fill="none" stroke={`hsl(${hue} 70% 78% / 0.5)`} strokeWidth="1" transform={`rotate(${tilt} 16 16)`} />
      )}
      <circle cx="16" cy="16" r={ring ? 7.5 : 8.5} fill={`url(#${id})`} />
      {ring && (
        <path
          d="M 2 16 A 14 4.2 0 0 0 30 16"
          fill="none"
          stroke={`hsl(${hue} 70% 82% / 0.8)`}
          strokeWidth="1"
          transform={`rotate(${tilt} 16 16)`}
        />
      )}
      {moon && <circle cx={16 + Math.cos(moonAngle) * 13} cy={16 + Math.sin(moonAngle) * 13} r="1.4" fill="#e9ebf1" opacity="0.85" />}
    </svg>
  )
}

/** A member's avatar: initials on a gradient seeded by their id. */
export function ChatAvatar({ id, name, size = 32, className }: { id: string; name?: string; size?: number; className?: string }) {
  const r = seeded(`member:${id}`)
  const h1 = HUES[Math.floor(r() * HUES.length)]
  const h2 = (h1 + 40 + r() * 60) % 360
  const letters = (name || "?")
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => [...w][0] ?? "")
    .join("")
    .toUpperCase()
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: size * 0.38, background: `linear-gradient(135deg, hsl(${h1} 60% 62%), hsl(${h2} 50% 30%))` }}
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white/95 ring-1 ring-white/15 ring-inset", className)}
    >
      {letters}
    </span>
  )
}
