import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { HashIcon, StarIcon } from "lucide-react"
import { PageTitle, SectionHead } from "@/components/hub/bits"
import { Item, Spotlight, Stagger } from "@/components/hub/motion"
import { Skeleton } from "@/components/ui/skeleton"
import { compact } from "@/lib/data"
import { ghHref, ghTopicHref, githubTopicRepos } from "@/lib/live"
import { getGhTopics, getMoreGhTopics } from "@/lib/lists/server"
import { seoMetadata } from "@/lib/content-server"
import { Copy } from "@/components/content/copy"

export async function generateMetadata(): Promise<Metadata> {
  return seoMetadata("/gh/topics", {
    title: "GitHub topics",
    description: "Open-source AI on GitHub by topic: LLMs, agents, RAG, diffusion and machine learning, with the projects rising in each, readable on Nexverse.",
  })
}

/** The three most starred new repositories in a topic, as a teaser on its card. */
async function Rising({ topic }: { topic: string }) {
  // Same arguments as /trending, so the cache entry is shared.
  const feed = await githubTopicRepos(topic, "new", 12)
  if (!feed.items.length) return <p className="text-xs text-muted-foreground">{feed.ok ? "Nothing new this month yet." : "GitHub is not answering right now."}</p>
  return (
    <ol className="relative z-10 flex flex-col gap-1">
      {feed.items.slice(0, 3).map((r) => (
        <li key={r.fullName} className="flex items-center justify-between gap-3 text-sm">
          <Link href={ghHref(r.owner, r.name)} className="min-w-0 truncate hover:underline">
            <span className="text-muted-foreground">{r.owner}/</span>
            {r.name}
          </Link>
          <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground tabular">
            <StarIcon aria-hidden className="size-3" />
            {compact(r.stars)}
            <span className="sr-only"> <Copy k="gh-topics.page.stars">stars</Copy></span>
          </span>
        </li>
      ))}
    </ol>
  )
}

function RisingSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="flex flex-col gap-2">
      <Skeleton className="h-4 w-4/5" />
      <Skeleton className="h-4 w-3/5" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  )
}

export default async function TopicsPage() {
  // The admins' lists (/admin/lists), cached with the rest of the site content.
  const [GH_TOPICS, MORE_GH_TOPICS] = await Promise.all([getGhTopics(), getMoreGhTopics()])
  return (
    <div className="shell pb-16">
      <PageTitle k="gh-topics.header"
        eyebrow={<Copy k="gh-topics.header.eyebrow">Live from GitHub</Copy>}
        title="Topics"
        lead="Open-source AI by subject. Each topic shows the most starred projects people are working on this week and the new ones rising this month, all readable here on Nexverse."
      />
      <Stagger as="ul" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {GH_TOPICS.map((t) => (
          <Item as="li" key={t.id}>
            <Spotlight className="relative flex h-full flex-col gap-3 rounded-2xl border border-border bg-card/70 p-5 transition-colors hover:bg-card">
              <div className="flex flex-col gap-1">
                <Link href={ghTopicHref(t.id)} className="inline-flex items-center gap-1.5 text-lg font-semibold after:absolute after:inset-0">
                  <HashIcon aria-hidden className="size-4 text-repo" />
                  {t.label}
                </Link>
                <p className="text-sm text-muted-foreground">{t.blurb}</p>
              </div>
              <div className="mt-auto flex flex-col gap-1.5 border-t border-border pt-3">
                <span className="text-xs font-medium text-muted-foreground"><Copy k="gh-topics.page.rising-this-month">Rising this month</Copy></span>
                <Suspense fallback={<RisingSkeleton />}>
                  <Rising topic={t.id} />
                </Suspense>
              </div>
            </Spotlight>
          </Item>
        ))}
      </Stagger>

      <section aria-labelledby="more-topics" className="mt-14">
        <SectionHead id="more-topics" title="More topics">
          <p className="text-sm text-muted-foreground"><Copy k="gh-topics.page.other-corners-of-open-source">Other corners of open-source AI worth a look.</Copy></p>
        </SectionHead>
        <ul className="flex flex-wrap gap-2">
          {MORE_GH_TOPICS.map((t) => (
            <li key={t}>
              <Link href={ghTopicHref(t)} className="glass inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
                <HashIcon aria-hidden className="size-3.5 text-repo" />
                {t}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
