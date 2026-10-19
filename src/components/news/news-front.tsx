import Link from "next/link"
import { BadgeCheckIcon, CircleHelpIcon, FlagIcon, NewspaperIcon, SendIcon, SparklesIcon } from "lucide-react"
import { Item, Stagger } from "@/components/hub/motion"
import { PillTabs } from "@/components/live/pill-tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { NEWS_CATEGORIES, type Story } from "@/lib/newsroom"
import { latestStories } from "@/lib/newsroom/public"
import { FeatureStory, StoryCard, StoryRow } from "./story-card"

/*
 * The front of /news: the "Nexverse Exclusive" lead, the next top stories, and every story by category.
 * Stories come from the newsroom (cached, refreshed on publish). With none published yet the page says so
 * plainly and explains how stories get here, instead of filling the space with anything else.
 */

function Grid({ stories, empty }: { stories: Story[]; empty: string }) {
  if (!stories.length) return <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">{empty}</p>
  return (
    <Stagger as="ol" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" gap={0.04}>
      {stories.map((s) => (
        <Item as="li" key={s.id}>
          <StoryCard story={s} />
        </Item>
      ))}
    </Stagger>
  )
}

export async function NewsFront() {
  const { ok, items } = await latestStories(60)

  if (!items.length) return <EmptyNewsroom unavailable={!ok} />

  const lead = items.find((s) => s.featured) ?? items[0]
  const rest = items.filter((s) => s.id !== lead.id)
  const top = rest.slice(0, 3)

  return (
    <div className="flex flex-col gap-12">
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <FeatureStory story={lead} />
        {top.length > 0 && (
          <aside aria-labelledby="top-h" className="flex flex-col">
            <h2 id="top-h" className="mb-1 text-sm font-medium text-muted-foreground">
              Also today
            </h2>
            <ol className="flex flex-col divide-y divide-border">
              {top.map((s) => (
                <li key={s.id}>
                  <StoryRow story={s} />
                </li>
              ))}
            </ol>
          </aside>
        )}
      </div>

      <section aria-labelledby="all-h" className="flex flex-col gap-5">
        <h2 id="all-h" className="text-xl font-semibold md:text-2xl">
          Every story
        </h2>
        <PillTabs
          label="Categories"
          tabs={[
            { id: "all", label: "All", count: items.length, content: <Grid stories={items} empty="" /> },
            ...NEWS_CATEGORIES.map((c) => {
              const list = items.filter((s) => s.category === c.id)
              return {
                id: c.id,
                label: c.label,
                count: list.length,
                icon: c.id === "rumor" ? <CircleHelpIcon aria-hidden className="size-3.5" /> : undefined,
                content: (
                  <div className="flex flex-col gap-4">
                    <p className="text-sm text-muted-foreground">{c.blurb}</p>
                    <Grid stories={list} empty={`No ${c.label.toLowerCase()} stories yet.`} />
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
        {unavailable ? "The newsroom is not switched on yet" : "The first story is still being written"}
      </h2>
      <p className="mt-3 max-w-[60ch] text-muted-foreground">
        {unavailable
          ? "Nexverse's own news needs the newsroom part of the database, which is not set up on this copy of the site yet. Members' shared stories below work already."
          : "Nexverse's newsroom reads official blogs, changelogs and releases every day and writes short, sourced stories. Each one is checked by an editor before it appears here. Nothing has been published yet."}
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        <a href="#tip" className="pressable inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
          <SendIcon aria-hidden className="size-4" /> Send the first tip
        </a>
        <Link href="/share?kind=news" className="pressable inline-flex h-9 items-center rounded-full bg-white/[0.06] px-4 text-sm hover:bg-white/[0.1] focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
          Share a story you read
        </Link>
      </div>
    </section>
  )
}

/** How a story gets here, in four lines: the newsroom's promise to readers. */
export function HowWeReport() {
  const points = [
    { icon: BadgeCheckIcon, title: "Official sources only", body: "Vendor blogs, changelogs and releases. Every story links to what it is based on." },
    { icon: SparklesIcon, title: "Written with AI, checked by people", body: "A free AI model drafts from the sources; an editor reads, corrects and publishes." },
    { icon: CircleHelpIcon, title: "Rumours are labelled", body: "Leaks and reports the company has not confirmed always carry an Unconfirmed badge." },
    { icon: FlagIcon, title: "Corrections welcome", body: "Spot a mistake? Report the story and an editor will look at it." },
  ]
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {points.map((p) => (
        <li key={p.title} className="flex flex-col gap-1.5 rounded-2xl border border-border bg-card/40 p-4">
          <p.icon aria-hidden className="size-4 text-ion" />
          <h3 className="text-sm font-medium">{p.title}</h3>
          <p className="text-sm text-muted-foreground">{p.body}</p>
        </li>
      ))}
    </ul>
  )
}

export function NewsFrontSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading the news" className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <Skeleton className="h-[22rem] rounded-3xl" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    </div>
  )
}
