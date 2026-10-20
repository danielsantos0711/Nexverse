import { useId } from "react"
import { cn } from "@/lib/utils"

/*
 * Nexverse's own sticker set: twelve small space drawings in the site's palette, drawn as SVG so they are crisp,
 * weigh nothing and need no outside service (no GIF search). A sticker message's text is ":sticker:<id>:", so
 * an older copy of the site shows a readable fallback.
 */

export const STICKERS = [
  { id: "liftoff", label: "Liftoff" },
  { id: "hello", label: "Hello from orbit" },
  { id: "ship-it", label: "Ship it" },
  { id: "gg", label: "Good game" },
  { id: "thinking", label: "Thinking" },
  { id: "on-fire", label: "Supernova" },
  { id: "thanks", label: "Thanks, star" },
  { id: "bug", label: "Space bug" },
  { id: "coffee", label: "Coffee break" },
  { id: "deploy", label: "Deployed" },
  { id: "lost", label: "Lost in space" },
  { id: "love", label: "Love planet" },
] as const

export type StickerId = (typeof STICKERS)[number]["id"]
export const stickerBody = (id: StickerId) => `:sticker:${id}:`
export function stickerOf(body: string): StickerId | null {
  const m = /^:sticker:([a-z-]+):$/.exec(body.trim())
  return m && STICKERS.some((s) => s.id === m[1]) ? (m[1] as StickerId) : null
}
export const stickerLabel = (id: string) => STICKERS.find((s) => s.id === id)?.label ?? "Sticker"

/** One sticker, drawn at `size` pixels. */
export function Sticker({ id, size = 120, className }: { id: StickerId; size?: number; className?: string }) {
  const uid = useId().replace(/:/g, "")
  const g = (n: string) => `${uid}-${n}`
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} role="img" aria-label={stickerLabel(id)} className={cn("shrink-0 select-none", className)}>
      <defs>
        <radialGradient id={g("ion")} cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#dbe6ff" />
          <stop offset="55%" stopColor="#8fb4ff" />
          <stop offset="100%" stopColor="#2c3f7a" />
        </radialGradient>
        <radialGradient id={g("gold")} cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#fff2cc" />
          <stop offset="55%" stopColor="#f4c56a" />
          <stop offset="100%" stopColor="#7a5216" />
        </radialGradient>
        <radialGradient id={g("rose")} cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#ffe0ea" />
          <stop offset="55%" stopColor="#ff8fb1" />
          <stop offset="100%" stopColor="#7a2443" />
        </radialGradient>
        <radialGradient id={g("violet")} cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#ece4ff" />
          <stop offset="55%" stopColor="#b49cff" />
          <stop offset="100%" stopColor="#3d2a7a" />
        </radialGradient>
      </defs>
      <circle cx="60" cy="60" r="56" fill="#0b0f1c" stroke="rgba(255,255,255,0.12)" strokeWidth="2" />
      <g fill="#fff" opacity="0.7">
        <circle cx="22" cy="30" r="1.2" />
        <circle cx="96" cy="22" r="1" />
        <circle cx="100" cy="86" r="1.3" />
        <circle cx="18" cy="84" r="0.9" />
      </g>
      <Art id={id} g={g} />
    </svg>
  )
}

function Label({ text, y = 104 }: { text: string; y?: number }) {
  return (
    <text x="60" y={y} textAnchor="middle" fontSize="12" fontWeight="700" fill="#fff" fontFamily="ui-sans-serif, system-ui" letterSpacing="0.5">
      {text}
    </text>
  )
}

