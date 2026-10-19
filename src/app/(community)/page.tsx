import Image from "next/image"
import Link from "next/link"
import { Suspense } from "react"
import { Hero } from "@/components/hero/hero"
import { ConstellationCard } from "@/components/hub/cards"
import { ConstellationMap } from "@/components/hub/constellation-map"
import { BuilderWorlds, Close, DoToday, Head, HotInForum } from "@/components/home/sections"
import { Signal, SignalSkeleton } from "@/components/home/signal"
import { RiseObserver } from "@/components/home/rise"
import { ArenaToday, MissionsToday } from "@/components/home/today-widgets"
import { LaunchOfTheDay } from "@/components/launchpad/launch-of-the-day"
import { OnlineNow } from "@/components/presence/online-now"
import { TrendingBoard, type TrendItem } from "@/components/home/trending-board"
import { ago, constellations, KINDS, LANGUAGES, people, resourcePath, resources, resourcesOf, threads, trending, type ResourceKind } from "@/lib/data"

/*
 * The home page. Under the hero (the official N in its galaxy), one focus per section:
 *   Signal          today's briefing from GitHub, arXiv and the hub, with the launch of the day
 *   Trending        what the hub is liking this week
 *   Forum           the hottest threads, and who is online now
 *   Take part       open missions and duels
 *   Constellations  stacks people mapped
 *   Builders        members as planets
 *   Close           one thing to do
 */
export default function Home() {
  const kinds = Object.keys(KINDS) as ResourceKind[]
  const lists = Object.fromEntries(
    kinds.map((k) => [
      k,
      trending(resourcesOf(k))
        .slice(0, 7)
        .map((r): TrendItem => ({ slug: r.slug, name: r.name, owner: r.owner, summary: r.summary, kind: r.kind, task: r.task, likes: r.likes, updated: r.updated, href: resourcePath(r), ago: ago(r.updated) })),
    ])
  ) as Record<ResourceKind, TrendItem[]>
  const hot = trending(threads).slice(0, 6)
  const [map, ...moreConstellations] = constellations
  const builders = [...people].sort((a, b) => b.followers - a.followers).slice(0, 8)
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
  const counts = [
    { label: "Downloads this month", value: sum([...resourcesOf("model"), ...resourcesOf("dataset")].map((r) => r.reach)) },
    { label: "Monthly tool users", value: sum(resourcesOf("tool").map((r) => r.reach)) },
    { label: "Likes given", value: sum(resources.map((r) => r.likes)) },
    { label: "Forum views", value: sum(threads.map((t) => t.views)) },
    { label: "Builders followed", value: sum(people.map((p) => p.followers)) },
    { label: "Languages spoken", value: Object.keys(LANGUAGES).length },
  ]
  const langs = Object.values(LANGUAGES)

  return (
    <>
      <RiseObserver />
      <Hero counts={counts} />

      <div aria-hidden className="overflow-hidden border-b border-border py-4">
        <div className="marquee gap-10 pr-10 font-display text-2xl text-white/25">
          {[...langs, ...langs].map((l, i) => (
            <span key={i} className="whitespace-nowrap">
              {l.native} <span className="text-ion/40">✦</span>
            </span>
          ))}
        </div>
      </div>

      <Suspense fallback={<SignalSkeleton />}>
        <Signal launch={<LaunchOfTheDay />} />
      </Suspense>

      <section aria-labelledby="trend-h" className="shell mt-28 md:mt-36">
        <Head id="trend-h" title="Trending in the hub" lead="Ranked by likes, weighted toward what changed this week." href="/explore" action="Explore all" />
        <TrendingBoard lists={lists} />
      </section>

      <div className="mt-28 md:mt-36">
        <HotInForum threads={hot} online={<OnlineNow />} />
      </div>

      <div className="mt-28 md:mt-36">
        <DoToday missions={<MissionsToday />} arena={<ArenaToday />} />
      </div>

      <section aria-labelledby="const-h" className="relative isolate mt-28 overflow-hidden md:mt-36">
        <Image src="/space/deep-field.webp" alt="" fill sizes="100vw" className="fade-band -z-10 object-cover opacity-25" />
        <div className="shell grid grid-cols-1 gap-10 py-16 lg:grid-cols-[22rem_1fr] lg:items-center">
          <div className="flex flex-col gap-4">
            <Head id="const-h" title="Constellations" lead="A model alone is a star. Builders connect the model, the data, the tools and the code that make something work, and save it as a map anyone can follow." className="mb-0" />
            <div className="rise">
              <Link href={`/constellations/${map.slug}`} className="press flex flex-col gap-1 rounded-2xl bg-white/[0.04] p-4 hover:bg-white/[0.07]">
                <span className="text-lg font-semibold">{map.name}</span>
                <span className="text-sm text-muted-foreground">{map.goal}</span>
              </Link>
            </div>
            <Link href="/constellations" className="pressable self-start text-sm text-ion hover:underline">
              See every constellation →
            </Link>
          </div>
          <div className="rise rounded-3xl bg-card/60 p-2 md:p-4">
            <ConstellationMap c={map} />
          </div>
        </div>
        <ul className="shell flex snap-x snap-mandatory gap-4 overflow-x-auto pb-8 [scrollbar-width:none] md:grid md:grid-cols-2 md:overflow-visible lg:grid-cols-4">
          {moreConstellations.map((c, i) => (
            <li key={c.slug} className="rise w-[80%] shrink-0 snap-start md:w-auto" style={{ "--i": i } as React.CSSProperties}>
              <ConstellationCard c={c} className="h-full" />
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-24 md:mt-32">
        <BuilderWorlds handles={builders.map((p) => p.handle)} />
      </div>

      <div className="mt-28 md:mt-36">
        <Close />
      </div>
    </>
  )
}
