import Link from "next/link"
import { Suspense } from "react"
import { HashIcon, StarIcon } from "lucide-react"
import { SectionHead } from "@/components/hub/bits"
import { Item, Stagger } from "@/components/hub/motion"
import { FeedMeta, FeedUnavailable } from "@/components/live/bits"
import { GitHubRepoCard } from "@/components/live/github-repo-card"
import { CardsSkeleton } from "@/components/live/skeletons"
import { Skeleton } from "@/components/ui/skeleton"
import { compact } from "@/lib/data"
import { ghHref, ghTopicHref, githubTopicRepos, githubTrendingAi } from "@/lib/live"
import { getGhTopics, getMoreGhTopics } from "@/lib/lists/server"

/*
 * Code › GitHub (round 12: what /gh/topics and the "Rising on GitHub" band of /repos were). Open-source AI on
 * GitHub, read inside Nexverse: every card opens /gh/<owner>/<repo> with its README, files and downloads here.
 */
export function GitHubTab() {
  return (
    <div className="flex flex-col gap-12">
      <section aria-labelledby="gh-rising">
        <SectionHead id="gh-rising" title="Rising this month" href="/trending#repos" action="Trending">
          <p className="text-sm text-muted-foreground">New open-source AI repositories, ranked by stars per day.</p>
        </SectionHead>
        <Suspense fallback={<CardsSkeleton cards={6} />}>
          <Rising />
        </Suspense>
      </section>
      <section aria-labelledby="gh-topics">
        <SectionHead id="gh-topics" title="By topic">
          <p className="text-sm text-muted-foreground">The most starred new projects in each corner of open-source AI.</p>
        </SectionHead>
        <Suspense fallback={<CardsSkeleton cards={6} />}>
          <Topics />
        </Suspense>
      </section>
    </div>
  )
}

async function Rising() {
  const feed = await githubTrendingAi(9)
  if (!feed.items.length) return feed.ok ? <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">Nothing new on GitHub this month yet.</p> : <FeedUnavailable source="github" />
  return (
    <div className="flex flex-col gap-3">
      <FeedMeta feed={feed} />
      <Stagger as="ol" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {feed.items.slice(0, 9).map((r, i) => (
          <Item as="li" key={r.fullName}>
            <GitHubRepoCard repo={r} rank={i + 1} date="created" />
          </Item>
        ))}
      </Stagger>
    </div>
  )
}

async function Topics() {
  // The admins' lists (/admin/lists), cached with the rest of the site content.
  const [topics, more] = await Promise.all([getGhTopics(), getMoreGhTopics()])
  return (
    <div className="flex flex-col gap-5">
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {topics.map((t) => (
          <li key={t.id} className="relative flex flex-col gap-3 rounded-xl border border-border bg-card/60 p-4 transition-colors hover:bg-card">
            <div className="flex flex-col gap-0.5">
              <Link href={ghTopicHref(t.id)} className="inline-flex items-center gap-1.5 font-semibold after:absolute after:inset-0">
                <HashIcon aria-hidden className="size-4 text-repo" />
                {t.label}
              </Link>
              <p className="line-clamp-1 text-sm text-muted-foreground">{t.blurb}</p>
            </div>
            <Suspense fallback={<TopThreeSkeleton />}>
              <TopThree topic={t.id} />
            </Suspense>
          </li>
        ))}
      </ul>
      {more.length > 0 && (
        <ul aria-label="More topics" className="flex flex-wrap gap-1.5">
          {more.map((t) => (
            <li key={t}>
              <Link href={ghTopicHref(t)} className="inline-flex items-center gap-1 rounded-full bg-white/[0.04] px-3 py-1 text-sm text-muted-foreground ring-1 ring-white/[0.06] transition-colors hover:text-foreground">
                <HashIcon aria-hidden className="size-3.5 text-repo" />
                {t}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** The three most starred new repositories in a topic, as a teaser on its card. */
async function TopThree({ topic }: { topic: string }) {
  // Same arguments as /trending and the topic page, so the cache entry is shared.
  const feed = await githubTopicRepos(topic, "new", 12)
  if (!feed.items.length) return <p className="text-xs text-muted-foreground">{feed.ok ? "Nothing new this month yet." : "GitHub is not answering right now."}</p>
  return (
    <ol className="relative z-10 flex flex-col gap-1 border-t border-border pt-2.5">
      {feed.items.slice(0, 3).map((r) => (
        <li key={r.fullName} className="flex items-center justify-between gap-3 text-sm">
          <Link href={ghHref(r.owner, r.name)} className="min-w-0 truncate hover:underline">
            <span className="text-muted-foreground">{r.owner}/</span>
            {r.name}
          </Link>
          <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground tabular">
            <StarIcon aria-hidden className="size-3" />
            {compact(r.stars)}
            <span className="sr-only"> stars</span>
          </span>
        </li>
      ))}
    </ol>
  )
}

function TopThreeSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="flex flex-col gap-2 border-t border-border pt-2.5">
      <Skeleton className="h-4 w-4/5" />
      <Skeleton className="h-4 w-3/5" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  )
}