function Art({ id, g }: { id: StickerId; g: (n: string) => string }) {
  switch (id) {
    case "liftoff":
      return (
        <g>
          <path d="M60 18c12 10 16 26 12 44H48c-4-18 0-34 12-44z" fill="#e9ebf1" />
          <circle cx="60" cy="40" r="6" fill={`url(#${g("ion")})`} stroke="#0b0f1c" strokeWidth="2" />
          <path d="M48 56l-9 12h11zM72 56l9 12H70z" fill="#ff8fb1" />
          <path d="M52 64h16l-4 14c-2 6-6 6-8 0z" fill="#f4c56a" />
          <path d="M56 66h8l-2 9c-1 3-3 3-4 0z" fill="#fff2cc" />
          <Label text="LIFTOFF" y={98} />
        </g>
      )
    case "hello":
      return (
        <g>
          <circle cx="60" cy="54" r="24" fill={`url(#${g("ion")})`} />
          <ellipse cx="60" cy="54" rx="40" ry="10" fill="none" stroke="#dbe6ff" strokeOpacity="0.7" strokeWidth="2" transform="rotate(-18 60 54)" />
          <path d="M84 30c4-4 9-3 10 1M88 24c6-5 13-3 14 3" stroke="#f4c56a" strokeWidth="3" strokeLinecap="round" fill="none" />
          <Label text="HELLO!" />
        </g>
      )
    case "ship-it":
      return (
        <g>
          <path d="M28 70h64l-8 14H36z" fill="#8fb4ff" />
          <rect x="56" y="30" width="3" height="40" fill="#e9ebf1" />
          <path d="M59 32l22 18H59z" fill="#5fd3c6" />
          <path d="M56 38L38 60h18z" fill="#f4c56a" />
          <path d="M20 90c10-4 20 4 30 0s20-4 30 0 20 4 20 0" stroke="#7cc7ff" strokeWidth="3" fill="none" strokeLinecap="round" />
          <Label text="SHIP IT" y={110} />
        </g>
      )
    case "gg":
      return (
        <g>
          <path d="M60 20l8 18 20 2-15 13 5 20-18-10-18 10 5-20-15-13 20-2z" fill={`url(#${g("gold")})`} />
          <Label text="GG" y={98} />
        </g>
      )
    case "thinking":
      return (
        <g>
          <circle cx="56" cy="62" r="24" fill={`url(#${g("violet")})`} />
          <circle cx="48" cy="58" r="3" fill="#0b0f1c" />
          <circle cx="62" cy="58" r="3" fill="#0b0f1c" />
          <path d="M48 72h14" stroke="#0b0f1c" strokeWidth="3" strokeLinecap="round" />
          <circle cx="82" cy="36" r="4" fill="#e9ebf1" />
          <circle cx="92" cy="26" r="6" fill="#e9ebf1" />
          <Label text="HMM…" />
        </g>
      )
    case "on-fire":
      return (
        <g>
          {Array.from({ length: 12 }, (_, i) => (
            <path key={i} d="M60 60L60 18" stroke={i % 2 ? "#ff8fb1" : "#f4c56a"} strokeWidth="4" strokeLinecap="round" transform={`rotate(${i * 30} 60 60)`} />
          ))}
          <circle cx="60" cy="60" r="18" fill={`url(#${g("gold")})`} />
          <Label text="SUPERNOVA" y={108} />
        </g>
      )
    case "thanks":
      return (
        <g>
          <path d="M60 22l9 20 22 2-17 14 6 21-20-12-20 12 6-21-17-14 22-2z" fill={`url(#${g("rose")})`} />
          <path d="M52 56q8 8 16 0" stroke="#0b0f1c" strokeWidth="3" fill="none" strokeLinecap="round" />
          <Label text="THANKS!" />
        </g>
      )
    case "bug":
      return (
        <g>
          <ellipse cx="60" cy="62" rx="16" ry="22" fill="#5fd3c6" />
          <circle cx="60" cy="38" r="10" fill="#2f8f85" />
          <path d="M44 54l-12-6M44 66H30M44 78l-12 6M76 54l12-6M76 66h14M76 78l12 6M54 30l-6-10M66 30l6-10" stroke="#5fd3c6" strokeWidth="3" strokeLinecap="round" />
          <path d="M60 42v42" stroke="#0b0f1c" strokeWidth="2" />
          <Label text="FOUND A BUG" y={106} />
        </g>
      )
    case "coffee":
      return (
        <g>
          <path d="M36 46h40v26c0 10-8 16-20 16s-20-6-20-16z" fill="#e9ebf1" />
          <path d="M76 52h6c6 0 6 14 0 14h-6" stroke="#e9ebf1" strokeWidth="4" fill="none" />
          <ellipse cx="56" cy="47" rx="18" ry="3" fill="#7a5216" />
          <path d="M48 38c-3-5 3-7 0-12M58 38c-3-5 3-7 0-12M68 38c-3-5 3-7 0-12" stroke="#8fb4ff" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <Label text="BRB" y={106} />
        </g>
      )
    case "deploy":
      return (
        <g>
          <circle cx="60" cy="56" r="26" fill="none" stroke="#7fe0a6" strokeWidth="6" />
          <path d="M47 57l9 9 18-20" stroke="#7fe0a6" strokeWidth="7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <Label text="DEPLOYED" />
        </g>
      )
    case "lost":
      return (
        <g>
          <circle cx="60" cy="54" r="20" fill="#e9ebf1" />
          <rect x="47" y="46" width="26" height="14" rx="7" fill={`url(#${g("ion")})`} />
          <path d="M44 72l-6 14M76 72l6 14M42 50l-12 6M78 50l12-8" stroke="#e9ebf1" strokeWidth="6" strokeLinecap="round" />
          <path d="M88 40c6 8 8 20 4 30" stroke="#f4c56a" strokeWidth="2" strokeDasharray="3 4" fill="none" />
          <Label text="LOST IN SPACE" y={106} />
        </g>
      )
    case "love":
      return (
        <g>
          <circle cx="60" cy="56" r="22" fill={`url(#${g("rose")})`} />
          <ellipse cx="60" cy="56" rx="38" ry="9" fill="none" stroke="#ffe0ea" strokeOpacity="0.8" strokeWidth="2" transform="rotate(15 60 56)" />
          <path d="M60 66c-10-7-14-12-10-17 3-3 7-2 10 2 3-4 7-5 10-2 4 5 0 10-10 17z" fill="#fff" />
          <Label text="LOVE IT" />
        </g>
      )
  }
}
