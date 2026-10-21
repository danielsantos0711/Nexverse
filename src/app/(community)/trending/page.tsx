import type { Metadata } from "next"
import { AreaCrumbs } from "@/components/site/area-crumbs"
import Link from "next/link"
import { Suspense } from "react"
import { NewspaperIcon } from "lucide-react"
import { PageTitle, SectionHead } from "@/components/hub/bits"
import { HubTrending } from "@/components/hub/hub-trending"
import { StoryCard } from "@/components/news/story-card"
import { Item, Stagger } from "@/components/hub/motion"
import { FeedMeta, FeedUnavailable } from "@/components/live/bits"
import { ReleaseList } from "@/components/live/release-list"
import { CardsSkeleton, RowsSkeleton, StripSkeleton } from "@/components/live/skeletons"
import { GithubRising } from "@/components/trending/github-rising"
import { NexverseRising } from "@/components/trending/nexverse-rising"
import { Reveal } from "@/components/trending/reveal"
import { SectionNav } from "@/components/trending/section-nav"
import { TrendingMarquee, type MarqueeChip } from "@/components/trending/trending-marquee"
import { compact } from "@/lib/data"
import { latestStories } from "@/lib/newsroom/public"
import { categoryInfo, storyHref } from "@/lib/newsroom"
import { ghHref, githubReleases, githubRising, githubTrendingAi } from "@/lib/live"
import { seoMetadata } from "@/lib/content-server"
import { Copy } from "@/components/content/copy"

export async function generateMetadata(): Promise<Metadata> {
  return seoMetadata("/trending", {
    title: "Trending",
    description: "What is rising on Nexverse first, then the newsroom's latest stories, the open-source AI repositories gaining stars fastest on GitHub and fresh releases.",
  })
}

/** Nexverse first: the site's own momentum and stories lead, outside sources follow. */
const SECTIONS = [
  { id: "nexverse", label: "Rising in Nexverse" },
  { id: "news", label: "Newsroom" },
  { id: "hub", label: "Fresh on Nexverse" },
  { id: "repos", label: "Rising on GitHub" },
  { id: "releases", label: "Releases" },
]

function Section({ id, title, lead, href, action, tint, children }: { id: string; title: string; lead: string; href?: string; action?: string; tint?: "ion" | "gold" | "repo"; children: React.ReactNode }) {
  return (
    <div data-sky={tint === "gold" ? "gold" : tint === "repo" ? "nova" : "ion"}>
    <Reveal id={id} tint={tint} className="border-t border-border pt-10">
      <SectionHead id={`${id}-title`} title={title} href={href} action={action}>
        <p className="text-sm text-muted-foreground">{lead}</p>
      </SectionHead>
      {children}
    </Reveal>
    </div>
  )
}

async function Marquee() {
  // The same arguments as /news, so both share one cache entry.
  const [repos, news] = await Promise.all([githubTrendingAi(8), latestStories(60)])
  const outside: MarqueeChip[] = [
    ...news.items.slice(0, 6).map((s) => ({ key: `n-${s.id}`, href: storyHref(s), label: s.title, source: "news" as const, metric: categoryInfo(s.category).one })),
    ...repos.items.map((r) => ({ key: `gh-${r.fullName}`, href: ghHref(r.owner, r.name), label: r.fullName, source: "github" as const, metric: compact(r.stars) })),
  ]
  return <TrendingMarquee outside={outside} />
}

async function Repos() {
  const feed = await githubRising(60)
  if (!feed.items.length) return feed.ok ? <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">Nothing new on GitHub under these topics this month.</p> : <FeedUnavailable source="github" />
  return <GithubRising repos={feed.items} topics={feed.topics} fetchedAt={feed.fetchedAt} />
}

async function Releases() {
  const feed = await githubReleases(8)
  return (
    <div className="flex flex-col gap-4">
      <FeedMeta feed={feed} />
      {feed.items.length ? <ReleaseList items={feed.items} /> : <FeedUnavailable source="github" />}
    </div>
  )
}

async function Newsroom() {
  // The same arguments as /news, so both share one cache entry.
  const { items } = await latestStories(60)
  if (!items.length) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
        <NewspaperIcon aria-hidden className="size-5 text-gold" />
        <p><Copy k="trending.page.the-newsroom-has-not-published" multiline>The newsroom has not published its first story yet. It writes short, sourced stories from official blogs and releases, checked by an editor.</Copy></p>
        <Link href="/news#tip" className="text-ion hover:underline">
          <Copy k="trending.page.send-the-editors-a-tip">Send the editors a tip →</Copy>
        </Link>
      </div>
    )
  }
  return (
    <Stagger as="ol" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" gap={0.04}>
      {items.slice(0, 6).map((s) => (
        <Item as="li" key={s.id}>
          <StoryCard story={s} />
        </Item>
      ))}
    </Stagger>
  )
}

export default function TrendingPage() {
  return (
    <div data-flow="tilt" className="sd-flow shell pb-16">
      <PageTitle k="trending.header"
        eyebrow={<span className="flex flex-wrap items-center gap-x-2.5 gap-y-1"><AreaCrumbs /><span aria-hidden className="opacity-40">·</span><Copy k="trending.header.eyebrow">Nexverse first, then the rest of the open AI world</Copy></span>}
        title="Trending"
        lead="What members are viewing, liking and discussing on Nexverse right now, the newsroom’s latest stories, then the open-source AI projects gaining stars fastest on GitHub and the releases that just shipped."
      />

      <div className="mb-6">
        <Suspense fallback={<StripSkeleton />}>
          <Marquee />
        </Suspense>
      </div>

      <SectionNav sections={SECTIONS} className="mb-6" />

      <div className="flex flex-col gap-14">
        <Section id="nexverse" tint="ion" title="Rising in Nexverse" lead="Projects, threads, links and code gaining attention here, from real views, likes, saves, downloads, replies and stars. Recent days count more." href="/explore" action="Explore the hub">
          <NexverseRising />
        </Section>
        <Section id="news" tint="gold" title="From the newsroom" lead="Sourced stories on launches, research, policy and tools, checked by an editor." href="/news" action="All news">
          <Suspense fallback={<CardsSkeleton cards={3} />}>
            <Newsroom />
          </Suspense>
        </Section>
        <Section id="hub" tint="ion" title="Fresh on Nexverse" lead="The newest projects and links members published, and the latest threads in the forum." href="/explore" action="Everything on the hub">
          <HubTrending />
        </Section>
        <Section id="repos" tint="repo" title="Rising on GitHub" lead="New open-source AI repositories ranked by stars per day, across the topics Nexverse follows plus two that rotate every six hours." href="/gh/topics" action="All topics">
          <Suspense fallback={<CardsSkeleton cards={6} />}>
            <Repos />
          </Suspense>
        </Section>
        <Section id="releases" tint="gold" title="Fresh releases" lead="What just shipped in the projects much of the open AI stack runs on.">
          <Suspense fallback={<RowsSkeleton rows={8} />}>
            <Releases />
          </Suspense>
        </Section>
      </div>
    </div>
  )
}
