import Link from "next/link"
import { BadgeCheckIcon, BookOpenTextIcon, CircleHelpIcon, FlagIcon, NewspaperIcon, SendIcon, SparklesIcon } from "lucide-react"
import { Copy } from "@/components/content/copy"
import { Item, Stagger } from "@/components/hub/motion"
import { PillTabs } from "@/components/live/pill-tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { NEWS_CATEGORIES, type CategoryNames, type Story } from "@/lib/newsroom"
import { latestStories, newsCategoryNames } from "@/lib/newsroom/public"
import { FeatureStory, StoryCard, StoryRow, TopStory } from "./story-card"

/*
 * The front of /news, laid out like a magazine: the "Nexverse Exclusive" across the top with its cover edge
 * to edge, two top stories with large covers and a column of the next ones, then every story by category
 * (the editors' names and order). Stories come from the newsroom (cached, refreshed on publish). With none
 * published yet the page says so plainly and explains how stories get here.
 */

function Grid({ stories, names, empty }: { stories: Story[]; names: CategoryNames; empty: string }) {
  if (!stories.length) return <p className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">{empty}</p>
  return (
    <Stagger as="ol" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" gap={0.04}>
      {stories.map((s) => (
        <Item as="li" key={s.id}>
          <StoryCard story={s} names={names} />
        </Item>
      ))}
    </Stagger>
  )
}

export async function NewsFront() {
  const [{ ok, items }, names] = await Promise.all([latestStories(60), newsCategoryNames()])

  if (!items.length) return <EmptyNewsroom unavailable={!ok} />

  const lead = items.find((s) => s.featured) ?? items[0]
  const rest = items.filter((s) => s.id !== lead.id)
  const top = rest.slice(0, 2)
  const next = rest.slice(2, 6)
  const deep = items.filter((s) => s.depth === "deep" && s.id !== lead.id).slice(0, 3)
  const order = NEWS_CATEGORIES.map((c) => c.id)
    .sort((a, b) => Object.keys(names).indexOf(a) - Object.keys(names).indexOf(b))
    .filter((id) => !names[id].hidden)

  return (
    <div className="flex flex-col gap-14">
      <FeatureStory story={lead} names={names} />

      {top.length > 0 && (
        <section aria-labelledby="top-h" className="flex flex-col gap-5">
          <h2 id="top-h" className="text-xl font-semibold md:text-2xl">
            <Copy k="news.front.top">Top stories</Copy>
          </h2>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_19rem]">
            {top.map((s) => (
              <TopStory key={s.id} story={s} names={names} />
            ))}
            {next.length > 0 && (
              <aside aria-label="More stories" className="flex flex-col sm:col-span-2 lg:col-span-1">
                <Copy k="news.front.latest" as="p" className="mb-1 text-sm font-medium text-muted-foreground">
                  Latest
                </Copy>
                <ol className="flex flex-col divide-y divide-border">
                  {next.map((s) => (
                    <li key={s.id}>
                      <StoryRow story={s} names={names} />
                    </li>
                  ))}
                </ol>
              </aside>
            )}
          </div>
        </section>
      )}

      {deep.length > 0 && (
        <section aria-labelledby="deep-h" className="liquid-glass relative overflow-hidden rounded-[2rem] p-5 md:p-8">
          <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 size-80 rounded-full border border-dashed border-gold/20 motion-safe:animate-[spin_140s_linear_infinite]" />
          <div className="mb-5 flex flex-col gap-1">
            <h2 id="deep-h" className="flex items-center gap-2 text-xl font-semibold md:text-2xl">
              <BookOpenTextIcon aria-hidden className="size-5 text-gold" />
              <Copy k="news.front.deep">In depth</Copy>
            </h2>
            <Copy k="news.front.deepLead" as="p" className="text-sm text-muted-foreground">
              Researched from several official sources, with every claim checked and cited.
            </Copy>
          </div>
          <Grid stories={deep} names={names} empty="" />
        </section>
      )}

      <section aria-labelledby="all-h" className="flex flex-col gap-5">
        <h2 id="all-h" className="text-xl font-semibold md:text-2xl">
          <Copy k="news.front.all">Every story</Copy>
        </h2>
        <PillTabs
          label="Categories"
          tabs={[
            { id: "all", label: "All", count: items.length, content: <Grid stories={items} names={names} empty="" /> },
            ...order.map((id) => {
              const c = names[id]
              const list = items.filter((s) => s.category === id)
              return {
                id,
                label: c.label,
                count: list.length,
                icon: id === "rumor" ? <CircleHelpIcon aria-hidden className="size-3.5" /> : undefined,
                content: (
                  <div className="flex flex-col gap-4">
                    <p className="text-sm text-muted-foreground">{c.blurb}</p>
                    <Grid stories={list} names={names} empty={`No ${c.label.toLowerCase()} stories yet. This corner of the sky is still waiting for its first star.`} />
                  </div>
                ),
              }
            }),
          ]}
        />
      </section>
    </div>
  )
}

