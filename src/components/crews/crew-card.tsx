import Link from "next/link"
import { UsersIcon } from "lucide-react"
import { BorderGlow } from "@/components/crews/border-glow"
import { CrewBanner } from "@/components/crews/crew-banner"
import { CrewBadges, CrewEmblem } from "@/components/crews/emblem"
import { crewTint, ROLE_LABEL, type Crew, type Standing } from "@/lib/crews"
import { cn } from "@/lib/utils"
import { Copy } from "@/components/content/copy"

/** A crew in a grid: its banner, sigil or emblem, name, motto, topics and how many people are aboard. */
export function CrewCard({ crew, standing, className }: { crew: Crew; standing?: Standing; className?: string }) {
  const tint = crewTint(crew)
  return (
    <BorderGlow tint={tint} className={cn("h-full", className)}>
      <article className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card transition-transform duration-200 hover:-translate-y-0.5 motion-reduce:transform-none">
        <CrewBanner banner={crew.banner} tint={tint} seed={crew.slug} className="h-24" />
        <div className="relative flex flex-1 flex-col gap-3 px-4 pb-4">
          <div className="-mt-7 flex items-end gap-3">
            {crew.sigil ? (
              <span
                aria-hidden
                className="grid size-14 shrink-0 place-items-center rounded-2xl border border-white/10 bg-card text-2xl shadow-lg shadow-black/40 transition-transform duration-300 group-hover:rotate-[-6deg] motion-reduce:transform-none"
                style={{ boxShadow: `0 0 0 3px var(--card), 0 8px 24px -8px color-mix(in oklab, ${tint} 60%, transparent)` }}
              >
                {crew.sigil}
              </span>
            ) : (
              <span className="rounded-2xl ring-[3px] ring-card">
                <CrewEmblem icon={crew.icon} color={crew.color} size={56} className="transition-transform duration-300 group-hover:rotate-[-6deg] motion-reduce:transform-none" />
              </span>
            )}
            <CrewBadges crew={crew} className="mb-1" />
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <h3 className="font-sans text-base leading-snug font-semibold tracking-normal">
              <Link
                href={`/crews/${crew.slug}`}
                className="rounded-sm after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
              >
                {crew.name}
              </Link>
            </h3>
            {crew.motto && <p className="line-clamp-1 text-xs italic" style={{ color: `color-mix(in oklab, ${tint} 75%, white)` }}>{crew.motto}</p>}
          </div>
          {crew.blurb && <p className="line-clamp-2 text-sm text-muted-foreground">{crew.blurb}</p>}
          {crew.tags.length > 0 && (
            <ul className="flex flex-wrap gap-1.5" aria-label="Topics">
              {crew.tags.slice(0, 4).map((t) => (
                <li key={t} className="rounded-md bg-secondary/70 px-1.5 py-0.5 text-xs text-muted-foreground">
                  #{t}
                </li>
              ))}
              {crew.tags.length > 4 && <li className="px-1 text-xs text-muted-foreground">+{crew.tags.length - 4}</li>}
            </ul>
          )}
          <div className="mt-auto flex items-center justify-between gap-2 pt-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 tabular">
              <UsersIcon aria-hidden className="size-3.5" />
              {crew.memberCount} aboard
            </span>
            {standing?.role ? (
              <span className="rounded-full px-2 py-0.5" style={{ background: `color-mix(in oklab, ${tint} 14%, transparent)`, color: `color-mix(in oklab, ${tint} 80%, white)` }}>
                {standing.role === "member" ? "You’re aboard" : ROLE_LABEL[standing.role]}
              </span>
            ) : standing?.requested ? (
              <span className="rounded-full bg-gold/10 px-2 py-0.5 text-gold">
                <Copy k="crews.crew-card.request-sent">Request sent</Copy>
              </span>
            ) : null}
          </div>
        </div>
      </article>
    </BorderGlow>
  )
}
