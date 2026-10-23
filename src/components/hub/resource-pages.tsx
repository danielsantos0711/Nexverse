import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { GitBranchIcon, HashIcon, LinkIcon, PlusIcon, SparklesIcon } from "lucide-react"
import { PageSkeleton } from "@/components/app/page-skeleton"
import { SectionHead } from "@/components/hub/bits"
import { Item, Stagger } from "@/components/hub/motion"
import { ResourceIndex } from "@/components/hub/resource-index"
import { RisingStrip } from "@/components/hub/rising-strip"
import { HubItem } from "@/components/hub/hub-item"
import { FeedMeta, FeedUnavailable } from "@/components/live/bits"
import { GitHubRepoCard } from "@/components/live/github-repo-card"
import { CardsSkeleton, RowsSkeleton } from "@/components/live/skeletons"
import { AreaCrumbs } from "@/components/site/area-crumbs"
import { LinkTabs } from "@/components/site/link-tabs"
import { PageHead } from "@/components/site/page-head"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { KINDS, type ResourceKind } from "@/lib/data"
import { isHubId } from "@/lib/refs"
import { ghTopicHref, githubTopicRepos, githubTrendingAi, type Feed, type GhRepo } from "@/lib/live"

/**
 * What each list shows from GitHub next to members' work: open-source repositories under a fitting topic, most
 * starred first. Each one opens on Nexverse (/gh/owner/repo) with its README and files.
 */
const LIVE: Record<ResourceKind | "all", { title: string; lead: string; topic: string | null; mode: "new" | "active" }> = {
  model: { title: "Open model code on GitHub", lead: "Repositories under #llm pushed to this week: training, fine-tuning and serving code for open models.", topic: "llm", mode: "active" },
  dataset: { title: "Datasets on GitHub", lead: "Repositories under #datasets pushed to this week.", topic: "datasets", mode: "active" },
  tool: { title: "AI tools on GitHub", lead: "Repositories under #ai-tools pushed to this week.", topic: "ai-tools", mode: "active" },
  repo: { title: "Rising on GitHub", lead: "New open-source AI repositories from the last 30 days, ranked by stars per day.", topic: null, mode: "new" },
  all: { title: "Rising on GitHub", lead: "New open-source AI repositories from the last 30 days, ranked by stars per day.", topic: null, mode: "new" },
}

type ListParams = Promise<{ [key: string]: string | string[] | undefined }>

/*
 * Models, Datasets and Tools (round 12): a compact header with one primary action (publish), two tabs and the
 * list. "On Nexverse" is what members published or shared, with what is rising this week on top; "On GitHub"
 * (?from=github) is the open-source code for that kind, read inside Nexverse. Nothing else on the page.
 */
export function ResourceListPage({ kind, searchParams }: { kind: ResourceKind; searchParams?: ListParams }) {
  const base = KINDS[kind].path
  return (
    <div data-flow="tilt" className="sd-flow shell pb-16">
      <PageHead
        k={`${kind}.header`}
        crumbs={<AreaCrumbs />}
        title={KINDS[kind].plural}
        lead={KINDS[kind].blurb}
        actions={
          <>
            <Button nativeButton={false} render={<Link href={`/new/project?kind=${kind}`} />}>
              <PlusIcon aria-hidden /> Publish {`a ${KINDS[kind].label.toLowerCase()}`}
            </Button>
            <Button variant="outline" nativeButton={false} render={<Link href={`/share?kind=${kind}`} />}>
              <LinkIcon aria-hidden /> Share a link
            </Button>
          </>
        }
      >
        <Suspense fallback={<Skeleton className="h-10 w-64 rounded-full" />}>
          <ListTabs base={base} searchParams={searchParams} />
        </Suspense>
      </PageHead>
      <Suspense fallback={<RowsSkeleton rows={4} />}>
        <ListBody kind={kind} searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

const fromGithub = async (searchParams?: ListParams) => (searchParams ? (await searchParams).from === "github" : false)

async function ListTabs({ base, searchParams }: { base: string; searchParams?: ListParams }) {
  const gh = await fromGithub(searchParams)
  return (
    <LinkTabs
      label="Where it comes from"
      current={gh ? `${base}?from=github` : base}
      tabs={[
        { href: base, label: "On Nexverse", icon: SparklesIcon },
        { href: `${base}?from=github`, label: "On GitHub", icon: GitBranchIcon },
      ]}
    />
  )
}

async function ListBody({ kind, searchParams }: { kind: ResourceKind; searchParams?: ListParams }) {
  if (await fromGithub(searchParams)) {
    const live = LIVE[kind]
    return (
      <section aria-labelledby="gh-h">
        <SectionHead id="gh-h" title={live.title} href={live.topic ? ghTopicHref(live.topic) : "/code?from=github"} action={live.topic ? `More on #${live.topic}` : "All of GitHub"}>
          <p className="text-sm text-muted-foreground">{live.lead}</p>
        </SectionHead>
        <Suspense fallback={<CardsSkeleton cards={6} />}>
          <LiveRepos kind={kind} />
        </Suspense>
      </section>
    )
  }
  return (
    <>
      <RisingStrip kind={kind} />
      <ResourceIndex kind={kind} />
    </>
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
          <Link href="/code?from=github" className="text-ion hover:underline">
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
