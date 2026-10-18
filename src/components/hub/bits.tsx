import Link from "next/link"
import { BoxIcon, DatabaseIcon, FolderGit2Icon, WrenchIcon, type LucideIcon } from "lucide-react"
import { compact, getPerson, KINDS, LANGUAGES, type LanguageCode, type ResourceKind } from "@/lib/data"
import { cn } from "@/lib/utils"

export const KIND_ICONS: Record<ResourceKind, LucideIcon> = {
  model: BoxIcon,
  dataset: DatabaseIcon,
  tool: WrenchIcon,
  repo: FolderGit2Icon,
}

const KIND_TEXT: Record<ResourceKind, string> = {
  model: "text-model",
  dataset: "text-dataset",
  tool: "text-tool",
  repo: "text-repo",
}

export const kindText = (kind: ResourceKind) => KIND_TEXT[kind]

export function KindTag({ kind, className }: { kind: ResourceKind; className?: string }) {
  const Icon = KIND_ICONS[kind]
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium", KIND_TEXT[kind], className)}>
      <Icon aria-hidden className="size-3.5" />
      {KINDS[kind].label}
    </span>
  )
}

export function LangTag({ lang, className }: { lang: LanguageCode; className?: string }) {
  return (
    <span
      title={LANGUAGES[lang]?.name}
      className={cn("rounded-md border border-border px-1.5 py-px font-mono text-[11px] text-muted-foreground uppercase", className)}
    >
      {lang}
    </span>
  )
}

export function Chip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground", className)}>
      {children}
    </span>
  )
}

/** Small seeded generator, so procedural art renders identically on the server and in the browser. */
export function seeded(seed: string) {
  let h = 2166136261
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return ((h ^= h >>> 16) >>> 0) / 4294967296
  }
}

const HUES = [222, 200, 245, 168, 32, 275, 190]

/** A person's or organisation's avatar: initials on a gradient drawn from their handle. */
export function PersonAvatar({ handle, size = 28, className }: { handle: string; size?: number; className?: string }) {
  const p = getPerson(handle)
  const r = seeded(handle)
  const h1 = HUES[Math.floor(r() * HUES.length)]
  const h2 = (h1 + 40 + r() * 60) % 360
  const name = p?.name ?? handle
  const letters = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: `linear-gradient(135deg, hsl(${h1} 60% 62%), hsl(${h2} 50% 30%))`,
      }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center font-semibold text-white/95 ring-1 ring-white/15 ring-inset",
        p?.org ? "rounded-[28%]" : "rounded-full",
        className
      )}
    >
      {letters.toUpperCase()}
    </span>
  )
}

export function PersonLink({ handle, className, avatar = 18 }: { handle: string; className?: string; avatar?: number | false }) {
  const p = getPerson(handle)
  return (
    <Link
      href={`/people/${handle}`}
      className={cn("relative z-10 inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground", className)}
    >
      {avatar !== false && <PersonAvatar handle={handle} size={avatar} />}
      <span className="truncate">{p?.name ?? handle}</span>
    </Link>
  )
}

/**
 * A cover drawn from the item's name: a field of light, an orbit and a scatter of stars, tinted by kind.
 * No two resources share one, and none needs an uploaded image.
 */
export function Cover({ seed, kind, className }: { seed: string; kind: ResourceKind | "news" | "thread"; className?: string }) {
  const r = seeded(seed)
  const tint: Record<string, string> = {
    model: "169 194 255",
    dataset: "159 227 207",
    tool: "233 199 154",
    repo: "211 180 255",
    news: "216 197 158",
    thread: "143 180 255",
  }
  const c = tint[kind]
  const cx = 20 + r() * 60
  const cy = 20 + r() * 60
  const rx = 30 + r() * 40
  const tilt = -30 + r() * 60
  const stars = Array.from({ length: 26 }, () => [r() * 100, r() * 100, 0.2 + r() * 0.7] as const)
  const id = `cv-${seed.replace(/[^a-z0-9]/gi, "")}`
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden className={cn("block size-full", className)}>
      <defs>
        <radialGradient id={`${id}-g`} cx={`${cx}%`} cy={`${cy}%`} r="70%">
          <stop offset="0%" stopColor={`rgb(${c} / 0.55)`} />
          <stop offset="45%" stopColor={`rgb(${c} / 0.12)`} />
          <stop offset="100%" stopColor="rgb(5 6 10 / 0)" />
        </radialGradient>
      </defs>
      <rect width="100" height="100" fill="#080a10" />
      <rect width="100" height="100" fill={`url(#${id}-g)`} />
      <g transform={`rotate(${tilt} ${cx} ${cy})`} fill="none" stroke={`rgb(${c} / 0.35)`} strokeWidth="0.4">
        <ellipse cx={cx} cy={cy} rx={rx} ry={rx * 0.32} />
        <ellipse cx={cx} cy={cy} rx={rx * 0.62} ry={rx * 0.2} strokeOpacity="0.6" />
      </g>
      <circle cx={cx} cy={cy} r={2.2 + r() * 2} fill={`rgb(${c})`} />
      {stars.map(([x, y, o], i) => (
        <circle key={i} cx={x} cy={y} r={o > 0.8 ? 0.55 : 0.3} fill="#fff" opacity={o} />
      ))}
    </svg>
  )
}

export function Stat({ icon: Icon, value, label }: { icon: LucideIcon; value: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 tabular" title={label}>
      <Icon aria-hidden className="size-3.5" />
      {compact(value)}
      <span className="sr-only"> {label}</span>
    </span>
  )
}

export function SectionHead({
  title,
  href,
  action = "See all",
  children,
  id,
}: {
  title: string
  href?: string
  action?: string
  children?: React.ReactNode
  id?: string
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="flex flex-col gap-1">
        <h2 id={id} className="text-xl font-semibold md:text-2xl">
          {title}
        </h2>
        {children}
      </div>
      {href && (
        <Link href={href} className="text-sm text-ion hover:underline">
          {action} →
        </Link>
      )}
    </div>
  )
}

export function PageTitle({
  eyebrow,
  title,
  lead,
  children,
}: {
  eyebrow?: React.ReactNode
  title: string
  lead?: string
  children?: React.ReactNode
}) {
  return (
    <header className="relative isolate flex flex-col gap-3 pt-10 pb-8 md:pt-14">
      <div aria-hidden className="pointer-events-none absolute -top-16 left-1/2 -z-10 h-72 w-screen -translate-x-1/2 bg-[radial-gradient(60%_70%_at_20%_0%,rgb(143_180_255/0.14),transparent_70%),radial-gradient(40%_60%_at_70%_10%,rgb(216_197_158/0.07),transparent_70%)]" />
      <div aria-hidden className="starfield left-1/2 -z-10 w-screen -translate-x-1/2 [mask-image:linear-gradient(to_bottom,black,transparent)]">
        <i />
        <i />
      </div>
      {eyebrow && <div className="text-sm text-muted-foreground">{eyebrow}</div>}
      <h1 className="text-3xl font-semibold tracking-[-0.03em] md:text-[2.75rem] md:leading-[1.05]">{title}</h1>
      {lead && <p className="max-w-[62ch] text-base text-muted-foreground">{lead}</p>}
      {children}
    </header>
  )
}
