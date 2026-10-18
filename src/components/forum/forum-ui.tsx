import Link from "next/link"
import { CheckCircle2Icon, ChevronRightIcon, PinIcon } from "lucide-react"
import { PersonAvatar } from "@/components/hub/bits"
import type { Poster } from "@/components/forum/topics"
import { cn } from "@/lib/utils"

/** A member's initials on a soft gradient. Members have no handle, so their name is all there is. */
export function MemberAvatar({ name, size = 28, className }: { name?: string; size?: number; className?: string }) {
  const letters = (name ?? "You")
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#8fb4ff] to-[#2a3550] font-semibold text-white ring-1 ring-white/15 ring-inset",
        className
      )}
    >
      {letters}
    </span>
  )
}

export function PosterAvatar({ poster, size = 24, className }: { poster: Poster; size?: number; className?: string }) {
  return poster.handle ? <PersonAvatar handle={poster.handle} size={size} className={className} /> : <MemberAvatar name={poster.name} size={size} className={className} />
}

export type Crumb = { label: string; href?: string }

/** Forum › Group › Category. The last crumb is the current page. */
export function Breadcrumbs({ items, className }: { items: Crumb[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={cn("min-w-0 text-sm text-muted-foreground", className)}>
      <ol className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
        {items.map((c, i) => {
          const last = i === items.length - 1
          return (
            <li key={`${c.label}-${i}`} className={cn("flex min-w-0 items-center gap-1.5", last && "flex-1")}>
              {i > 0 && <ChevronRightIcon aria-hidden className="size-3.5 shrink-0 opacity-60" />}
              {c.href && !last ? (
                <Link href={c.href} className="rounded-sm whitespace-nowrap transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                  {c.label}
                </Link>
              ) : (
                <span aria-current={last ? "page" : undefined} className={cn("truncate", last && "text-foreground/80")}>
                  {c.label}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

export function SolvedBadge({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full bg-ok/10 px-2 py-0.5 text-xs font-medium text-ok", className)}>
      <CheckCircle2Icon aria-hidden className="size-3" /> Solved
    </span>
  )
}

export function PinnedBadge({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full bg-gold/10 px-2 py-0.5 text-xs font-medium text-gold", className)}>
      <PinIcon aria-hidden className="size-3" /> Pinned
    </span>
  )
}

/** Rows rise in one after another the first time a list appears (CSS only, so it costs nothing without script). */
export const rise = "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-300 motion-safe:fill-mode-both"
export const riseDelay = (i: number) => ({ animationDelay: `${Math.min(i, 12) * 35}ms` })

/** The forum's buttons, so every "Start a thread" looks the same. */
export const primaryButton =
  "pressable inline-flex h-9 items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground transition-[filter] hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
