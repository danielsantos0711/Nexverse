"use client"

import { useId } from "react"
import { CheckIcon, ImageIcon } from "lucide-react"
import { seeded } from "@/components/hub/bits"
import { Input } from "@/components/ui/input"
import { ACCENT_ORDER, ACCENTS, accentRgb, COVER_PATTERNS, isCoverImage, parseCover, type Accent, type CoverPattern } from "@/lib/missions-look"
import { cn } from "@/lib/utils"

/**
 * A mission's (or a member space's) cover: their image, one of the site's drawn patterns, or, when nothing was
 * picked, a pattern chosen from the id. Patterns are SVG tinted by the accent, so they cost nothing to load.
 */
export function SpaceCover({ seed, cover, accent, className, children }: { seed: string; cover: string | null; accent: string; className?: string; children?: React.ReactNode }) {
  const parsed = parseCover(cover)
  const rgb = accentRgb(accent)
  const pattern: CoverPattern = parsed && "pattern" in parsed ? parsed.pattern : COVER_PATTERNS[Math.floor(seeded(`cover:${seed}`)() * COVER_PATTERNS.length)].id
  return (
    <div className={cn("relative overflow-hidden bg-[#07080d]", className)}>
      {parsed && "image" in parsed ? (
        // eslint-disable-next-line @next/next/no-img-element -- member-chosen https images from any host
        <img src={parsed.image} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="absolute inset-0 size-full object-cover" />
      ) : (
        <Pattern id={pattern} seed={seed} rgb={rgb} />
      )}
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: `linear-gradient(180deg, transparent 35%, rgb(7 8 13 / 0.75)), radial-gradient(120% 90% at 0% 0%, rgb(${rgb} / 0.18), transparent 60%)` }} />
      {children}
    </div>
  )
}

function Pattern({ id, seed, rgb }: { id: CoverPattern; seed: string; rgb: string }) {
  const uid = useId().replace(/:/g, "")
  const r = seeded(`${id}:${seed}`)
  const stars = Array.from({ length: 34 }, () => [r() * 200, r() * 100, 0.2 + r() * 0.7] as const)
  const c = (a: number) => `rgb(${rgb} / ${a})`
  return (
    <svg aria-hidden viewBox="0 0 200 100" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 size-full">
      <defs>
        <radialGradient id={`${uid}-g`} cx={`${20 + r() * 60}%`} cy={`${20 + r() * 50}%`} r="75%">
          <stop offset="0%" stopColor={c(0.5)} />
          <stop offset="50%" stopColor={c(0.1)} />
          <stop offset="100%" stopColor="rgb(7 8 13 / 0)" />
        </radialGradient>
        <linearGradient id={`${uid}-l`} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor={c(0.55)} />
          <stop offset="100%" stopColor={c(0)} />
        </linearGradient>
      </defs>
      <rect width="200" height="100" fill={`url(#${uid}-g)`} />
      {id === "orbit" && (
        <g fill="none" stroke={c(0.4)} strokeWidth="0.5" transform={`rotate(${-18 + r() * 36} 100 50)`}>
          <ellipse cx="100" cy="50" rx="80" ry="22" />
          <ellipse cx="100" cy="50" rx="52" ry="14" strokeOpacity="0.6" />
          <circle cx="100" cy="50" r="7" fill={c(0.9)} stroke="none" />
          <circle cx="152" cy="50" r="2" fill="#fff" stroke="none" />
        </g>
      )}
      {id === "rings" &&
        Array.from({ length: 7 }, (_, i) => <circle key={i} cx={40 + r() * 120} cy={50} r={12 + i * 11} fill="none" stroke={c(0.32 - i * 0.035)} strokeWidth="0.6" />)}
      {id === "aurora" &&
        Array.from({ length: 4 }, (_, i) => {
          const y = 20 + i * 14 + r() * 8
          return <path key={i} d={`M0 ${y} C 50 ${y - 18 - r() * 10}, 120 ${y + 22}, 200 ${y - 6}`} fill="none" stroke={`url(#${uid}-l)`} strokeWidth={6 - i} strokeLinecap="round" opacity={0.8 - i * 0.15} />
        })}
      {id === "grid" && (
        <g stroke={c(0.18)} strokeWidth="0.3">
          {Array.from({ length: 11 }, (_, i) => (
            <line key={`v${i}`} x1={i * 20} x2={i * 20} y1="0" y2="100" />
          ))}
          {Array.from({ length: 6 }, (_, i) => (
            <line key={`h${i}`} x1="0" x2="200" y1={i * 20} y2={i * 20} />
          ))}
          <polyline points={Array.from({ length: 6 }, () => `${(r() * 200).toFixed(1)},${(r() * 100).toFixed(1)}`).join(" ")} fill="none" stroke={c(0.7)} strokeWidth="0.6" />
        </g>
      )}
      {id === "dunes" &&
        Array.from({ length: 5 }, (_, i) => {
          const y = 45 + i * 12
          return <path key={i} d={`M0 ${y} Q 50 ${y - 14 - r() * 8} 100 ${y} T 200 ${y} V100 H0Z`} fill={c(0.08 + i * 0.05)} />
        })}
      {id === "nebula" &&
        Array.from({ length: 5 }, (_, i) => <ellipse key={i} cx={30 + r() * 140} cy={20 + r() * 60} rx={20 + r() * 40} ry={8 + r() * 18} fill={c(0.08 + r() * 0.1)} transform={`rotate(${-30 + r() * 60})`} />)}
      {stars.map(([x, y, o], i) => (
        <circle key={i} cx={x} cy={y} r={o > 0.8 ? 0.6 : 0.3} fill="#fff" opacity={o} />
      ))}
    </svg>
  )
}

