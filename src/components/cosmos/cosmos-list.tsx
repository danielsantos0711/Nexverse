import Link from "next/link"
import type { Route } from "next"
import { BookmarkIcon, HeartIcon, LocateFixedIcon } from "lucide-react"
import { fold, STAR_KINDS, type Cosmos, type Star, type StarKind } from "@/components/cosmos/model"
import { rise, riseDelay } from "@/components/forum/forum-ui"
import { Copy } from "@/components/content/copy"

/**
 * The map as a plain list, grouped by galaxy: for screen readers, keyboard users who prefer reading to flying, and
 * anyone with reduced motion. Same filters and search as the map.
 */
export function CosmosList({
  cosmos,
  kinds,
  query,
  liked,
  saved,
  onShow,
}: {
  cosmos: Cosmos
  kinds: Set<StarKind>
  query: string
  liked: Set<string>
  saved: Set<string>
  onShow: (id: string) => void
}) {
  const q = fold(query.trim())
  const keep = (s: Star) => (s.kind === "you" || kinds.has(s.kind)) && (!q || s.search.includes(q))
  const you = cosmos.byId.get("you")
  const groups = cosmos.galaxies
    .map((g) => ({ g, stars: cosmos.stars.filter((s) => s.galaxy === g.id && keep(s)).sort((a, b) => b.weight - a.weight) }))
    .filter((x) => x.stars.length)
  const total = groups.reduce((n, x) => n + x.stars.length, 0)

  return (
    <div className="flex flex-col gap-8">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {total ? `${total} ${total === 1 ? "star" : "stars"} in ${groups.length} ${groups.length === 1 ? "galaxy" : "galaxies"}` : "No stars match. Try another word or switch a filter back on."}
      </p>
      {you && keep(you) && (
        <section aria-labelledby="cosmos-list-you" className="flex flex-col gap-3">
          <h2 id="cosmos-list-you" className="text-sm font-semibold text-ion">
            <Copy k="cosmos.cosmos-list.where-you-are">Where you are</Copy>
          </h2>
          <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <Row star={you} liked={false} saved={false} onShow={onShow} i={0} />
          </ul>
        </section>
      )}
      {groups.map(({ g, stars }) => (
        <section key={g.id} aria-labelledby={`cosmos-list-${g.id}`} className="flex flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <h2 id={`cosmos-list-${g.id}`} className="text-sm font-semibold" style={{ color: g.tint }}>
              {g.name} <span className="font-normal text-muted-foreground">· {stars.length}</span>
            </h2>
            <p className="text-xs text-muted-foreground">{g.blurb}</p>
          </div>
          <ul className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {stars.map((s, i) => (
              <Row key={s.id} star={s} liked={liked.has(s.id)} saved={saved.has(s.id)} onShow={onShow} i={i} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function Row({ star, liked, saved, onShow, i }: { star: Star; liked: boolean; saved: boolean; onShow: (id: string) => void; i: number }) {
  const kind = STAR_KINDS[star.kind]
  return (
    <li className={`glass flex items-start gap-3 rounded-xl p-3 ${rise}`} style={riseDelay(i)}>
      <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: kind.color, boxShadow: `0 0 10px ${kind.color}` }} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {star.href ? (
          <Link data-nav-item href={star.href as Route} className="truncate text-sm font-medium hover:underline focus-visible:underline focus-visible:outline-none">
            {star.name}
          </Link>
        ) : (
          <span className="truncate text-sm font-medium">{star.name}</span>
        )}
        <span className="text-xs text-muted-foreground">
          {kind.label} · {star.meta}
        </span>
        <span className="line-clamp-2 text-xs text-foreground/75">{star.summary}</span>
        {(liked || saved) && (
          <span className="mt-1 flex gap-2 text-xs text-gold">
            {liked && (
              <span className="inline-flex items-center gap-1">
                <HeartIcon aria-hidden className="size-3" /> <Copy k="cosmos.cosmos-list.liked">Liked</Copy>
              </span>
            )}
            {saved && (
              <span className="inline-flex items-center gap-1">
                <BookmarkIcon aria-hidden className="size-3" /> <Copy k="cosmos.cosmos-list.saved">Saved</Copy>
              </span>
            )}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={() => onShow(star.id)}
        className="pressable grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        aria-label={`Show ${star.name} on the map`}
        title="Show on the map"
      >
        <LocateFixedIcon aria-hidden className="size-4" />
      </button>
    </li>
  )
}
