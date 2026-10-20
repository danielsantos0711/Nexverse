import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { HashIcon, LinkIcon, PlusIcon } from "lucide-react"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { KIND_ICONS, PageTitle, SectionHead } from "@/components/hub/bits"
import { Item, Stagger } from "@/components/hub/motion"
import { ResourceIndex } from "@/components/hub/resource-index"
import { HubItem } from "@/components/hub/hub-item"
import { FeedMeta, FeedUnavailable } from "@/components/live/bits"
import { GitHubRepoCard } from "@/components/live/github-repo-card"
import { CardsSkeleton, RowsSkeleton } from "@/components/live/skeletons"
import { KINDS, type ResourceKind } from "@/lib/data"
import { Copy } from "@/components/content/copy"
import { isHubId } from "@/lib/refs"
import { ghTopicHref, githubTopicRepos, githubTrendingAi, type Feed, type GhRepo } from "@/lib/live"

/** Where each list sits in the Nexverse galaxy, for the eyebrow over its title. */
const WORLD: Record<ResourceKind | "all", string> = {
  model: "The planet of models",
  dataset: "The planet of datasets",
  tool: "The planet of tools",
  repo: "The moons of open source",
  all: "The whole galaxy",
}

/**
 * What each list shows from GitHub next to members' work: open-source repositories under a fitting topic, most
 * starred first. Each one opens on Nexverse (/gh/owner/repo) with its README and files.
 */
const LIVE: Record<ResourceKind | "all", { title: string; lead: string; topic: string | null; mode: "new" | "active" }> = {
  model: { title: "Open model code on GitHub", lead: "Repositories under #llm pushed to this week: training, fine-tuning and serving code for open models.", topic: "llm", mode: "active" },
  dataset: { title: "Datasets on GitHub", lead: "Repositories under #datasets pushed to this week.", topic: "datasets", mode: "active" },
  tool: { title: "AI tools on GitHub", lead: "Repositories under #ai-tools pushed to this week.", topic: "ai-tools", mode: "active" },
  repo: { title: "Rising on GitHub", lead: "New open-source AI repositories from the last 30 days, most starred first.", topic: null, mode: "new" },
  all: { title: "Rising on GitHub", lead: "New open-source AI repositories from the last 30 days, most starred first.", topic: null, mode: "new" },
}

export function ResourceListPage({ kind }: { kind?: ResourceKind }) {
  const Icon = kind ? KIND_ICONS[kind] : null
  const live = LIVE[kind ?? "all"]
  return (
    <div className="shell pb-16">
      <PageTitle
        k={`${kind ?? "explore"}.header`}
        backdrop="warp"
        eyebrow={
          <span className="inline-flex items-center gap-1.5">
            {Icon && <Icon aria-hidden className="size-4" />} {WORLD[kind ?? "all"]}
          </span>
        }
        title={kind ? KINDS[kind].plural : "Explore the hub"}
        lead={
          kind
            ? `${KINDS[kind].blurb} Published or shared by members, next to what is moving on GitHub.`
            : "Every model, dataset, tool and repo members published or shared on Nexverse, in one place, next to what is rising on GitHub."
        }
      >
        <div className="mt-1 flex flex-wrap gap-2">
          <Link href={kind ? `/new/project?kind=${kind}` : "/new/project"} className="halo-btn">
            <PlusIcon aria-hidden className="size-4" /> Publish {kind ? `a ${KINDS[kind].label.toLowerCase()}` : "a project"}
          </Link>
          <Link href={kind ? `/share?kind=${kind}` : "/share"} className="liquid-glass-pill inline-flex h-9 items-center gap-1.5 px-4 text-sm focus-visible:outline-2 focus-visible:outline-ring">
            <LinkIcon aria-hidden className="size-4" /> Share a link
          </Link>
        </div>
      </PageTitle>

      <section aria-labelledby="members-h" className="flex flex-col gap-4">
        <h2 id="members-h" className="section-glow text-xl font-semibold">
          <Copy k={`${kind ?? "explore"}.members`}>{kind ? `${KINDS[kind].plural} charted by members` : "Charted by members"}</Copy>
        </h2>
        <Suspense fallback={<RowsSkeleton rows={4} />}>
          <ResourceIndex kind={kind} />
        </Suspense>
      </section>

      <section aria-labelledby="gh-h" className="horizon-rule mt-14 pt-10">
        <SectionHead id="gh-h" title={live.title} href={live.topic ? ghTopicHref(live.topic) : "/trending#repos"} action={live.topic ? `More on #${live.topic}` : "Trending"}>
          <p className="text-sm text-muted-foreground">{live.lead}</p>
        </SectionHead>
        <Suspense fallback={<CardsSkeleton cards={6} />}>
          <LiveRepos kind={kind} />
        </Suspense>
      </section>
    </div>
  )
}

async function LiveRepos({ kind }: { kind?: ResourceKind }) {
  const live = LIVE[kind ?? "all"]
  const feed: Feed<GhRepo> = live.topic ? await githubTopicRepos(live.topic, live.mode, 9) : await githubTrendingAi(9)
  return (
    <div className="flex flex-col gap-4">
      <FeedMeta feed={feed} />
      {feed.items.length ? (
        <Stagger as="ol" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {feed.items.slice(0, 9).map((r, i) => (
            <Item as="li" key={r.fullName}>
              <GitHubRepoCard repo={r} rank={live.mode === "new" ? i + 1 : undefined} date={live.mode === "new" ? "created" : "pushed"} />
            </Item>
          ))}
        </Stagger>
      ) : feed.ok ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
          GitHub has nothing new under this topic this week.{" "}
          <Link href="/gh/topics" className="text-ion hover:underline">
            Browse other topics
          </Link>
        </p>
      ) : (
        <FeedUnavailable source="github" />
      )}
      {live.topic && (
        <Link href={ghTopicHref(live.topic)} className="inline-flex items-center gap-1 self-start text-sm text-ion hover:underline">
          <HashIcon aria-hidden className="size-3.5" /> {live.topic} on Nexverse
        </Link>
      )}
    </div>
  )
}

/**
 * Detail pages live at /models/<id> and friends. Ids are database ids, unknown at build time, so one placeholder
 * id lets the route be checked during the build; it renders the "not here" state. Old sample slugs 404.
 */
export function resourceParams() {
  return [{ slug: "00000000-0000-4000-8000-000000000000", rest: [] as string[] }]
}

export function resourceTitle(kind: ResourceKind) {
  return KINDS[kind].label
}

type DetailParams = Promise<{ slug: string; rest?: string[] }>

/** A project (with its tabs as sub-paths) or a shared link, under /models/<id>, /datasets/<id> … */
export function ResourceDetailPage({ kind, params }: { kind: ResourceKind; params: DetailParams }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ResourceDetail kind={kind} params={params} />
    </Suspense>
  )
}

async function ResourceDetail({ kind, params }: { kind: ResourceKind; params: DetailParams }) {
  const { slug, rest } = await params
  if (!isHubId(slug)) notFound()
  return <HubItem kind={kind} id={slug.toLowerCase()} rest={(rest ?? []).map((s) => decodeURIComponent(s))} />
}
