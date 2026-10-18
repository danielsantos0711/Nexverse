import Image from "next/image"
import Link from "next/link"
import { Hero } from "@/components/hero/hero"
import { categoryIcon } from "@/components/forum/category-icon"
import { SectionHead } from "@/components/hub/bits"
import { ConstellationCard, FeatureCard, NewsCard, PersonCard, ThreadRow } from "@/components/hub/cards"
import { ConstellationMap } from "@/components/hub/constellation-map"
import { Item, Magnetic, Stagger } from "@/components/hub/motion"
import { Pulse, type PulseEvent } from "@/components/hub/pulse"
import { Spaces } from "@/components/hub/spaces"
import { TrendingTabs } from "@/components/hub/trending"
import {
  categories,
  constellations,
  KINDS,
  LANGUAGES,
  news,
  people,
  resourcePath,
  resources,
  resourcesOf,
  threads,
  threadsIn,
  threadTitle,
  trending,
  type ResourceKind,
} from "@/lib/data"

function pulseEvents(): PulseEvent[] {
  const ev: PulseEvent[] = []
  const rs = trending(resources)
  const ts = trending(threads)
  for (let i = 0; i < 6; i++) {
    const r = rs[i]
    ev.push({ who: r.owner, verb: r.kind === "repo" ? "pushed to" : "updated", what: r.name, href: resourcePath(r) })
    const t = ts[i]
    const reply = t.replies.at(-1)
    if (reply) ev.push({ who: reply.author, verb: "replied in", what: threadTitle(t), href: `/forum/${t.id}` })
    const n = news[i % news.length]
    if (i < 4) ev.push({ who: n.by, verb: "shared", what: n.title, href: `/news/${n.id}` })
    const c = constellations[i % constellations.length]
    if (i < 3) ev.push({ who: people[(i * 5) % 12].handle, verb: "saved the constellation", what: c.name, href: `/constellations/${c.slug}` })
  }
  return ev
}