/** Pick a cover (a pattern or an image link) and an accent. Used by new missions, the mission editor and profiles. */
export function LookPicker({
  seed,
  cover,
  accent,
  onCover,
  onAccent,
  error,
}: {
  seed: string
  cover: string | null
  accent: Accent
  onCover: (c: string | null) => void
  onAccent: (a: Accent) => void
  error?: string
}) {
  const image = cover && !cover.startsWith("pattern:") ? cover : ""
  return (
    <div className="flex flex-col gap-3">
      <div role="radiogroup" aria-label="Cover" className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {COVER_PATTERNS.map((p) => {
          const on = cover === `pattern:${p.id}`
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={p.label}
              onClick={() => onCover(`pattern:${p.id}`)}
              className={cn("pressable group relative overflow-hidden rounded-lg border transition-[border-color,transform] duration-200 ease-out hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none", on ? "border-white/60" : "border-border")}
            >
              <SpaceCover seed={seed} cover={`pattern:${p.id}`} accent={accent} className="aspect-[2/1]" />
              <span className="absolute inset-x-0 bottom-0 px-1.5 pb-1 text-left text-[10px] text-white/80">{p.label}</span>
              {on && (
                <span className="absolute top-1 right-1 grid size-4 place-items-center rounded-full bg-white text-black">
                  <CheckIcon aria-hidden className="size-3" />
                </span>
              )}
            </button>
          )
        })}
      </div>
      <label className="flex items-center gap-2">
        <ImageIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <span className="sr-only">Or an image link</span>
        <Input
          value={image}
          placeholder="Or paste an https:// image link"
          onChange={(e) => {
            const v = e.target.value.trim()
            onCover(v ? v : null)
          }}
          aria-invalid={image && !isCoverImage(image) ? true : undefined}
        />
      </label>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div role="radiogroup" aria-label="Accent colour" className="flex flex-wrap gap-2">
        {ACCENT_ORDER.map((a) => {
          const on = a === accent
          return (
            <button
              key={a}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={ACCENTS[a].label}
              title={ACCENTS[a].label}
              onClick={() => onAccent(a)}
              className={cn("pressable grid size-8 place-items-center rounded-full border-2 transition-transform duration-150 ease-out hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none", on ? "border-white" : "border-transparent")}
              style={{ background: `rgb(${ACCENTS[a].rgb})` }}
            >
              {on && <CheckIcon aria-hidden className="size-4 text-black" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}
