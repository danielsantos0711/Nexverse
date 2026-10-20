import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { HashIcon, LayersIcon, NewspaperIcon } from "lucide-react"
import { PageTitle, SectionHead } from "@/components/hub/bits"
import { HubTrending } from "@/components/hub/hub-trending"
import { StoryCard } from "@/components/news/story-card"
import { Item, Stagger } from "@/components/hub/motion"
import { FeedMeta, FeedUnavailable } from "@/components/live/bits"
import { GitHubRepoCard } from "@/components/live/github-repo-card"
import { PillTabs } from "@/components/live/pill-tabs"
import { ReleaseList } from "@/components/live/release-list"
import { CardsSkeleton, RowsSkeleton, StripSkeleton } from "@/components/live/skeletons"
import { latestStories } from "@/lib/newsroom/public"
import { TrendingNowLive } from "@/components/live/trending-now"
import { GH_TOPICS, ghTopicHref, githubReleases, githubTopicRepos, githubTrendingAi, type Feed, type GhRepo } from "@/lib/live"
import { seoMetadata } from "@/lib/content-server"
import { Copy } from "@/components/content/copy"

export async function generateMetadata(): Promise<Metadata> {
  return seoMetadata("/trending", {
    title: "Trending",
    description: "Live: the open-source AI repositories rising on GitHub, fresh releases, the newest Nexverse newsroom stories and what the community is into right now.",
  })
}

const SECTIONS = [
  { id: "repos", label: "GitHub" },
  { id: "releases", label: "Releases" },
  { id: "news", label: "News" },
  { id: "hub", label: "On Nexverse" },
] as const

function Section({ id, title, lead, href, action, children }: { id: string; title: string; lead: string; href?: string; action?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`${id}-title`} id={id} className="scroll-mt-24 border-t border-border pt-10">
      <SectionHead id={`${id}-title`} title={title} href={href} action={action}>
        <p className="text-sm text-muted-foreground">{lead}</p>
      </SectionHead>
      {children}
    </section>
  )
}

function RepoGrid({ feed, limit = 9, more }: { feed: Feed<GhRepo>; limit?: number; more?: { href: string; label: string } }) {
  return (
    <div className="flex flex-col gap-4">
      <FeedMeta feed={feed} />
      {feed.items.length ? (
        <Stagger as="ol" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {feed.items.slice(0, limit).map((r, i) => (
            <Item as="li" key={r.fullName}>
              <GitHubRepoCard repo={r} rank={i + 1} date="created" />
            </Item>
          ))}
        </Stagger>
      ) : feed.ok ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground"><Copy k="trending.page.nothing-new-here-this-month">Nothing new here this month yet.</Copy></p>
      ) : (
        <FeedUnavailable source="github" />
      )}
      {more && (
        <Link href={more.href} className="self-start text-sm text-ion hover:underline">
          {more.label} →
        </Link>
      )}
    </div>
  )
}

async function Repos() {
  const [all, ...byTopic] = await Promise.all([githubTrendingAi(9), ...GH_TOPICS.map((t) => githubTopicRepos(t.id, "new", 12))])
  return (
    <PillTabs
      label="Topics"
      tabs={[
        { id: "all", label: "All topics", icon: <LayersIcon aria-hidden className="size-3.5" />, content: <RepoGrid feed={all} more={{ href: "/gh/topics", label: "Browse every topic" }} /> },
        ...GH_TOPICS.map((t, i) => ({
          id: t.id,
          label: t.label,
          icon: <HashIcon aria-hidden className="size-3.5" />,
          content: <RepoGrid feed={byTopic[i]} more={{ href: ghTopicHref(t.id), label: `More on #${t.id}` }} />,
        })),
      ]}
    />
  )
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
    <div className="shell pb-16">
      <PageTitle k="trending.header"
        eyebrow={<Copy k="trending.header.eyebrow">Live from GitHub, the newsroom and the hub itself</Copy>}
        title="Trending"
        lead="The open-source AI projects gathering stars, the releases that just shipped, the newsroom’s latest stories and what people here are talking about. Repositories open on Nexverse with their READMEs and files, refreshed through the day."
      >
        <nav aria-label="Sections" className="mt-1 flex flex-wrap gap-2">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="glass rounded-full px-3 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
              {s.label}
            </a>
          ))}
        </nav>
      </PageTitle>

      <div className="mb-10">
        <Suspense fallback={<StripSkeleton />}>
          <TrendingNowLive />
        </Suspense>
      </div>

      <div className="flex flex-col gap-14">
        <Section id="repos" title="Rising on GitHub" lead="New open-source AI repositories from the last 30 days, most starred first." href="/gh/topics" action="All topics">
          <Suspense fallback={<CardsSkeleton cards={6} />}>
            <Repos />
          </Suspense>
        </Section>
        <Section id="releases" title="Fresh releases" lead="What just shipped in the projects much of the open AI stack runs on.">
          <Suspense fallback={<RowsSkeleton rows={8} />}>
            <Releases />
          </Suspense>
        </Section>
        <Section id="news" title="From the newsroom" lead="Short, sourced stories on launches, research, policy and tools, checked by an editor." href="/news" action="All news">
          <Suspense fallback={<CardsSkeleton cards={3} />}>
            <Newsroom />
          </Suspense>
        </Section>
        <Section id="hub" title="Popular on Nexverse" lead="What members published, shared and liked, and the newest threads in the forum." href="/explore" action="Explore the hub">
          <HubTrending />
        </Section>
      </div>
    </div>
  )
}