export default function Home() {
  const lists = Object.fromEntries((Object.keys(KINDS) as ResourceKind[]).map((k) => [k, trending(resourcesOf(k)).slice(0, 8)])) as Record<ResourceKind, (typeof resources)[number][]>
  const hot = trending(threads).slice(0, 6)
  const [lead, ...restNews] = [...news].sort((a, b) => b.votes - a.votes)
  const featured = resources.filter((r) => r.featured).slice(0, 4)
  const [hero, ...moreConstellations] = constellations
  const creators = [...people].sort((a, b) => b.followers - a.followers).slice(0, 9)
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

      <Spaces
        data={{
          kinds: Object.fromEntries((Object.keys(KINDS) as ResourceKind[]).map((k) => [k, resourcesOf(k).length])) as Record<ResourceKind, number>,
          top: trending(resources)
            .slice(0, 9)
            .map((r) => ({ name: r.name, href: resourcePath(r), kind: r.kind })),
          threads: trending(threads).slice(0, 8).map(threadTitle),
          threadCount: threads.length,
          rooms: ["general", "local-ai", "agents"],
          news: [lead.title],
          constellations: constellations.length,
        }}
      />

      <section aria-labelledby="trend-h" className="shell grid grid-cols-1 gap-10 pt-16 lg:grid-cols-[1fr_22rem]">
        <div className="min-w-0">
          <SectionHead id="trend-h" title="Trending this week" href="/explore" action="Explore all">
            <p className="text-sm text-muted-foreground">Ranked by likes, weighted toward what changed recently.</p>
          </SectionHead>
          <TrendingTabs lists={lists} />
        </div>
        <aside aria-labelledby="pulse-h" className="glass self-start rounded-2xl p-4 lg:sticky lg:top-20">
          <h2 id="pulse-h" className="mb-3 flex items-center gap-2 px-2 font-sans text-sm font-medium tracking-normal">
            <span className="pulse-dot" aria-hidden /> Pulse
            <span className="ml-auto text-xs font-normal text-muted-foreground">What people are doing</span>
          </h2>
          <Pulse events={pulseEvents()} size={8} />
        </aside>
      </section>

      <section aria-labelledby="const-h" className="relative mt-24 overflow-hidden border-y border-border">
        <Image src="/space/deep-field.webp" alt="" fill sizes="100vw" className="-z-10 object-cover opacity-30" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-background via-background/70 to-background" />
        <div className="shell grid grid-cols-1 gap-10 py-16 lg:grid-cols-[22rem_1fr] lg:items-center">
          <div className="flex flex-col gap-4">
            <p className="text-sm text-gold">Only on Nexverse</p>
            <h2 id="const-h" className="text-3xl font-semibold tracking-[-0.03em] md:text-4xl">
              Constellations
            </h2>
            <p className="text-muted-foreground">
              A model alone is a star. Builders connect the model, the data, the tools and the code that make something work, and save it as a map anyone can follow.
            </p>
            <div className="glass mt-2 flex flex-col gap-1 rounded-xl p-4">
              <Link href={`/constellations/${hero.slug}`} className="text-lg font-semibold hover:underline">
                {hero.name}
              </Link>
              <p className="text-sm text-muted-foreground">{hero.goal}</p>
            </div>
            <Link href="/constellations" className="text-sm text-ion hover:underline">
              See every constellation →
            </Link>
          </div>
          <div className="glass rounded-3xl p-2 md:p-4">
            <ConstellationMap c={hero} />
          </div>
        </div>
        <Stagger className="shell grid gap-4 pb-16 md:grid-cols-2 lg:grid-cols-4">
          {moreConstellations.map((c) => (
            <Item key={c.slug}>
              <ConstellationCard c={c} className="h-full" />
            </Item>
          ))}
        </Stagger>
      </section>

      <section aria-labelledby="forum-h" className="shell mt-24 grid grid-cols-1 gap-10 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0">
          <SectionHead id="forum-h" title="Hot in the forum" href="/forum" action="Open the forum">
            <p className="text-sm text-muted-foreground">Ask in any language. Every thread has a translation one click away.</p>
          </SectionHead>
          <Stagger as="ol" className="flex flex-col gap-1">
            {hot.map((t) => (
              <Item as="li" key={t.id}>
                <ThreadRow t={t} />
              </Item>
            ))}
          </Stagger>
        </div>
        <aside aria-labelledby="cats-h" className="flex flex-col gap-3">
          <h2 id="cats-h" className="font-sans text-sm font-medium tracking-normal text-muted-foreground">
            Categories
          </h2>
          <ul className="grid grid-cols-2 gap-2">
            {categories.map((c) => {
              const Icon = categoryIcon(c.icon)
              return (
                <li key={c.slug}>
                  <Link href={`/forum?c=${c.slug}`} className="pressable flex h-full flex-col gap-1.5 rounded-xl border border-border bg-card/70 p-3 transition-colors hover:border-ion/40 hover:bg-card">
                    <Icon aria-hidden className="size-4 text-ion" />
                    <span className="text-sm font-medium">{c.name}</span>
                    <span className="text-xs text-muted-foreground tabular">{threadsIn(c.slug).length} threads</span>
                  </Link>
                </li>
              )
            })}
          </ul>
          <Link href="/forum/new" className="pressable mt-1 inline-flex h-10 items-center justify-center rounded-full bg-secondary text-sm font-medium hover:bg-accent">
            Start a thread
          </Link>
        </aside>
      </section>

      <section aria-labelledby="news-h" className="shell mt-24">
        <SectionHead id="news-h" title="News, with the reason it matters" href="/news" action="All news" />
        <div className="grid gap-4 lg:grid-cols-2">
          <NewsCard n={lead} big />
          <Stagger as="ul" className="flex flex-col gap-3">
            {restNews.slice(0, 4).map((n) => (
              <Item as="li" key={n.id}>
                <NewsCard n={n} />
              </Item>
            ))}
          </Stagger>
        </div>
      </section>

      <section aria-labelledby="picks-h" className="shell mt-24">
        <SectionHead id="picks-h" title="Community picks" href="/explore?sort=likes">
          <p className="text-sm text-muted-foreground">Chosen by the people who use them most.</p>
        </SectionHead>
        <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {featured.map((r) => (
            <Item key={r.slug}>
              <FeatureCard r={r} className="h-full" />
            </Item>
          ))}
        </Stagger>
      </section>

      <section aria-labelledby="people-h" className="shell mt-24">
        <SectionHead id="people-h" title="Builders to follow" href="/people" action="Everyone" />
        <Stagger className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {creators.map((p) => (
            <Item key={p.handle}>
              <PersonCard handle={p.handle} />
            </Item>
          ))}
        </Stagger>
      </section>

      <section aria-labelledby="join-h" className="shell mt-28">
        <div className="relative isolate overflow-hidden rounded-3xl border border-border px-6 py-16 md:px-14 md:py-24">
          <Image src="/space/cliffs.webp" alt="" fill sizes="100vw" className="-z-10 object-cover" />
          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-background via-background/80 to-background/10" />
          <div className="flex max-w-xl flex-col items-start gap-5">
            <h2 id="join-h" className="text-3xl font-semibold tracking-[-0.03em] md:text-5xl md:leading-[1.02]">
              Put your work in the sky.
            </h2>
            <p className="text-muted-foreground md:text-lg">Share a model, a dataset, a tool or a repo in under a minute. Others will find it, use it and connect it to theirs.</p>
            <div className="flex flex-wrap items-center gap-4">
              <Magnetic>
                <Link href="/share" className="pressable inline-flex h-12 items-center rounded-full bg-primary px-6 font-medium text-primary-foreground">
                  Share what you built
                </Link>
              </Magnetic>
              <Link href="/sign-in" className="text-sm text-muted-foreground hover:text-foreground">
                Or sign in with your email →
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
