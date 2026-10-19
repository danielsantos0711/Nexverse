import Link from "next/link"
import { UsersIcon } from "lucide-react"
import { CrewBadges, CrewEmblem } from "@/components/crews/emblem"
import { ROLE_LABEL, type Crew, type Standing } from "@/lib/crews"
import { cn } from "@/lib/utils"

/** A crew in a grid: emblem, name, what it is about, its topics and how many people are in it. */
export function CrewCard({ crew, standing, className }: { crew: Crew; standing?: Standing; className?: string }) {
  return (
    <article
      className={cn(
        "group relative flex h-full flex-col gap-3 rounded-xl border border-border bg-card/40 p-4 transition-[background-color,transform] duration-200 hover:-translate-y-0.5 hover:bg-white/[0.03] motion-reduce:transform-none",
        className
      )}
    >
      <div className="flex items-start gap-3">
        <CrewEmblem icon={crew.icon} color={crew.color} size={44} className="transition-transform duration-300 group-hover:rotate-[-6deg] motion-reduce:transform-none" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3 className="font-sans text-base leading-snug font-semibold tracking-normal">
            <Link
              href={`/crews/${crew.slug}`}
              className="rounded-sm after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring group-hover:text-ion"
            >
              {crew.name}
            </Link>
          </h3>
          <CrewBadges crew={crew} />
        </div>
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
          {crew.memberCount} {crew.memberCount === 1 ? "member" : "members"}
        </span>
        {standing?.role ? (
          <span className="rounded-full bg-ion/10 px-2 py-0.5 text-ion">{standing.role === "member" ? "You’re in" : ROLE_LABEL[standing.role]}</span>
        ) : standing?.requested ? (
          <span className="rounded-full bg-gold/10 px-2 py-0.5 text-gold">Request sent</span>
        ) : null}
      </div>
    </article>
  )
}