function EmptyNewsroom({ unavailable }: { unavailable: boolean }) {
  return (
    <section aria-labelledby="empty-h" className="relative isolate overflow-hidden rounded-3xl border border-border bg-card/60 px-6 py-12 md:px-12 md:py-16">
      <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 -z-10 size-[26rem] rounded-full border border-dashed border-gold/20 motion-safe:animate-[spin_120s_linear_infinite]" />
      <div aria-hidden className="pointer-events-none absolute -top-8 -right-8 -z-10 size-[16rem] rounded-full border border-ion/15" />
      <span className="grid size-12 place-items-center rounded-2xl border border-gold/30 bg-gold/10 text-gold">
        <NewspaperIcon aria-hidden className="size-5" />
      </span>
      <h2 id="empty-h" className="mt-5 max-w-[30ch] text-2xl font-semibold tracking-[-0.02em] text-balance">
        {unavailable ? <Copy k="news.empty.offTitle">The newsroom is not switched on yet</Copy> : <Copy k="news.empty.title">The first story is still being written</Copy>}
      </h2>
      <p className="mt-3 max-w-[60ch] text-muted-foreground">
        {unavailable ? (
          <Copy k="news.empty.offBody" multiline>
            Nexverse&apos;s own news needs the newsroom part of the database, which is not set up on this copy of the site yet. Members&apos; shared stories below are not affected.
          </Copy>
        ) : (
          <Copy k="news.empty.body" multiline>
            Nexverse&apos;s newsroom reads official blogs, changelogs and releases every day and researches sourced stories from them. Each one is checked by an editor before it appears here. Nothing has been published yet.
          </Copy>
        )}
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        <a href="#tip" className="pressable inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
          <SendIcon aria-hidden className="size-4" /> <Copy k="news.empty.tip">Send the first tip</Copy>
        </a>
        <Link href="/share?kind=news" className="pressable inline-flex h-9 items-center rounded-full bg-white/[0.06] px-4 text-sm hover:bg-white/[0.1] focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
          <Copy k="news.empty.share">Share a story you read</Copy>
        </Link>
      </div>
    </section>
  )
}

/** How a story gets here, in four lines: the newsroom's promise to readers. */
export function HowWeReport() {
  const points = [
    { k: "sources", icon: BadgeCheckIcon, title: "Official sources only", body: "Vendor blogs, docs, release notes, papers and GitHub releases. Every claim is cited to the page it comes from." },
    { k: "checked", icon: SparklesIcon, title: "Researched with AI, checked twice", body: "A free AI model reads several official pages, keeps only facts it can quote, and a second pass checks every claim. An editor publishes." },
    { k: "rumours", icon: CircleHelpIcon, title: "Rumours are labelled", body: "Leaks and reports the company has not confirmed always carry an Unconfirmed badge." },
    { k: "corrections", icon: FlagIcon, title: "Corrections welcome", body: "Spot a mistake? Report the story and an editor will look at it." },
  ]
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {points.map((p) => (
        <li key={p.title} className="flex flex-col gap-1.5 rounded-2xl border border-border bg-card/40 p-4">
          <p.icon aria-hidden className="size-4 text-ion" />
          <Copy k={`news.how.${p.k}.title`} as="h3" className="text-sm font-medium">
            {p.title}
          </Copy>
          <Copy k={`news.how.${p.k}.body`} as="p" className="text-sm text-muted-foreground" multiline>
            {p.body}
          </Copy>
        </li>
      ))}
    </ul>
  )
}

export function NewsFrontSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading the news" className="flex flex-col gap-10">
      <Skeleton className="aspect-[4/5] rounded-[2rem] sm:aspect-[16/10] lg:aspect-[21/9]" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_19rem]">
        <Skeleton className="h-80 rounded-3xl" />
        <Skeleton className="h-80 rounded-3xl" />
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  )
}
