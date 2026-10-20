import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { FolderGit2Icon, HashIcon } from "lucide-react"
import { SectionHead } from "@/components/hub/bits"
import { Item, Stagger } from "@/components/hub/motion"
import { FeedMeta, FeedUnavailable } from "@/components/live/bits"
import { DetailBanner, DiscussButton, SourceLink } from "@/components/live/detail"
import { GitHubRepoCard } from "@/components/live/github-repo-card"
import { CardsSkeleton } from "@/components/live/skeletons"
import { ghTopicHref, githubTopicRepos } from "@/lib/live"
import { getGhTopics, getMoreGhTopics, getTopicInfo } from "@/lib/lists/server"
import { discussItemHref, isGhTopic, segment } from "@/lib/live/ids"
import { Copy } from "@/components/content/copy"

/** One sample, so the shell is prerendered; every other topic renders on request. */
export function generateStaticParams() {
  return [{ topic: "llm" }]
}

type Params = Promise<{ topic: string }>

async function read(params: Params) {
  const raw = segment((await params).topic)
  const topic = raw?.toLowerCase() ?? ""
  return isGhTopic(topic) ? topic : null
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const topic = await read(params)
  if (!topic) return { title: "Topic not found" }
  const info = await getTopicInfo(topic)
  return {
    title: `#${topic} on GitHub`,
    description: info?.blurb ?? `Open-source repositories tagged ${topic} on GitHub: the most starred active projects and the new ones rising, on Nexverse.`,
  }
}

const crumbs = [
  {
    href: "/gh/topics",
    label: (
      <>
        <FolderGit2Icon aria-hidden className="size-4" /> GitHub topics
      </>
    ),
  },
]

async function RepoSection({ topic, mode }: { topic: string; mode: "active" | "new" }) {
  const feed = await githubTopicRepos(topic, mode, mode === "new" ? 12 : 18)
  return (
    <div className="flex flex-col gap-4">
      <FeedMeta feed={feed} />
      {feed.items.length ? (
        <Stagger as="ol" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {feed.items.map((r, i) => (
            <Item as="li" key={r.fullName}>
              <GitHubRepoCard repo={r} rank={i + 1} date={mode === "new" ? "created" : "pushed"} />
            </Item>
          ))}
        </Stagger>
      ) : feed.ok ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
          {mode === "new" ? "No new repositories with this topic this month." : "No active repositories with this topic right now."}
        </p>
      ) : (
        <FeedUnavailable source="github" />
      )}
    </div>
  )
}

async function Related({ topic }: { topic: string }) {
  const [featured, more] = await Promise.all([getGhTopics(), getMoreGhTopics()])
  const list = [...new Set([...featured.map((t) => t.id), ...more])].filter((t) => t !== topic)
  return (
    <section aria-labelledby="related-topics" className="border-t border-border pt-10">
      <SectionHead id="related-topics" title="Related topics" />
      <ul className="flex flex-wrap gap-2">
        {list.map((t) => (
          <li key={t}>
            <Link href={ghTopicHref(t)} className="glass inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
              <HashIcon aria-hidden className="size-3.5 text-repo" />
              {t}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

async function Topic({ params }: { params: Params }) {
  const topic = await read(params)
  if (!topic) notFound()
  const info = await getTopicInfo(topic)
  const discuss = discussItemHref(`#${topic}: what are you using?`, `Open-source ${info?.label ?? topic} projects worth knowing.\n\n${ghTopicHref(topic)}`)
  return (
    <>
      <DetailBanner seed={`gh-topic-${topic}`} kind="repo" crumbs={crumbs}>
        <div className="flex flex-col gap-2">
          <h1 className="inline-flex items-center gap-2 text-2xl font-semibold tracking-[-0.03em] break-all md:text-4xl">
            <HashIcon aria-hidden className="size-6 shrink-0 text-repo md:size-8" />
            {topic}
          </h1>
          <p className="max-w-[70ch] text-muted-foreground">
            {info?.blurb ?? `Open-source repositories on GitHub tagged “${topic}”: the most starred projects active this week and the new ones rising this month.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DiscussButton href={discuss} />
        </div>
      </DetailBanner>
      <div className="shell flex flex-col gap-14 pt-10">
        <section aria-labelledby="active-title">
          <SectionHead id="active-title" title="Most starred, active this week">
            <p className="text-sm text-muted-foreground"><Copy k="gh-topic.page.established-projects-with-a-push">Established projects with a push in the last seven days.</Copy></p>
          </SectionHead>
          <Suspense fallback={<CardsSkeleton cards={6} />}>
            <RepoSection topic={topic} mode="active" />
          </Suspense>
        </section>
        <section aria-labelledby="new-title" className="border-t border-border pt-10">
          <SectionHead id="new-title" title="New and rising this month">
            <p className="text-sm text-muted-foreground"><Copy k="gh-topic.page.created-in-the-last-30">Created in the last 30 days, most starred first.</Copy></p>
          </SectionHead>
          <Suspense fallback={<CardsSkeleton cards={6} />}>
            <RepoSection topic={topic} mode="new" />
          </Suspense>
        </section>
        <Related topic={topic} />
        <SourceLink href={`https://github.com/topics/${topic}`} label="View the topic on GitHub" />
      </div>
    </>
  )
}

function TopicSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="shell flex flex-col gap-8 pt-14">
      <CardsSkeleton cards={6} />
    </div>
  )
}

export default function Page({ params }: { params: Params }) {
  return (
    <Suspense fallback={<TopicSkeleton />}>
      <Topic params={params} />
    </Suspense>
  )
}
